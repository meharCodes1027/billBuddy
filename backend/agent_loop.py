"""
Orchestrator Loop module for BillBuddy.
Manages the scheduled agent execution loop: Fetch -> Risk -> Payment -> Notify.
Includes structured JSON logging to print JSON log strings for auditable tracking.
"""

import json
import logging
from datetime import datetime
from typing import Dict, List

import firebase_client
from fetch_agent import fetch_bill
from risk_agent import assess_risk
from payment_agent import process_payment
from notify_agent import send_whatsapp_notification

# ------------------------------------------------------------------------------
# Structured JSON Logger Configuration
# ------------------------------------------------------------------------------
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "user_id": getattr(record, "user_id", None)
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


# Instantiate the JSON orchestrator logger
json_logger = logging.getLogger("billbuddy_orchestrator")
json_logger.handlers = []  # Clear default handlers to avoid duplicate output formatting
console_handler = logging.StreamHandler()
console_handler.setFormatter(JsonFormatter())
json_logger.addHandler(console_handler)
json_logger.setLevel(logging.INFO)


async def run_orchestrator(target_user_id: str = None) -> List[Dict]:
    """
    Core agent loop execution:
    1. Fetches active user configuration profiles.
    2. Runs Fetch Agent to pull current outstanding utility bills.
    3. Runs Risk Agent to identify spikes (skipping payment on high-severity anomalies).
    4. Settle bills due within 3 days using the Payment Agent.
    5. Dispatches notifications to parent (voice) and child (text) via the Notify Agent.
    """
    trace_logs = []
    
    def append_trace(msg: str, user_id: str = None):
        timestamp = datetime.utcnow().isoformat() + "Z"
        trace_logs.append({"timestamp": timestamp, "message": msg})
        json_logger.info(msg, extra={"user_id": user_id})

    append_trace("Starting BillBuddy automated agent orchestrator pipeline.")
    
    # 1. Fetch active users
    try:
        if target_user_id:
            user_profile = await firebase_client.get_user_profile(target_user_id)
            users = [user_profile] if user_profile else []
        else:
            users = await firebase_client.get_all_users()
            
        append_trace(f"Retrieved {len(users)} active user profile(s) from database.")
    except Exception as db_err:
        append_trace(f"CRITICAL: Failed to query user profiles from database: {db_err}")
        return trace_logs

    if not users:
        append_trace("No user profiles available for billing updates.")
        return trace_logs

    # 2. Run Fetch Agent for all users
    append_trace("FETCH AGENT: Initiating batch utility statement fetching cycle...")
    try:
        fetched_bills = await fetch_bill(users)
        append_trace(f"FETCH AGENT: Cycle finished. Retained {len(fetched_bills)} bill record(s) inside Firestore cache.")
    except Exception as fetch_err:
        append_trace(f"FETCH AGENT ERROR: Batch retrieval crashed: {fetch_err}")
        fetched_bills = []

    # Process each user's bills individually
    for user in users:
        user_id = user.get("id")
        parent_name = user.get("parent_name", "Parent")
        child_phone = user.get("child_phone")
        parent_phone = user.get("parent_phone")
        language = user.get("preferred_language", "Hindi").lower()
        mandate_token = user.get("mandate_token")
        
        user_bills = [b for b in fetched_bills if b.get("user_profile_id") == user_id]
        
        append_trace(f"Processing updates for User {user_id} ({parent_name}). Total bills: {len(user_bills)}", user_id=user_id)
        
        if not user_bills:
            continue
            
        # 3. Retrieve 3-month payment history for risk context
        try:
            history = await firebase_client.get_bill_history(user_id)
            append_trace(f"Fetched historical bill database records (count={len(history)}) for Risk Agent context.", user_id=user_id)
        except Exception as history_err:
            append_trace(f"Warning: Failed to fetch payment history: {history_err}. Proceeding with empty context.", user_id=user_id)
            history = []

        # Run Risk check on each statement
        for bill in user_bills:
            biller_name = bill.get("biller_id") or bill.get("biller_name")
            amount = bill.get("amount") or bill.get("amount_due")
            due_date_str = bill.get("due_date")
            
            # Skip if already paid
            if bill.get("status") == "PAID":
                append_trace(f"Skipping {biller_name} (Consumer={bill.get('consumer_number')}) - Already PAID.", user_id=user_id)
                continue

            append_trace(f"RISK AGENT: Analyzing billing statement anomaly status for {biller_name}...", user_id=user_id)
            risk_result = await assess_risk(bill, history)
            
            is_anomaly = risk_result.get("is_anomaly", False)
            severity = risk_result.get("severity", "low").strip().lower()
            reason = risk_result.get("reason", "Checks complete.")

            if is_anomaly and severity == "high":
                # High severity anomaly detected: Notify child, skip payment
                append_trace(f"RISK AGENT BLOCK: High severity anomaly detected on {biller_name}. Reason: {reason}. Skipping Autopay.", user_id=user_id)
                
                bill["status"] = "BLOCKED"
                await firebase_client.save_bill(bill)
                
                alert_data = {
                    "biller_id": biller_name,
                    "amount": amount,
                    "severity": severity,
                    "reason": reason
                }
                
                # Run Notify Agent
                await send_whatsapp_notification(
                    notification_data=alert_data,
                    target_phone=child_phone,
                    language="english"
                )
                append_trace(f"NOTIFICATION AGENT: Dispatched high-priority anomaly text alert to child at {child_phone}.", user_id=user_id)
                continue
            
            elif is_anomaly:
                append_trace(f"RISK AGENT WARNING: Moderate anomaly detected on {biller_name} ({severity}). Reason: {reason}. Bypassing block.", user_id=user_id)
            else:
                append_trace(f"RISK AGENT: Bill for {biller_name} verified as safe.", user_id=user_id)

            # 4. Check due date window (due_date - today <= 3 days)
            try:
                due_date_obj = datetime.strptime(due_date_str, "%Y-%m-%d").date()
                days_until_due = (due_date_obj - datetime.utcnow().date()).days
            except Exception as dt_err:
                append_trace(f"ERROR: Failed to parse bill due date '{due_date_str}': {dt_err}. Skipping pay routine.", user_id=user_id)
                continue

            # Settle bill if within the 3-day window
            if days_until_due <= 3:
                if bill.get("status") == "UNPAID":
                    # Mark as PENDING_APPROVAL and notify the child for manual approval
                    append_trace(f"PAYMENT AGENT: {biller_name} is due in {days_until_due} days. Requiring Child approval before processing payment.", user_id=user_id)
                    bill["status"] = "PENDING_APPROVAL"
                    await firebase_client.save_bill(bill)
                    
                    approval_data = {
                        "biller_id": biller_name,
                        "amount": amount,
                        "due_date": due_date_str,
                        "is_approval": True
                    }
                    
                    await send_whatsapp_notification(
                        notification_data=approval_data,
                        target_phone=child_phone,
                        language="english"
                    )
                    append_trace(f"NOTIFICATION AGENT: Sent WhatsApp Autopay approval request to child at {child_phone}.", user_id=user_id)
                    continue
                
                elif bill.get("status") == "PENDING_APPROVAL":
                    append_trace(f"PAYMENT AGENT: {biller_name} is due in {days_until_due} days. Awaiting Child approval in dashboard.", user_id=user_id)
                    continue
                
                elif bill.get("status") == "BLOCKED":
                    append_trace(f"PAYMENT AGENT: {biller_name} is BLOCKED due to risk engine anomaly flags. Awaiting override.", user_id=user_id)
                    continue
            else:
                append_trace(f"PAYMENT AGENT: Bill for {biller_name} is due in {days_until_due} days. Deferred payment loop check.", user_id=user_id)

    append_trace("Orchestrator pipeline execution complete.")
    return trace_logs
