import os
from dotenv import load_dotenv
from twilio.rest import Client

# Load environment variables
load_dotenv()

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")

print(f"Account SID: {account_sid}")
if not account_sid or not auth_token:
    print("Error: Twilio credentials are missing in the .env file.")
    exit(1)

try:
    client = Client(account_sid, auth_token)
    account = client.api.v2010.accounts(account_sid).fetch()
    print(f"Success! Twilio Account is valid.")
    print(f"Friendly Name: {account.friendly_name}")
    print(f"Status: {account.status}")
    print(f"Type: {account.type}")
except Exception as e:
    print(f"Error validating Twilio credentials: {e}")
