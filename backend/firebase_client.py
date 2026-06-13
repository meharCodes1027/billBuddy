"""
Firebase client module for BillBuddy.
Handles interactions with Google Cloud Firestore database to retrieve user profiles,
bill records, mandate settings, and transaction receipts.
"""

import logging
from typing import Dict, List, Optional
import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

# Initialize Firebase App (lazily initialized or inside a try-catch to allow scaffolding validation)
db = None
try:
    import config
    import os
    
    if not firebase_admin._apps:
        if config.FIREBASE_CREDENTIALS_JSON_PATH and os.path.exists(config.FIREBASE_CREDENTIALS_JSON_PATH):
            cred = credentials.Certificate(config.FIREBASE_CREDENTIALS_JSON_PATH)
            firebase_admin.initialize_app(cred, {
                'projectId': config.FIREBASE_PROJECT_ID,
            })
            logger.info("Firebase Admin initialized successfully using service account JSON certificate.")
        else:
            firebase_admin.initialize_app(options={
                'projectId': config.FIREBASE_PROJECT_ID
            })
            logger.info("Firebase Admin initialized successfully using Application Default Credentials.")
            
    db = firestore.client()
except Exception as e:
    logger.warning(
        f"Firebase credentials not loaded or initialized. Firebase functions will run in sandbox mode: {e}"
    )


# Local SQLite fallback to support dynamic profile saving and retrieval without Firestore
import sqlite3
import json
import os

SQLITE_DB_PATH = "billbuddy.db"

def _get_sqlite_conn():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _init_sqlite():
    conn = _get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            child_phone TEXT,
            parent_phone TEXT,
            parent_name TEXT,
            preferred_language TEXT,
            mandate_limit REAL,
            mandate_token TEXT,
            city TEXT,
            alert_threshold_enabled INTEGER,
            alert_threshold_amount REAL,
            billers TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bills (
            id TEXT PRIMARY KEY,
            user_profile_id TEXT,
            biller_id TEXT,
            biller_name TEXT,
            consumer_number TEXT,
            amount REAL,
            due_date TEXT,
            status TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS receipts (
            id TEXT PRIMARY KEY,
            user_profile_id TEXT,
            bill_id TEXT,
            biller_id TEXT,
            biller_name TEXT,
            amount_paid REAL,
            timestamp TEXT,
            transaction_id TEXT,
            status TEXT
        )
    """)
    
    # Check if empty, populate default sandbox testing user
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        default_billers = [
            {"biller_id": "PSPCL_ELECT", "consumer_number": "1002030405"},
            {"biller_id": "INDANE_GAS", "consumer_number": "987654321"}
        ]
        cursor.execute("""
            INSERT INTO users (id, child_phone, parent_phone, parent_name, preferred_language, mandate_limit, mandate_token, city, alert_threshold_enabled, alert_threshold_amount, billers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "+919872593750", "+919872593750", "+919888322774", "Parent", "Hindi", 5000.0, "pay_mandate_MOCKUPI123", "Chandigarh", 1, 2000.0, json.dumps(default_billers)
        ))
        conn.commit()
    conn.close()

if db is None:
    try:
        _init_sqlite()
        logger.info("SQLite local database fallback initialized successfully.")
    except Exception as sq_err:
        logger.error(f"Failed to initialize local SQLite database: {sq_err}")


async def save_bill(bill_data: Dict) -> str:
    """
    Saves a fetched bill record to the Firestore database or SQLite sandbox.
    """
    logger.info(f"save_bill called with: {bill_data}")
    user_id = bill_data.get('user_profile_id')
    biller_id = bill_data.get('biller_id')
    
    if db:
        bill_id = bill_data.get('id')
        if bill_id:
            doc_ref = db.collection('bills').document(bill_id)
            doc_ref.set(bill_data)
            return bill_id
            
        # Clean up any existing duplicate docs for the same user and operator in Firestore
        if user_id and biller_id:
            try:
                existing_docs = db.collection('bills')\
                    .where('user_profile_id', '==', user_id)\
                    .where('biller_id', '==', biller_id)\
                    .stream()
                for doc in existing_docs:
                    db.collection('bills').document(doc.id).delete()
            except Exception as e:
                logger.warning(f"Error cleaning up Firestore duplicates: {e}")
                
        doc_ref = db.collection('bills').document()
        bill_data['id'] = doc_ref.id
        doc_ref.set(bill_data)
        return doc_ref.id
    else:
        import uuid
        bill_id = bill_data.get('id') or f"mock_bill_{str(uuid.uuid4())[:8]}"
        bill_data['id'] = bill_id
        
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        # Remove duplicates of same user and operator to keep records fresh
        cursor.execute(
            "DELETE FROM bills WHERE user_profile_id = ? AND biller_id = ?",
            (user_id, biller_id)
        )
        cursor.execute("""
            INSERT INTO bills (id, user_profile_id, biller_id, biller_name, consumer_number, amount, due_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            bill_id,
            user_id,
            biller_id,
            bill_data.get('biller_name'),
            bill_data.get('consumer_number'),
            float(bill_data.get('amount') or 0.0),
            bill_data.get('due_date'),
            bill_data.get('status', 'UNPAID')
        ))
        conn.commit()
        conn.close()
        return bill_id


async def get_bill_history(user_profile_id: str) -> List[Dict]:
    """
    Retrieves the list of all historic bills associated with a given user profile.
    """
    logger.info(f"get_bill_history called for profile: {user_profile_id}")
    if db:
        docs = db.collection('bills').where('user_profile_id', '==', user_profile_id).stream()
        raw_bills = [doc.to_dict() for doc in docs]
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bills WHERE user_profile_id = ?", (user_profile_id,))
        rows = cursor.fetchall()
        conn.close()
        raw_bills = [dict(r) for r in rows]
        
    # Deduplicate raw_bills so we only return the single latest record per biller_id
    deduped = {}
    for bill in raw_bills:
        biller_id = bill.get("biller_id")
        if not biller_id:
            continue
        existing = deduped.get(biller_id)
        if not existing:
            deduped[biller_id] = bill
        else:
            # If the current one is PAID, it takes precedence
            if bill.get("status") == "PAID" and existing.get("status") != "PAID":
                deduped[biller_id] = bill
            # Otherwise, keep the one with the later due date
            elif bill.get("status") == existing.get("status") or (bill.get("status") != "PAID" and existing.get("status") != "PAID"):
                bill_due = bill.get("due_date", "")
                existing_due = existing.get("due_date", "")
                if bill_due > existing_due:
                    deduped[biller_id] = bill
                    
    return list(deduped.values())


async def save_receipt(receipt_data: Dict) -> str:
    """
    Saves a transaction receipt details.
    """
    logger.info(f"save_receipt called with: {receipt_data}")
    if db:
        doc_ref = db.collection('receipts').document()
        receipt_data['id'] = doc_ref.id
        doc_ref.set(receipt_data)
        return doc_ref.id
    else:
        import uuid
        receipt_id = receipt_data.get('id') or f"mock_receipt_{str(uuid.uuid4())[:8]}"
        receipt_data['id'] = receipt_id
        
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO receipts (id, user_profile_id, bill_id, biller_id, biller_name, amount_paid, timestamp, transaction_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            receipt_id,
            receipt_data.get('user_profile_id'),
            receipt_data.get('bill_id'),
            receipt_data.get('biller_id'),
            receipt_data.get('biller_name'),
            float(receipt_data.get('amount_paid') or 0.0),
            receipt_data.get('timestamp'),
            receipt_data.get('transaction_id'),
            receipt_data.get('status', 'SUCCESS')
        ))
        conn.commit()
        conn.close()
        return receipt_id


async def get_user_profile(user_profile_id: str) -> Optional[Dict]:
    """
    Retrieves the user configuration settings.
    """
    logger.info(f"get_user_profile called for: {user_profile_id}")
    if db:
        doc = db.collection('users').document(user_profile_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_profile_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            data = dict(row)
            data["mandate_limit"] = float(data["mandate_limit"]) if data["mandate_limit"] is not None else 5000.0
            data["alert_threshold_amount"] = float(data["alert_threshold_amount"]) if data["alert_threshold_amount"] is not None else 2000.0
            data["alert_threshold_enabled"] = bool(data["alert_threshold_enabled"])
            try:
                data["billers"] = json.loads(data["billers"]) if data["billers"] else []
            except Exception:
                data["billers"] = []
            return data
        return None


async def save_user_profile(user_profile_id: str, profile_data: Dict) -> bool:
    """
    Saves or updates user configuration settings in Firestore or local SQLite storage.
    """
    logger.info(f"save_user_profile called for profile: {user_profile_id}")
    if db:
        db.collection('users').document(user_profile_id).set(profile_data)
        return True
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        billers_str = json.dumps(profile_data.get("billers", []))
        cursor.execute("""
            INSERT OR REPLACE INTO users (id, child_phone, parent_phone, parent_name, preferred_language, mandate_limit, mandate_token, city, alert_threshold_enabled, alert_threshold_amount, billers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_profile_id,
            profile_data.get("child_phone"),
            profile_data.get("parent_phone"),
            profile_data.get("parent_name"),
            profile_data.get("preferred_language"),
            float(profile_data.get("mandate_limit") or 5000.0),
            profile_data.get("mandate_token"),
            profile_data.get("city"),
            1 if profile_data.get("alert_threshold_enabled") else 0,
            float(profile_data.get("alert_threshold_amount") or 2000.0),
            billers_str
        ))
        conn.commit()
        conn.close()
        return True


async def get_receipt_history(user_profile_id: str) -> List[Dict]:
    """
    Retrieves the payment receipts associated with a user profile.
    """
    logger.info(f"get_receipt_history called for profile: {user_profile_id}")
    if db:
        docs = db.collection('receipts').where('user_profile_id', '==', user_profile_id).stream()
        return [doc.to_dict() for doc in docs]
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM receipts WHERE user_profile_id = ?", (user_profile_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]


async def get_all_users() -> List[Dict]:
    """
    Retrieves all active user configuration profiles from Firestore or SQLite.
    """
    logger.info("get_all_users called")
    if db:
        docs = db.collection('users').stream()
        users_list = []
        for doc in docs:
            user_data = doc.to_dict()
            if "id" not in user_data:
                user_data["id"] = doc.id
            users_list.append(user_data)
        return users_list
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users")
        rows = cursor.fetchall()
        conn.close()
        
        users_list = []
        for r in rows:
            data = dict(r)
            data["mandate_limit"] = float(data["mandate_limit"]) if data["mandate_limit"] is not None else 5000.0
            data["alert_threshold_amount"] = float(data["alert_threshold_amount"]) if data["alert_threshold_amount"] is not None else 2000.0
            data["alert_threshold_enabled"] = bool(data["alert_threshold_enabled"])
            try:
                data["billers"] = json.loads(data["billers"]) if data["billers"] else []
            except Exception:
                data["billers"] = []
            users_list.append(data)
        return users_list


async def get_receipt_by_txn(txn_id: str) -> Optional[Dict]:
    """
    Retrieves a receipt details matching the transaction ID.
    """
    logger.info(f"get_receipt_by_txn called for: {txn_id}")
    if db:
        docs = db.collection('receipts').where('transaction_id', '==', txn_id).limit(1).stream()
        for doc in docs:
            return doc.to_dict()
        return None
    else:
        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM receipts WHERE transaction_id = ?", (txn_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None



