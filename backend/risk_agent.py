"""
Risk Agent module for BillBuddy.
Assesses utility bills for spike anomalies or unverified billers using the Anthropic Claude API.
"""

import logging
import json
from typing import Dict, List
from anthropic import Anthropic

import config

logger = logging.getLogger(__name__)


async def assess_risk(bill: Dict, history: List[Dict]) -> Dict:
    """
    Risk Agent:
    Evaluates a new utility bill against historical payment records using Gemini or Claude.
    
    Args:
        bill (Dict): Dictionary containing current bill information: biller_id, consumer_number, amount, due_date.
        history (List[Dict]): Historical payment receipts for the last 3 months.

    Returns:
        Dict: A dictionary with keys: is_anomaly (bool), reason (str), severity (str).
    """
    try:
        gemini_key = config.GEMINI_API_KEY
        anthropic_key = config.ANTHROPIC_API_KEY
        
        has_gemini = gemini_key and not gemini_key.startswith("mock_")
        has_anthropic = anthropic_key and not anthropic_key.startswith("mock_")
        
        # Formulate structured prompt
        prompt = f"""
You are an autonomous Risk Agent for BillBuddy, a service designed to automate utility bill payments for elderly parents.
Analyze this upcoming bill statement against their historical payments (last 3 months) to detect anomalies (unusually high charge spikes or unverified billers).

Upcoming Bill Details:
{json.dumps(bill, indent=2)}

Historical Transactions (Last 3 Months):
{json.dumps(history, indent=2)}

Determine if this bill is anomalous (e.g. cost spikes >40% above history, or double-billing). 
Evaluate the risk severity: "low" (normal variation), "medium" (suspicious but manageable), or "high" (hazardous spike or potential fraud).

You must return ONLY a raw JSON object containing exactly the following keys:
- "is_anomaly": boolean (true if an anomaly is detected, false otherwise)
- "reason": string (detailed explanation of the assessment in English)
- "severity": string ("low", "medium", or "high")

Example JSON response:
{{
  "is_anomaly": false,
  "reason": "Bill amount is within historical range.",
  "severity": "low"
}}
"""

        raw_text = None
        
        if has_gemini:
            logger.info(f"Triggering Gemini risk analysis for Biller={bill.get('biller_id')}, Consumer={bill.get('consumer_number')}")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            import httpx
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code != 200:
                    raise ValueError(f"Gemini API returned status code {response.status_code}: {response.text}")
                
                res_data = response.json()
                raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                logger.info(f"Gemini response: {raw_text}")

        elif has_anthropic:
            logger.info(f"Triggering Anthropic Claude risk analysis for Biller={bill.get('biller_id')}, Consumer={bill.get('consumer_number')}")
            client = Anthropic(api_key=anthropic_key)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=300,
                temperature=0.0,
                messages=[{"role": "user", "content": prompt}]
            )
            raw_text = response.content[0].text.strip()
            logger.info(f"Claude response: {raw_text}")

        else:
            logger.warning("No LLM API keys (Gemini/Anthropic) are configured. Running heuristic fallback risk checks.")
            is_anomaly = False
            reason = "Pre-check: Bill is within typical standard bounds."
            severity = "low"
            
            # Simple fallback check: If amount is >40% higher than average historical amount
            if history:
                avg_amt = sum(item.get("amount_paid", 0.0) or item.get("amount", 0.0) for item in history) / len(history)
                current_amt = bill.get("amount", 0.0)
                if avg_amt > 0 and current_amt > avg_amt * 1.4:
                    is_anomaly = True
                    reason = f"Programmatic alert: Bill amount ₹{current_amt} is >40% higher than historical average ₹{avg_amt:.2f}."
                    severity = "high"
            
            return {
                "is_anomaly": is_anomaly,
                "reason": reason,
                "severity": severity
            }

        # Extract and parse JSON strictly
        clean_text = raw_text
        if "```json" in raw_text:
            clean_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            clean_text = raw_text.split("```")[1].split("```")[0].strip()
            
        result = json.loads(clean_text)
        
        # Validate keys are present
        if "is_anomaly" in result and "reason" in result and "severity" in result:
            return {
                "is_anomaly": bool(result["is_anomaly"]),
                "reason": str(result["reason"]),
                "severity": str(result["severity"]).lower()
            }
        else:
            raise KeyError("JSON missing required anomaly check keys.")
            
    except json.JSONDecodeError as je:
        logger.error(f"Risk Agent failed to parse LLM response as valid JSON: {je}")
        return {
            "is_anomaly": False,
            "reason": "Risk Agent received unparsable evaluation output.",
            "severity": "low"
        }
    except Exception as e:
        logger.error(f"Risk Agent encountered an exception: {e}")
        return {
            "is_anomaly": False,
            "reason": f"Risk Agent bypassed. Check failed due to internal error: {e}",
            "severity": "low"
        }
