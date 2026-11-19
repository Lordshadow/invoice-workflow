"""
Corporate Outbound Email (SMTP) Service for LedgerFlow.
Sends cryptographic 2FA OTP codes, approval notifications, and security alerts.
"""
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger("invoice_processor.email_sender")


def mask_email(email_str: str) -> str:
    """Masks email address for secure 2FA prompt display (e.g. s***7@gmail.com)."""
    if not email_str or "@" not in email_str:
        return email_str or ""
    local, domain = email_str.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


def send_otp_email(to_email: str, full_name: str, otp_code: str) -> bool:
    """
    Dispatches a 6-digit OTP verification code to the recipient's corporate email.
    """
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", os.getenv("IMAP_USER", "shadow00507@gmail.com")).strip()
    smtp_password = os.getenv("SMTP_PASSWORD", os.getenv("IMAP_PASSWORD", "")).strip()
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    smtp_from_name = os.getenv("SMTP_FROM_NAME", "LedgerFlow Security")

    logger.info(f"Preparing 2FA OTP email for {to_email} via SMTP {smtp_host}:{smtp_port}")

    if not smtp_user or not smtp_password:
        logger.warning(
            f"SMTP credentials not fully configured. Cannot dispatch live email to {to_email}. "
            f"[DEV 2FA OTP Code: {otp_code}]"
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = f"LedgerFlow Security: Your 2FA Verification Code is {otp_code}"
    msg["From"] = f"{smtp_from_name} <{smtp_user}>"
    msg["To"] = to_email

    # Plain text version
    msg.set_content(
        f"Hello {full_name},\n\n"
        f"Your LedgerFlow Two-Factor Authentication (2FA) verification code is:\n\n"
        f"    {otp_code}\n\n"
        f"This code will expire in 5 minutes.\n"
        f"If you did not request this login code, please contact your System Administrator immediately.\n\n"
        f"— LedgerFlow Corporate Security"
    )

    # HTML rich email
    msg.add_alternative(
        f"""\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }}
    .brand {{ font-size: 18px; font-weight: 800; color: #4338ca; display: flex; align-items: center; margin-bottom: 24px; letter-spacing: -0.5px; }}
    h2 {{ font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; }}
    p {{ color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; }}
    .code-box {{ background: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%); border: 1.5px solid #818cf8; border-radius: 14px; padding: 20px 24px; text-align: center; margin: 24px 0; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.1); }}
    .otp {{ font-family: 'SF Mono', Consolas, Menlo, Monaco, monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #3730a3; }}
    .footer {{ font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">⚡ LedgerFlow Enterprise Security</div>
    <h2>Two-Factor Verification (2FA)</h2>
    <p>Hello <strong>{full_name}</strong>,</p>
    <p>Please enter the following 6-digit verification code to complete your corporate sign-in:</p>
    
    <div class="code-box">
      <div class="otp">{otp_code}</div>
    </div>
    
    <p><strong>Notice:</strong> This verification code expires in <strong>5 minutes</strong>. Never share this code with anyone.</p>
    
    <div class="footer">
      If you did not initiate this login request, please alert corporate IT and security immediately.<br>
      © 2026 LedgerFlow Autonomous AP Pipeline. All rights reserved.
    </div>
  </div>
</body>
</html>
""",
        subtype="html"
    )

    try:
        if smtp_use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        try:
            logger.info(f"2FA OTP email successfully sent to {to_email}")
        except Exception:
            pass
        return True
    except Exception as e:
        try:
            logger.error(f"Failed to send 2FA OTP email to {to_email}: {e}")
        except Exception:
            pass
        return False
