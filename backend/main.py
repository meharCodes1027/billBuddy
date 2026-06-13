"""
FastAPI Backend application for BillBuddy.
Sets up the API server with CORS and configures the APScheduler to execute the daily agent payment loop.
"""

import os
import logging
from datetime import datetime, date
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("billbuddy_backend")

# Import agents and clients
import config
import firebase_client
from fetch_agent import fetch_bill
from risk_agent import assess_risk
from payment_agent import process_payment
from notify_agent import send_whatsapp_notification

# ------------------------------------------------------------------------------
# Orchestrator Loop
# ------------------------------------------------------------------------------
def run_sync_agent_loop():
    """Sync wrapper to invoke async run_orchestrator inside scheduler"""
    import asyncio
    from agent_loop import run_orchestrator
    asyncio.run(run_orchestrator())

# ------------------------------------------------------------------------------
# FastAPI Application Configuration
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start APScheduler
    scheduler = BackgroundScheduler()
    # Schedule agent_loop to run every 24 hours
    scheduler.add_job(run_sync_agent_loop, 'interval', hours=24, next_run_time=datetime.now())
    scheduler.start()
    logger.info("APScheduler initialized: Scheduled agent_loop() every 24 hours.")
    
    yield
    # Shutdown
    scheduler.shutdown()
    logger.info("APScheduler shut down.")

app = FastAPI(
    title="BillBuddy Backend",
    description="Autonomous bill payment coordinator backend for elderly citizens.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url.rstrip("/"))
public_url = os.getenv("PUBLIC_URL")
if public_url:
    origins.append(public_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve compiled React frontend if built (Single Deployment Support)
if os.path.exists("dist"):
    from fastapi.responses import FileResponse
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    @app.get("/")
    def read_root():
        return FileResponse("dist/index.html")

    @app.get("/{catchall:path}")
    async def serve_react_app(catchall: str):
        if catchall.startswith("api/") or catchall.startswith("static/") or catchall.startswith("health") or catchall.startswith("receipt/"):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse("dist/index.html")
else:
    @app.get("/")
    def read_root():
        return {"app": "BillBuddy API", "status": "running"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "time": datetime.utcnow().isoformat()}


from pydantic import BaseModel
from typing import List, Dict

class BillerSchema(BaseModel):
    biller_id: str
    consumer_number: str

class UserProfileSchema(BaseModel):
    child_phone: str
    parent_phone: str
    parent_name: str
    preferred_language: str
    mandate_limit: float
    mandate_token: str
    billers: List[BillerSchema]
    city: str = None
    alert_threshold_enabled: bool = True
    alert_threshold_amount: float = 2000.0


@app.get("/api/profile/{profile_id}")
async def get_profile(profile_id: str):
    profile = await firebase_client.get_user_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.post("/api/profile/{profile_id}")
async def update_profile(profile_id: str, profile_data: UserProfileSchema):
    data = profile_data.dict()
    data['id'] = profile_id
    success = await firebase_client.save_user_profile(profile_id, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save profile")
    return {"status": "success", "profile": data}


@app.get("/api/profile/{profile_id}/bills")
async def get_bills(profile_id: str):
    bills = await firebase_client.get_bill_history(profile_id)
    # If no bills exist, we fetch them and populate database
    if not bills:
        profile_data = await firebase_client.get_user_profile(profile_id)
        if not profile_data:
            return []
        from fetch_agent import fetch_bill
        await fetch_bill([profile_data])
        bills = await firebase_client.get_bill_history(profile_id)

    return bills


@app.get("/api/profile/{profile_id}/history")
async def get_history(profile_id: str):
    receipts = await firebase_client.get_receipt_history(profile_id)
    return receipts


@app.post("/api/profile/{profile_id}/trigger")
async def trigger_agent(profile_id: str):
    from agent_loop import run_orchestrator
    trace = await run_orchestrator(profile_id)
    return {"status": "success", "trace": trace}


@app.get("/api/billers")
def get_billers(category: str = None, city: str = None):
    """
    Retrieves the list of active BBPS operators/billers, optionally filtered by category and city.
    """
    operators = {
        "electricity": [
            {"id": "PSPCL_ELECT", "name": "PSPCL Electricity (Punjab)"},
            {"id": "TATA_POWER_ELECT", "name": "Tata Power Electricity (Delhi)"},
            {"id": "BESCOM_ELECT", "name": "BESCOM Electricity (Bangalore)"}
        ],
        "gas": [
            {"id": "INDANE_GAS", "name": "Indane Gas LPG Cylinders"},
            {"id": "HP_GAS", "name": "HP Gas LPG Cylinders"},
            {"id": "IGL_GAS", "name": "Indraprastha Gas Limited (Piped)"}
        ],
        "water": [
            {"id": "DELHI_JAL_BOARD", "name": "Delhi Jal Board"},
            {"id": "BMC_WATER", "name": "BMC Municipal Water (Mumbai)"}
        ],
        "broadband": [
            {"id": "BSNL_FIBRE", "name": "BSNL Fibre Broadband"},
            {"id": "AIRTEL_FIBRE", "name": "Airtel Xstream Broadband"}
        ],
        "dth": [
            {"id": "TATA_PLAY", "name": "Tata Play DTH"},
            {"id": "DISH_TV", "name": "Dish TV DTH"}
        ]
    }
    
    if city and city.strip():
        city_clean = city.strip().title()
        city_id = city_clean.upper().replace(" ", "_")
        operators["electricity"].insert(0, {"id": f"{city_id}_ELECT", "name": f"{city_clean} Electricity Utility"})
        operators["gas"].insert(0, {"id": f"{city_id}_GAS", "name": f"{city_clean} Gas Distribution"})
        operators["water"].insert(0, {"id": f"{city_id}_WATER", "name": f"{city_clean} Water Board"})
        operators["broadband"].insert(0, {"id": f"{city_id}_FIBRE", "name": f"{city_clean} Fibre Broadband"})

    if category:
        cat_clean = category.strip().lower()
        return {"billers": operators.get(cat_clean, [])}
        
    all_billers = []
    for cat_list in operators.values():
        all_billers.extend(cat_list)
    return {"billers": all_billers}


class VerifyBillerPayload(BaseModel):
    biller_id: str
    consumer_number: str

@app.post("/api/verify-biller")
async def verify_biller(payload: VerifyBillerPayload):
    """
    Validates a consumer account number for a BBPS operator by invoking Eko fetch agent check.
    """
    from fetch_agent import fetch_bill_from_eko
    try:
        bill_data = await fetch_bill_from_eko(
            biller_type=payload.biller_id,
            consumer_number=payload.consumer_number,
            parent_phone="9876543210",
            parent_name="Verification Run"
        )
        return {"status": "verified", "amount_due": bill_data.amount_due}
    except Exception as e:
        logger.warning(f"Verify biller call failed or sandbox simulated: {e}")
        # Graceful sandbox fallback to enable frontend flow testing
        if not config.EKO_BBPS_API_KEY or config.EKO_BBPS_API_KEY.startswith("mock_"):
            import hashlib
            h = int(hashlib.md5(payload.consumer_number.encode('utf-8')).hexdigest(), 16)
            mock_amount = float((h % 3000) + 600)  # Dynamic amount between 600 and 3600
            return {"status": "verified", "amount_due": mock_amount}
        raise HTTPException(status_code=400, detail=f"Biller verification failed: {str(e)}")


@app.get("/api/razorpay-key")
def get_razorpay_key():
    """
    Exposes the public Razorpay Key ID for client mandate initialization.
    """
    return {"key_id": config.RAZORPAY_KEY_ID or "rzp_test_mockkey"}


class TestNotifyPayload(BaseModel):
    language: str

@app.post("/api/profile/{profile_id}/test-notification")
async def send_test_notification(profile_id: str, payload: TestNotifyPayload):
    """
    Invokes notify_agent to dispatch a test receipt WhatsApp voice notification to parent.
    """
    from notify_agent import send_whatsapp_notification
    
    user_profile = await firebase_client.get_user_profile(profile_id)
    target_phone = user_profile.get("parent_phone") if user_profile else "+919998887776"
    
    dummy_receipt = {
        "biller_id": "PSPCL_ELECT",
        "amount_paid": 847.00,
        "transaction_id": "TXN_TEST_998811",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    success = await send_whatsapp_notification(
        notification_data=dummy_receipt,
        target_phone=target_phone,
        language=payload.language
    )
    return {"status": "sent" if success else "failed"}


from fastapi.responses import HTMLResponse

@app.get("/receipt/{txn_id}", response_class=HTMLResponse)
async def serve_parent_receipt(txn_id: str):
    receipt = await firebase_client.get_receipt_by_txn(txn_id)
    if not receipt:
        return """
        <html>
            <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #090d16; color: white;">
                <h2>Receipt Not Found</h2>
                <p>Verify that your transaction was processed successfully.</p>
            </body>
        </html>
        """
        
    user_profile = await firebase_client.get_user_profile(receipt.get("user_profile_id"))
    parent_name = user_profile.get("parent_name", "Valued Parent") if user_profile else "Valued Parent"
    preferred_lang = user_profile.get("preferred_language", "English").lower() if user_profile else "english"
    
    translations = {
        "hindi": {
            "title": "बिल भुगतान रसीद",
            "hello": f"नमस्ते, {parent_name}",
            "msg": f"आपका {receipt.get('biller_id')} का बिल भुगतान सफल रहा।",
            "amount": "भुगतान राशि",
            "ref": "लेनदेन संदर्भ संख्या",
            "verified": "बिलबडी सुरक्षा द्वारा सत्यापित"
        },
        "punjabi": {
            "title": "ਬਿੱਲ ਭੁਗਤਾਨ ਰਸੀਦ",
            "hello": f"ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, {parent_name}",
            "msg": f"ਤੁਹਾਡਾ {receipt.get('biller_id')} ਦਾ ਬਿੱਲ ਸਫਲਤਾਪੂਰਵਕ ਭਰ ਦਿੱਤਾ ਗਿਆ ਹੈ।",
            "amount": "ਭੁਗਤਾਨ ਰਾਸ਼ੀ",
            "ref": "ਟ੍ਰਾਂਜੈਕਸ਼ਨ ਨੰਬਰ",
            "verified": "ਬਿਲਬਡੀ ਸੁਰੱਖਿਆ ਦੁਆਰਾ ਪ੍ਰਮਾਣਿਤ"
        },
        "tamil": {
            "title": "கட்டண ரசீது",
            "hello": f"வணக்கம், {parent_name}",
            "msg": f"உங்கள் {receipt.get('biller_id')} கட்டணம் வெற்றிகரமாக செலுத்தப்பட்டது.",
            "amount": "செலுத்தப்பட்ட தொகை",
            "ref": "பரிவர்த்தனை எண்",
            "verified": "பில்பட்டி பாதுகாப்புடன் சரிபார்க்கப்பட்டது"
        },
        "english": {
            "title": "BillBuddy Payment Receipt",
            "hello": f"Hello, {parent_name}",
            "msg": f"Your bill for {receipt.get('biller_id')} was paid successfully.",
            "amount": "Amount Paid",
            "ref": "Transaction ID",
            "verified": "VERIFIED SECURE BY BILLBUDDY RISK ENGINE"
        }
    }
    
    trans = translations.get(preferred_lang, translations["english"])
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{trans['title']}</title>
        <style>
            body {{
                background-color: #090d16;
                color: #f1f5f9;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                padding: 20px;
                box-sizing: border-box;
            }}
            .card {{
                background: rgba(11, 16, 33, 0.85);
                border: 2px solid #312e81;
                border-radius: 24px;
                padding: 40px;
                max-width: 480px;
                width: 100%;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                text-align: center;
            }}
            .success-badge {{
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 80px;
                height: 80px;
                background-color: rgba(16, 185, 129, 0.1);
                border: 3px solid #10b981;
                border-radius: 50%;
                margin-bottom: 24px;
                color: #10b981;
                font-size: 40px;
            }}
            h1 {{
                font-size: 32px;
                margin: 0 0 10px 0;
                color: #ffffff;
            }}
            h2 {{
                font-size: 24px;
                margin: 0 0 20px 0;
                color: #cbd5e1;
                font-weight: normal;
            }}
            p.msg {{
                font-size: 20px;
                line-height: 1.5;
                color: #e2e8f0;
                margin-bottom: 30px;
            }}
            .details-box {{
                background: rgba(5, 7, 12, 0.5);
                border: 1px solid #1e293b;
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 30px;
                text-align: left;
            }}
            .label {{
                font-size: 14px;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
            }}
            .value {{
                font-size: 24px;
                font-weight: bold;
                color: #ffffff;
                margin-bottom: 16px;
            }}
            .value-small {{
                font-size: 16px;
                font-family: monospace;
                color: #6366f1;
                word-break: break-all;
                margin-bottom: 0;
            }}
            .verified-seal {{
                font-size: 12px;
                font-weight: bold;
                color: #10b981;
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 50px;
                padding: 8px 16px;
                display: inline-block;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="success-badge">✓</div>
            <h1>{trans['title']}</h1>
            <h2>{trans['hello']}</h2>
            <p class="msg">{trans['msg']}</p>
            
            <div class="details-box">
                <div class="label">{trans['amount']}</div>
                <div class="value">₹{receipt.get('amount_paid')}</div>
                
                <div class="label" style="margin-top:16px;">{trans['ref']}</div>
                <div class="value-small">{receipt.get('transaction_id')}</div>
            </div>
            
            <div class="verified-seal">
                🛡️ {trans['verified']}
            </div>
        </div>
    </body>
    </html>
    """
    return html_content


class OverridePaymentPayload(BaseModel):
    biller_id: str

@app.post("/api/profile/{profile_id}/override-payment")
async def override_payment(profile_id: str, payload: OverridePaymentPayload):
    """
    Manually bypasses risk-agent flags and settles a blocked bill using UPI Autopay.
    """
    user_profile = await firebase_client.get_user_profile(profile_id)
    if not user_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    bills = await firebase_client.get_bill_history(profile_id)
    matching_bill = None
    for b in bills:
        if b.get("biller_id") == payload.biller_id:
            matching_bill = b
            break
            
    if not matching_bill:
        raise HTTPException(status_code=404, detail="Billing statement not found")
        
    mandate_token = user_profile.get("mandate_token")
    if not mandate_token:
        raise HTTPException(status_code=400, detail="Autopay mandate not registered for this profile")
        
    try:
        # 1. Settle transaction directly
        receipt = await process_payment(matching_bill, mandate_token)
        
        # 2. Update status of the bill to PAID
        matching_bill["status"] = "PAID"
        await firebase_client.save_bill(matching_bill)
        
        # 3. Notify parent (voice) and child (text)
        language = user_profile.get("preferred_language", "Hindi").lower()
        parent_phone = user_profile.get("parent_phone")
        child_phone = user_profile.get("child_phone")
        
        await send_whatsapp_notification(
            notification_data=receipt.to_dict(),
            target_phone=parent_phone,
            language=language
        )
        await send_whatsapp_notification(
            notification_data=receipt.to_dict(),
            target_phone=child_phone,
            language="english"
        )
        
        return {"status": "success", "receipt": receipt.to_dict()}
    except Exception as e:
        logger.error(f"Manual payment override failed: {e}")
        raise HTTPException(status_code=500, detail=f"Override transaction failed: {str(e)}")


class ApprovePaymentPayload(BaseModel):
    biller_id: str

@app.post("/api/profile/{profile_id}/approve-payment")
async def approve_payment(profile_id: str, payload: ApprovePaymentPayload):
    """
    Manually approves a bill that is pending child approval and processes payment.
    """
    user_profile = await firebase_client.get_user_profile(profile_id)
    if not user_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    bills = await firebase_client.get_bill_history(profile_id)
    matching_bill = None
    for b in bills:
        if b.get("biller_id") == payload.biller_id:
            matching_bill = b
            break
            
    if not matching_bill:
        raise HTTPException(status_code=404, detail="Billing statement not found")
        
    mandate_token = user_profile.get("mandate_token")
    if not mandate_token:
        raise HTTPException(status_code=400, detail="Autopay mandate not registered for this profile")
        
    try:
        # 1. Settle transaction directly
        receipt = await process_payment(matching_bill, mandate_token)
        
        # 2. Update status of the bill to PAID
        matching_bill["status"] = "PAID"
        await firebase_client.save_bill(matching_bill)
        
        # 3. Notify parent (voice) and child (text)
        language = user_profile.get("preferred_language", "Hindi").lower()
        parent_phone = user_profile.get("parent_phone")
        child_phone = user_profile.get("child_phone")
        
        await send_whatsapp_notification(
            notification_data=receipt.to_dict(),
            target_phone=parent_phone,
            language=language
        )
        await send_whatsapp_notification(
            notification_data=receipt.to_dict(),
            target_phone=child_phone,
            language="english"
        )
        
        return {"status": "success", "receipt": receipt.to_dict()}
    except Exception as e:
        logger.error(f"Manual payment approval failed: {e}")
        raise HTTPException(status_code=500, detail=f"Approval transaction failed: {str(e)}")





