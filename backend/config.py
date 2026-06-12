import os
from dotenv import load_dotenv

# Load variables from .env file if it exists
load_dotenv(override=True)

# Dictionary containing all required env variables, their description, and how to get them.
REQUIRED_ENV_VARS = {
    "PORT": {
        "description": "Port number that the FastAPI application runs on.",
        "instructions": "Set PORT to a local port number (e.g. 8000) in your .env file."
    },
    "FIREBASE_PROJECT_ID": {
        "description": "Google Firebase project identifier.",
        "instructions": "Sign up or log in to Firebase Console (https://console.firebase.google.com/), create a project, and copy its ID."
    },
    "FIREBASE_CREDENTIALS_JSON_PATH": {
        "description": "Path to the Google Firebase service account JSON credentials.",
        "instructions": "Go to Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key. Save the JSON file locally and provide its path."
    },
    "EKO_BBPS_API_KEY": {
        "description": "API Key for Eko.in BBPS Sandbox.",
        "instructions": "Sign up as a developer at Eko.in (https://eko.in/) and obtain your sandbox API key."
    },
    "EKO_BBPS_DEVELOPER_ID": {
        "description": "Developer Partner ID for Eko.in BBPS Sandbox.",
        "instructions": "Sign up as a developer at Eko.in (https://eko.in/) and obtain your Developer ID."
    },
    "RAZORPAY_KEY_ID": {
        "description": "Razorpay Sandbox API Key ID.",
        "instructions": "Create an account at https://razorpay.com/, switch to Sandbox mode, and generate API Keys in Settings."
    },
    "RAZORPAY_KEY_SECRET": {
        "description": "Razorpay Sandbox API Secret Key.",
        "instructions": "Generated alongside RAZORPAY_KEY_ID in the Razorpay dashboard settings."
    },
    "TWILIO_ACCOUNT_SID": {
        "description": "Twilio Account Security Identifier.",
        "instructions": "Sign up for a Twilio developer account (https://www.twilio.com/try-twilio) and copy your Account SID from the dashboard console."
    },
    "TWILIO_AUTH_TOKEN": {
        "description": "Twilio Account Authentication Token.",
        "instructions": "Sign up for a Twilio developer account (https://www.twilio.com/try-twilio) and copy your Auth Token from the dashboard console."
    },
    "TWILIO_WHATSAPP_NUMBER": {
        "description": "Twilio WhatsApp Sandbox or registered sender number.",
        "instructions": "Go to Twilio Console -> Messaging -> Try it Out -> Send a WhatsApp Message to enable and copy the sandbox phone number (e.g. whatsapp:+14155238886)."
    }
}

# We require at least one LLM API key (either Gemini or Anthropic)
LLM_ENV_VARS = ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"]


def validate_config():
    missing_vars = []
    
    # 1. Validate individual required variables
    for var, details in REQUIRED_ENV_VARS.items():
        value = os.getenv(var)
        if not value or value.strip() == "":
            missing_vars.append((var, details))
            
    # 2. Validate LLM configuration
    gemini_key = os.getenv("GEMINI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    has_llm = (gemini_key and gemini_key.strip() != "") or (anthropic_key and anthropic_key.strip() != "")
    
    # Generate error message if validation fails
    if missing_vars or not has_llm:
        error_msg = "\n" + "="*80 + "\n"
        error_msg += " CONFIGURATION ERROR: Missing Environment Variables\n"
        error_msg += "="*80 + "\n"
        
        if missing_vars:
            error_msg += "The following environment variables are missing from your configuration:\n\n"
            for var, details in missing_vars:
                error_msg += f"  - {var}: {details['description']}\n"
                error_msg += f"    How to get: {details['instructions']}\n\n"
                
        if not has_llm:
            error_msg += "  - LLM PROVIDER API KEY: You must provide at least one AI API key.\n"
            error_msg += "    Option 1: GEMINI_API_KEY (Get from: https://aistudio.google.com/)\n"
            error_msg += "    Option 2: ANTHROPIC_API_KEY (Get from: https://console.anthropic.com/)\n\n"
            
        error_msg += "Please copy '.env.example' to '.env', fill in these values, and restart the server.\n"
        error_msg += "="*80
        raise ValueError(error_msg)


# Run validation immediately upon importing config
validate_config()

# Export config variables
PORT = int(os.getenv("PORT", "8000"))
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FIREBASE_CREDENTIALS_JSON_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON_PATH")
EKO_BBPS_API_KEY = os.getenv("EKO_BBPS_API_KEY")
EKO_BBPS_DEVELOPER_ID = os.getenv("EKO_BBPS_DEVELOPER_ID")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
PUBLIC_URL = os.getenv("PUBLIC_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
