"""
Fetch Agent module for BillBuddy.
Pulls utility bill statements from BBPS (via Eko.in API) for a user's registered consumer numbers and biller IDs.
"""

import logging
import time
import base64
import hmac
import hashlib
import uuid
from typing import Dict, List
import httpx

import config
import firebase_client

logger = logging.getLogger(__name__)


class BillData:
    """
    Structured object representing a fetched utility bill statement.
    """
    def __init__(self, biller_name: str, consumer_number: str, amount_due: float, due_date: str, status: str):
        self.biller_name = biller_name
        self.consumer_number = consumer_number
        self.amount_due = amount_due
        self.due_date = due_date
        self.status = status

    def to_dict(self) -> Dict:
        return {
            "biller_id": self.biller_name,  # Unified with biller_id representation
            "biller_name": self.biller_name,
            "consumer_number": self.consumer_number,
            "amount": self.amount_due,
            "due_date": self.due_date,
            "status": self.status
        }


def generate_eko_headers() -> Dict[str, str]:
    """
    Generates dynamic authentication headers required by Eko API.
    """
    developer_key = config.EKO_BBPS_API_KEY
    if not developer_key:
        raise ValueError("EKO_BBPS_API_KEY is not set.")
    
    timestamp = str(int(time.time() * 1000))
    # Base64 encode developer_key
    encoded_key = base64.b64encode(developer_key.encode('utf-8'))
    # HMAC-SHA256 of timestamp using encoded_key
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


async def fetch_bill_from_eko(biller_type: str, consumer_number: str, parent_phone: str, parent_name: str) -> BillData:
    """
    Sends request to Eko BBPS Bill Fetch API.
    """
    # If in sandbox/mock mode, return mock bill details immediately without making HTTPS request
    if not config.EKO_BBPS_API_KEY or config.EKO_BBPS_API_KEY.startswith("mock_"):
        logger.info(f"Sandbox/Mock Eko configuration. Bypassing Eko API call for Biller={biller_type}.")
        import hashlib
        h = int(hashlib.md5(consumer_number.encode('utf-8')).hexdigest(), 16)
        fallback_amount = float((h % 3000) + 600)  # Dynamic amount between 600 and 3600
        fallback_due = time.strftime("%Y-%m-%d", time.localtime(time.time() + 3 * 86400)) # 3 days from now
        biller_mapping = {
            "electricity": "PSPCL_ELECT",
            "gas": "INDANE_GAS",
            "water": "DELHI_JAL_BOARD"
        }
        operator_id = biller_mapping.get(biller_type.lower(), biller_type)
        return BillData(
            biller_name=operator_id,
            consumer_number=consumer_number,
            amount_due=fallback_amount,
            due_date=fallback_due,
            status="UNPAID"
        )

    headers = generate_eko_headers()
    
    # Map friendly biller names or types to Eko Operator IDs if necessary
    # Default is the input biller string. E.g. 'electricity' -> 'PSPCL_ELECT'
    biller_mapping = {
        "electricity": "PSPCL_ELECT",
        "gas": "INDANE_GAS",
        "water": "DELHI_JAL_BOARD"
    }
    operator_id = biller_mapping.get(biller_type.lower(), biller_type)
    
    # Eko Sandbox BBPS endpoint
    url = "https://staging.eko.in:25004/ekoapi/v3/customer/payment/bbps/bill"
    
    payload = {
        "initiator_id": config.EKO_BBPS_DEVELOPER_ID or "9876543210",
        "user_code": config.EKO_BBPS_DEVELOPER_ID or "9876543210",
        "client_ref_id": str(uuid.uuid4()),
        "utility_acc_no": consumer_number,
        "operator_id": operator_id,
        "confirmation_mobile_no": parent_phone or "9876543210",
        "sender_name": parent_name or "Utility Payer",
        "latlong": "30.7333,76.7794", # Default Location (Chandigarh)
        "source_ip": "127.0.0.1"
    }
    
    logger.info(f"Fetching bill from Eko: Operator={operator_id}, Consumer={consumer_number}")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers, params=payload)
        
        if response.status_code != 200:
            raise ValueError(f"HTTP error {response.status_code}: {response.text}")
            
        res_data = response.json()
        # Parse status (Eko success status is typically 0)
        status_code = res_data.get("status")
        if status_code != 0:
            raise ValueError(f"Eko API returned error status {status_code}: {res_data.get('message')}")
            
        data = res_data.get("data", {})
        amount_due = float(data.get("amount", 0.0))
        due_date = data.get("due_date", "")
        # Fallback to standard YYYY-MM-DD representation
        if not due_date:
            # Generate a due date 10 days from now as safety fallback
            due_date = time.strftime("%Y-%m-%d", time.localtime(time.time() + 10 * 86400))
            
        bill_status = data.get("bill_status", "UNPAID")
        
        return BillData(
            biller_name=operator_id,
            consumer_number=consumer_number,
            amount_due=amount_due,
            due_date=due_date,
            status=bill_status
        )


async def fetch_bill(user_profiles: List[Dict]) -> List[Dict]:
    """
    Fetch Agent orchestrator:
    Loops over all input user profiles, calls Eko API for each linked utility,
    saves the fetched statements to Firestore, and returns a list of dictionary bill models.
    """
    logger.info(f"Fetch Agent started for {len(user_profiles)} user profiles.")
    fetched_bills = []
    
    for user in user_profiles:
        user_id = user.get("id")
        parent_name = user.get("parent_name", "Utility Payer")
        parent_phone = user.get("parent_phone", "")
        
        # Accommodate both standard dict maps 'consumer_numbers' and linked list structure 'billers'
        consumer_numbers = {}
        if "consumer_numbers" in user:
            consumer_numbers = user["consumer_numbers"]
        elif "billers" in user:
            # Transform [{'biller_id': 'X', 'consumer_number': 'Y'}] to dict mapping
            for b in user["billers"]:
                biller_id = b.get("biller_id")
                consumer_num = b.get("consumer_number")
                if biller_id and consumer_num:
                    consumer_numbers[biller_id] = consumer_num
                    
        for biller_type, consumer_id in consumer_numbers.items():
            try:
                # Retrieve bill details via API call
                bill_data = await fetch_bill_from_eko(
                    biller_type=biller_type,
                    consumer_number=consumer_id,
                    parent_phone=parent_phone,
                    parent_name=parent_name
                )
                
                # Transform to dict structure suitable for Firestore
                bill_dict = bill_data.to_dict()
                bill_dict["user_profile_id"] = user_id
                
                # Save to database
                await firebase_client.save_bill(bill_dict)
                fetched_bills.append(bill_dict)
                logger.info(f"Successfully fetched and stored bill: {biller_type} for User {user_id}")
                
            except Exception as e:
                # Core requirement: Never crash the loop. Log the failure and continue
                logger.error(
                    f"Failed to fetch bill for Biller={biller_type}, Consumer={consumer_id}, User={user_id}. Error: {e}"
                )
                
                # In sandbox/UAT testing, if Eko API fails due to mock keys or network, 
                # we provide a fallback mockup statement so that system workflows remain testable
                if not config.EKO_BBPS_API_KEY or config.EKO_BBPS_API_KEY.startswith("mock_"):
                    logger.info("Sandbox/Mock key detected: generating test fallback statement.")
                    # Create mock fallback bills
                    import hashlib
                    h = int(hashlib.md5(consumer_id.encode('utf-8')).hexdigest(), 16)
                    fallback_amount = float((h % 3000) + 600)  # Dynamic amount between 600 and 3600
                    fallback_due = time.strftime("%Y-%m-%d", time.localtime(time.time() + 3 * 86400)) # 3 days from now
                    fallback_bill = BillData(
                        biller_name=biller_type,
                        consumer_number=consumer_id,
                        amount_due=fallback_amount,
                        due_date=fallback_due,
                        status="UNPAID"
                    )
                    bill_dict = fallback_bill.to_dict()
                    bill_dict["user_profile_id"] = user_id
                    await firebase_client.save_bill(bill_dict)
                    fetched_bills.append(bill_dict)

    return fetched_bills
