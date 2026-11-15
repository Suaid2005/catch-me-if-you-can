"""
app/services/notification.py
────────────────────────────
Genuine notification service for email and SMS delivery.

Supported free/production providers:
1. Resend API (Free tier: 3,000 emails/month, 100 emails/day)
   Env: RESEND_API_KEY, SMTP_FROM_EMAIL
2. SMTP (Works with Gmail SMTP, Brevo, SendGrid, Mailjet, AWS SES, etc.)
   Env: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_USE_TLS
3. Twilio SMS (Phone verification OTPs)
   Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

Security rules:
- Never log raw passwords, reset tokens, or OTPs in production logs.
- Never claim delivery occurred when no provider was configured or dispatch failed.
"""
import smtplib
import asyncio
import logging
from email.message import EmailMessage
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class NotificationService:
    def __init__(self):
        self._http_client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=10.0)
        return self._http_client

    def is_email_configured(self) -> bool:
        """Returns True if either Resend API or SMTP host is configured."""
        if bool(settings.resend_api_key and settings.resend_api_key.strip()):
            return True
        if bool(settings.smtp_host and settings.smtp_host.strip()):
            return True
        return False

    def is_sms_configured(self) -> bool:
        """Returns True if Twilio credentials and from_number are configured."""
        return bool(
            settings.twilio_account_sid.strip()
            and settings.twilio_auth_token.strip()
            and settings.twilio_from_number.strip()
        )

    async def send_email(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str | None = None,
    ) -> bool:
        """
        Dispatches an email via Resend or SMTP.
        Returns True if delivered, False if provider is not configured or delivery fails.
        """
        if settings.resend_api_key and settings.resend_api_key.strip():
            return await self._send_resend_email(to_email, subject, text_content, html_content)
        elif settings.smtp_host and settings.smtp_host.strip():
            return await self._send_smtp_email(to_email, subject, text_content, html_content)

        # Provider is not configured
        if settings.is_development:
            logger.info(
                "[DEV EMAIL DISPATCH SIMULATED] To: %s | Subject: %s | Body: %s",
                to_email,
                subject,
                text_content,
            )
            return True
        else:
            logger.warning(
                "[NOTIFICATION] Email provider is unconfigured in production. Suppression for %s",
                to_email,
            )
            return False

    async def _send_resend_email(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str | None = None,
    ) -> bool:
        client = await self._get_client()
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key.strip()}",
            "Content-Type": "application/json",
        }
        from_email = settings.smtp_from_email.strip() if settings.smtp_from_email else ""
        if not from_email or "catchme.game" in from_email:
            from_email = "onboarding@resend.dev"

        payload = {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text_content,
        }
        if html_content:
            payload["html"] = html_content

        try:
            res = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
            if res.status_code in (200, 201):
                logger.info("[NOTIFICATION] Resend dispatch success to %s", to_email)
                return True
            else:
                logger.error("[NOTIFICATION] Resend API error %d: %s", res.status_code, res.text)
                return False
        except Exception as e:
            logger.error("[NOTIFICATION] Failed to dispatch via Resend API: %s", str(e))
            return False

    async def _send_smtp_email(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str | None = None,
    ) -> bool:
        def _sync_send() -> bool:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = settings.smtp_from_email
            msg["To"] = to_email
            msg.set_content(text_content)
            if html_content:
                msg.add_alternative(html_content, subtype="html")

            try:
                if settings.smtp_use_tls:
                    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                        server.starttls()
                        if settings.smtp_username and settings.smtp_password:
                            server.login(settings.smtp_username, settings.smtp_password)
                        server.send_message(msg)
                else:
                    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                        if settings.smtp_username and settings.smtp_password:
                            server.login(settings.smtp_username, settings.smtp_password)
                        server.send_message(msg)
                return True
            except Exception as exc:
                logger.error("[NOTIFICATION] SMTP delivery failed: %s", str(exc))
                return False

        return await asyncio.to_thread(_sync_send)

    async def send_username_recovery(self, to_email: str, username: str) -> bool:
        """Sends account username recovery email."""
        subject = "Catch Me If You Can — Your Detective Username"
        text = (
            f"Hello Detective,\n\n"
            f"A request was received to retrieve the username associated with this email address.\n\n"
            f"Your registered username is: {username}\n\n"
            f"You can log in to Catch Me If You Can at: {settings.app_base_url}\n\n"
            f"If you did not request this, you can safely ignore this email.\n"
        )
        html = (
            f"<div style='font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px;'>"
            f"<h2 style='color: #00F5D4;'>Catch Me If You Can?</h2>"
            f"<p>Hello Detective,</p>"
            f"<p>Your registered username is: <strong style='color: #FFD166; font-size: 1.1em;'>{username}</strong></p>"
            f"<p><a href='{settings.app_base_url}' style='background: #00F5D4; color: #020617; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: bold;'>Log In to Catch Me</a></p>"
            f"<p style='color: #64748b; font-size: 0.85em; margin-top: 24px;'>If you did not make this request, you can safely disregard this email.</p>"
            f"</div>"
        )
        return await self.send_email(to_email, subject, text, html)

    async def send_password_reset(self, to_email: str, username: str, reset_token: str) -> bool:
        """Sends single-use 15-minute expiring password reset link."""
        reset_link = f"{settings.app_base_url.rstrip('/')}/?reset_token={reset_token}"
        subject = "Catch Me If You Can — Password Reset Request"
        text = (
            f"Hello {username},\n\n"
            f"We received a request to reset your password for Catch Me If You Can.\n\n"
            f"Please click the secure link below to reset your password:\n"
            f"{reset_link}\n\n"
            f"This link is single-use and will expire in 15 minutes.\n"
            f"If you did not request a password reset, please ignore this email.\n"
        )
        html = (
            f"<div style='font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px;'>"
            f"<h2 style='color: #00F5D4;'>Catch Me If You Can?</h2>"
            f"<p>Hello <strong>{username}</strong>,</p>"
            f"<p>A password reset was requested for your account. This link is single-use and valid for <strong>15 minutes</strong>.</p>"
            f"<p><a href='{reset_link}' style='background: #E94560; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;'>Reset Password</a></p>"
            f"<p style='color: #94a3b8; font-size: 0.9em;'>Or copy and paste this URL into your browser:<br/><code>{reset_link}</code></p>"
            f"<p style='color: #64748b; font-size: 0.85em; margin-top: 24px;'>If you did not request this, no action is needed.</p>"
            f"</div>"
        )
        return await self.send_email(to_email, subject, text, html)

    async def send_email_otp(self, to_email: str, otp: str, purpose: str = "registration") -> bool:
        """Dispatches a 6-digit verification code via email."""
        action_name = "account registration" if purpose == "registration" else "account recovery"
        subject = f"Catch Me If You Can — Verification Code: {otp}"
        text = (
            f"Hello Detective,\n\n"
            f"Your verification code for {action_name} is: {otp}\n\n"
            f"This code is single-use and valid for 5 minutes.\n"
            f"If you did not request this, please disregard this email.\n"
        )
        html = (
            f"<div style='font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px; max-width: 480px;'>"
            f"<h2 style='color: #00F5D4; margin-top: 0;'>Catch Me If You Can?</h2>"
            f"<p>Hello Detective,</p>"
            f"<p>Your verification code for <strong>{action_name}</strong> is:</p>"
            f"<div style='background: #1e293b; padding: 16px; border-radius: 6px; text-align: center; margin: 16px 0;'>"
            f"<span style='color: #FFD166; font-size: 2em; letter-spacing: 6px; font-weight: bold;'>{otp}</span>"
            f"</div>"
            f"<p style='color: #94a3b8; font-size: 0.9em;'>This code is single-use and expires in <strong>5 minutes</strong>.</p>"
            f"<p style='color: #64748b; font-size: 0.85em; margin-top: 24px;'>If you did not request this code, no action is required.</p>"
            f"</div>"
        )
        return await self.send_email(to_email, subject, text, html)

    async def send_username_sms(self, phone_number: str, username: str) -> bool:
        """Sends account username recovery SMS."""
        body = f"[Catch Me If You Can] Your registered detective username is: {username}"
        return await self._dispatch_sms(phone_number, body)

    async def send_phone_otp(self, phone_number: str, otp: str, purpose: str = "registration") -> bool:
        """Dispatches a one-time verification code via Twilio SMS."""
        action_name = "verification" if purpose == "registration" else "password reset"
        body = f"[Catch Me If You Can] Your {action_name} code is: {otp}. Valid for 5 minutes."
        return await self._dispatch_sms(phone_number, body)

    async def _dispatch_sms(self, phone_number: str, body: str) -> bool:
        if not self.is_sms_configured():
            if settings.is_development:
                logger.info(
                    "[DEV SMS DISPATCH SIMULATED] To: %s | Body: %s",
                    phone_number,
                    body,
                )
                return True
            else:
                logger.warning(
                    "[NOTIFICATION] SMS provider is unconfigured in production. Suppression for %s",
                    phone_number,
                )
                return False

        client = await self._get_client()
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
        auth = (settings.twilio_account_sid, settings.twilio_auth_token)
        data = {
            "From": settings.twilio_from_number,
            "To": phone_number,
            "Body": body,
        }

        try:
            res = await client.post(url, data=data, auth=auth)
            if res.status_code in (200, 201):
                logger.info("[NOTIFICATION] Twilio SMS dispatch success to %s", phone_number)
                return True
            else:
                logger.error("[NOTIFICATION] Twilio API error %d: %s", res.status_code, res.text)
                return False
        except Exception as e:
            logger.error("[NOTIFICATION] Failed to dispatch via Twilio: %s", str(e))
            return False


notification_service = NotificationService()

