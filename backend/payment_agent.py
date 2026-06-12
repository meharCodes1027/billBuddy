"""
Payment Agent module for BillBuddy.
Processes automated utility payments via Eko.in BBPS and Razorpay.
"""

import logging
import asyncio
import time
import base64
import hmac
import hashlib
import uuid
import datetime
from typing import Dict
import httpx

import config
import firebase_client

logger = logging.getLogger(__name__)


class PaymentFailedError(Exception):
    """
    Custom exception raised when payment fails after all retry attempts.
    """
    def __init__(self, message: str, details: str = None):
        super().__init__(message)
        self.details = details


class PaymentReceipt:
    """
    Structured payment receipt generated upon successful transaction execution.
    """
    def __init__(self, transaction_id: str, amount_paid: float, timestamp: str, biller_name: str):
        self.transaction_id = transaction_id
        self.amount_paid = amount_paid
        self.timestamp = timestamp
        self.biller_name = biller_name

    def to_dict(self) -> Dict:
        return {
            "transaction_id": self.transaction_id,
            "amount_paid": self.amount_paid,
            "timestamp": self.timestamp,
            "biller_id": self.biller_name,
            "biller_name": self.biller_name,
            "status": "SUCCESS"
        }


def generate_eko_headers() -> Dict[str, str]:
    """
    Generates dynamic authentication headers required by Eko API.
    """
    developer_key = config.EKO_BBPS_API_KEY
    if not developer_key:
        raise ValueError("EKO_BBPS_API_KEY is not configured.")
    
    timestamp = str(int(time.time() * 1000))
    encoded_key = base64.b64encode(developer_key.encode('utf-8'))
    signature = hmac.new(
        key=encoded_key,
        msg=timestamp.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    
    secret_key = base64.b64encode(signature).decode('utf-8')
    
    return {
        "developer_key": developer_key,
        "secret-key": secret_key,
        "secret-key-timestamp": timestamp,
        "Content-Type": "application/x-www-form-urlencoded"
    }


async def call_eko_payment_api(bill: Dict, mandate_token: str) -> Dict:
    """
    Invokes the Eko BBPS Payment API to trigger a bill transaction.
    """
    headers = generate_eko_headers()
    url = "https://staging.eko.in:25004/ekoapi/v3/customer/payment/bbps/bill"
    
    biller_name = bill.get("biller_id") or bill.get("biller_name")
    consumer_number = bill.get("consumer_number")
    amount = bill.get("amount") or bill.get("amount_due")
    
    payload = {
        "initiator_id": config.EKO_BBPS_DEVELOPER_ID or "9876543210",
        "user_code": config.EKO_BBPS_DEVELOPER_ID or "9876543210",
        "client_ref_id": str(uuid.uuid4()),
        "utility_acc_no": consumer_number,
        "operator_id": biller_name,
        "confirmation_mobile_no": "9876543210",
        "sender_name": "Utility Payer",
        "latlong": "30.7333,76.7794",
        "source_ip": "127.0.0.1",
        "amount": str(amount),
        "mandate_token": mandate_token
    }
    
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(url, headers=headers, data=payload)
        
        if response.status_code != 200:
            raise ValueError(f"HTTP Error {response.status_code}: {response.text}")
            
        res_data = response.json()
        status_code = res_data.get("status")
        if status_code != 0:
            raise ValueError(f"Eko BBPS payment failure. Status={status_code}: {res_data.get('message')}")
            
        return res_data


async def process_payment(bill: Dict, mandate_token: str) -> PaymentReceipt:
    """
    Payment Agent:
    Attempts to settle a bill using Eko BBPS. Handles retry on failure.
    
    Args:
        bill (Dict): Dictionary containing bill information: bill_id, biller_id, consumer_number, amount.
        mandate_token (str): Razorpay mandate configuration token for auto-pay.

    Returns:
        PaymentReceipt: Object containing verification transaction details.
    """
    biller_name = bill.get("biller_id") or bill.get("biller_name")
    amount = float(bill.get("amount") or bill.get("amount_due") or 0.0)
    
    # If in sandbox mode with mock variables, skip real HTTP calls and return simulated success
    if not config.EKO_BBPS_API_KEY or config.EKO_BBPS_API_KEY.startswith("mock_"):
        logger.info(f"Sandbox/Mock Eko configuration. Simulating payment success for {biller_name}.")
        receipt = PaymentReceipt(
            transaction_id=f"TXN_RZP_{str(uuid.uuid4())[:8].upper()}",
            amount_paid=amount,
            timestamp=datetime.datetime.utcnow().isoformat(),
            biller_name=biller_name
        )
        
        receipt_dict = receipt.to_dict()
        receipt_dict["user_profile_id"] = bill.get("user_profile_id")
        receipt_dict["bill_id"] = bill.get("bill_id")
        
        # Save receipt to Firestore
        await firebase_client.save_receipt(receipt_dict)
        return receipt

    last_error = None
    # Retry once after 10 seconds: total 2 attempts
    for attempt in [1, 2]:
        try:
            logger.info(f"Payment Agent: Processing transaction for {biller_name} of ₹{amount}. Attempt {attempt}...")
            res_data = await call_eko_payment_api(bill, mandate_token)
            
            data = res_data.get("data", {})
            txn_id = data.get("tx_status_id") or data.get("transaction_id") or f"TXN_{str(uuid.uuid4())[:8].upper()}"
            amount_paid = float(data.get("amount") or amount)
            
            receipt = PaymentReceipt(
                transaction_id=txn_id,
                amount_paid=amount_paid,
                timestamp=datetime.datetime.utcnow().isoformat(),
                biller_name=biller_name
            )
            
            receipt_dict = receipt.to_dict()
            receipt_dict["user_profile_id"] = bill.get("user_profile_id")
            receipt_dict["bill_id"] = bill.get("bill_id")
            
            # Save successful receipt to database
            await firebase_client.save_receipt(receipt_dict)
            logger.info(f"Payment successful: Biller={biller_name}, Amount=₹{amount_paid}, Txn={txn_id}")
            return receipt
            
        except Exception as e:
            last_error = e
            logger.error(f"Payment attempt {attempt} failed: {e}")
            if attempt == 1:
                logger.info("Waiting 10 seconds before retrying payment...")
                await asyncio.sleep(10.0)

    # If both attempts fail, raise custom exception with error details
    raise PaymentFailedError(
        message=f"Automated payment processing failed for Biller={biller_name} after retry limits.",
        details=str(last_error)
    )
