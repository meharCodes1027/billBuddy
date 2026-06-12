"""
Notify Agent module for BillBuddy.
Sends regional voice WhatsApp alerts to parents and text verification summaries to children via Twilio.
"""

import logging
import os
import time
from typing import Dict, Union
from gtts import gTTS
from twilio.rest import Client

import config

logger = logging.getLogger(__name__)


# Language mapping for gTTS codes
TTS_LANG_MAP = {
    "hindi": "hi",
    "punjabi": "pa",
    "tamil": "ta",
    "telugu": "te",
    "english": "en"
}

# Regional language sentence templates
VOICE_TEMPLATES = {
    "hindi": "नमस्ते। आपका {biller_name} का {amount} रुपये का बिल भुगतान सफलतापूर्वक हो गया है। धन्यवाद।",
    "punjabi": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ। ਤੁਹਾਡਾ {biller_name} ਦਾ {amount} ਰੁਪਏ ਦਾ ਬਿੱਲ ਸਫਲਤਾਪੂਰਵਕ ਭਰ ਦਿੱਤਾ ਗਿਆ ਹੈ। ਧੰਨਵਾਦ।",
    "tamil": "வணக்கம். உங்கள் {biller_name} மின்சாரக் கட்டணம் {amount} ரூபாய் வெற்றிகரமாக செலுத்தப்பட்டது. நன்றி.",
    "telugu": "నమస్తే. మీ {biller_name} బిల్ {amount} రూపాయలు విజయవంతంగా చెల్లించబడింది. ధన్యవాదాలు.",
    "english": "Hello. Your {biller_name} bill of {amount} rupees has been paid successfully. Thank you."
}


async def translate_message_via_gemini(text: str, target_language: str) -> str:
    """
    Calls Gemini model to translate the voice message template into target_language dynamically.
    """
    gemini_key = getattr(config, "GEMINI_API_KEY", None)
    if not gemini_key or gemini_key.startswith("mock_"):
        logger.info("No real Gemini API key for translation. Falling back to static templates.")
        return None
        
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
        
        prompt = (
            f"You are a translation assistant for a Text-to-Speech (TTS) engine.\n"
            f"Translate the following utility payment receipt message to {target_language}.\n"
            f"The message is designed to be read aloud as a warm, reassuring notification for an elderly parent.\n"
            f"Ensure the translation is natural, polite, grammatically correct, and preserves the details (like amount, biller name).\n\n"
            f"Message: \"{text}\"\n\n"
            f"Return ONLY the translated message. Do not include any notes, greeting, explanations, or quotes."
        )
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                logger.warning(f"Gemini translation returned status {response.status_code}: {response.text}")
                return None
            res_data = response.json()
            translated = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if translated.startswith('"') and translated.endswith('"'):
                translated = translated[1:-1].strip()
            if translated.startswith("'") and translated.endswith("'"):
                translated = translated[1:-1].strip()
            logger.info(f"Gemini dynamic translation to {target_language}: {translated}")
            return translated
    except Exception as e:
        logger.warning(f"Failed to dynamically translate message using Gemini: {e}")
        return None


async def generate_openai_tts(text: str, local_path: str) -> bool:
    """
    Synthesizes warm, natural human voice using OpenAI TTS API if key is available.
    """
    openai_key = getattr(config, "OPENAI_API_KEY", None)
    if not openai_key or openai_key.startswith("mock_"):
        return False
        
    try:
        import httpx
        url = "https://api.openai.com/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "tts-1",
            "input": text,
            "voice": "alloy"
        }
        logger.info(f"Generating premium OpenAI TTS for: '{text}'")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.warning(f"OpenAI TTS API returned status {response.status_code}: {response.text}")
                return False
                
            with open(local_path, "wb") as f:
                f.write(response.content)
            logger.info(f"Successfully saved OpenAI TTS audio to {local_path}")
            return True
    except Exception as e:
        logger.warning(f"Failed to generate OpenAI TTS voice: {e}")
        return False


async def send_whatsapp_notification(
    notification_data: Dict, 
    target_phone: str, 
    language: str = "english"
) -> bool:
    """
    Notify Agent:
    Routes receipt or risk alert notification to parent (voice message) or child (text).
    
    Args:
    	notification_data (Dict): Content regarding the payment outcome or risk alert.
    	target_phone (str): The destination E.164 phone number.
    	language (str): Target language for voice notes.

    Returns:
    	bool: True if the notification request completed successfully, False otherwise.
    """
    try:
        account_sid = config.TWILIO_ACCOUNT_SID
        auth_token = config.TWILIO_AUTH_TOKEN
        whatsapp_number = config.TWILIO_WHATSAPP_NUMBER
        
        # Check if Twilio settings are missing or default placeholders
        is_mock_twilio = (
            not account_sid or 
            not auth_token or 
            account_sid.startswith("mock_") or 
            auth_token.startswith("mock_")
        )
        
        # Format sender and receiver numbers with 'whatsapp:' prefix if not already present
        from_whatsapp = whatsapp_number if whatsapp_number.startswith("whatsapp:") else f"whatsapp:{whatsapp_number}"
        to_whatsapp = target_phone if target_phone.startswith("whatsapp:") else f"whatsapp:{target_phone}"
        
        # Determine notification type: receipt vs risk alert
        is_risk = "severity" in notification_data or "is_anomaly" in notification_data
        
        # Formulate contents
        biller_name = notification_data.get("biller_id") or notification_data.get("biller_name", "Utility")
        amount = notification_data.get("amount") or notification_data.get("amount_paid", 0.0)
        due_date = notification_data.get("due_date", "N/A")
        txn_id = notification_data.get("transaction_id", "N/A")
        
        # Log local outputs
        logger.info(f"Notify Agent triggered. To: {to_whatsapp}, IsRisk: {is_risk}")
        
        if is_risk:
            # Child Notification: Risk Alert (WhatsApp Text)
            severity = notification_data.get("severity", "medium").upper()
            reason = notification_data.get("reason", "Suspicious variance detected.")
            body_message = (
                f"🚨 *BillBuddy RISK ALERT*\n\n"
                f"We detected a suspicious anomaly in parent's utility statement:\n"
                f"• *Biller:* {biller_name}\n"
                f"• *Amount:* ₹{amount}\n"
                f"• *Severity:* {severity}\n"
                f"• *Reason:* {reason}\n\n"
                f"⚠️ *Action:* Automated payment has been blocked. Please verify."
            )
            
            logger.info(f"Generated Child Risk SMS text:\n{body_message}")
            
            if is_mock_twilio:
                logger.info("Sandbox/Mock Twilio credentials. Skipping API request.")
                return True
                
            client = Client(account_sid, auth_token)
            client.messages.create(
                from_=from_whatsapp,
                to=to_whatsapp,
                body=body_message
            )
            return True
            
        else:
            # Payment Receipt Notification
            # Determine if this goes to the parent (voice) or child (text)
            # Standard design: Parent gets a voice message in their preferred language;
            # Child gets a plain text invoice confirmation.
            
            # If language is non-English, assume it's for the parent (voice note)
            lang_clean = language.strip().lower()
            if lang_clean != "english":
                # Parent Notification: Voice alert (WhatsApp audio note)
                english_template = VOICE_TEMPLATES["english"]
                english_text = english_template.format(biller_name=biller_name, amount=int(amount))
                
                translated_text = await translate_message_via_gemini(english_text, language)
                if translated_text:
                    voice_text = translated_text
                else:
                    template = VOICE_TEMPLATES.get(lang_clean, VOICE_TEMPLATES["english"])
                    voice_text = template.format(biller_name=biller_name, amount=int(amount))
                
                # Ensure static folder exists
                os.makedirs("static", exist_ok=True)
                lang_code = TTS_LANG_MAP.get(lang_clean, "en")
                local_path = f"static/voice_{int(time.time())}_{lang_code}.mp3"
                
                openai_success = await generate_openai_tts(voice_text, local_path)
                if not openai_success:
                    tts = gTTS(text=voice_text, lang=lang_code)
                    tts.save(local_path)
                    logger.info(f"Saved regional gTTS audio locally to {local_path}: '{voice_text}'")
                
                if is_mock_twilio:
                    logger.info("Sandbox/Mock Twilio credentials. Bypassing voice WhatsApp API call.")
                    return True
                
                # Twilio requires a public URL to download the audio.
                # If PUBLIC_URL is configured (e.g. via ngrok), we route the generated voice alert.
                # Otherwise, we fallback to a static sample audio so Twilio API doesn't fail.
                if config.PUBLIC_URL:
                    public_media_url = f"{config.PUBLIC_URL.rstrip('/')}/{local_path}"
                    logger.info(f"Routing generated TTS voice note from public URL: {public_media_url}")
                else:
                    public_media_url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
                    logger.warning("No PUBLIC_URL configured in .env. Falling back to static sample audio (song) for testing.")
                
                client = Client(account_sid, auth_token)
                body_text = f"🔊 Spoken receipt details: {config.PUBLIC_URL}/receipt/{txn_id}" if config.PUBLIC_URL else "🔊 Spoken receipt details."
                client.messages.create(
                    from_=from_whatsapp,
                    to=to_whatsapp,
                    media_url=[public_media_url],
                    body=body_text
                )
                logger.info(f"Dispatched WhatsApp audio voice alert to parent {to_whatsapp}.")
                return True
                
            else:
                # Child Notification: Payment confirmation receipt (WhatsApp text)
                body_message = (
                    f"✅ *BillBuddy Payment Succeeded*\n\n"
                    f"Successfully processed automated bill payment:\n"
                    f"• *Provider:* {biller_name}\n"
                    f"• *Amount Paid:* ₹{amount}\n"
                    f"• *Due Date:* {due_date}\n"
                    f"• *Transaction Ref:* {txn_id}\n\n"
                    f"Status: Audited & Archived"
                )
                if config.PUBLIC_URL:
                    body_message += f"\n\n📄 Receipt link: {config.PUBLIC_URL}/receipt/{txn_id}"
                
                logger.info(f"Generated Child Text Receipt:\n{body_message}")
                
                if is_mock_twilio:
                    logger.info("Sandbox/Mock Twilio credentials. Bypassing text WhatsApp API call.")
                    return True
                    
                client = Client(account_sid, auth_token)
                client.messages.create(
                    from_=from_whatsapp,
                    to=to_whatsapp,
                    body=body_message
                )
                logger.info(f"Dispatched WhatsApp text receipt to child {to_whatsapp}.")
                return True
                
    except Exception as e:
        logger.error(f"Notify Agent failed to send message: {e}")
        # Core requirement: Never crash the pipeline on notification errors
        return False
