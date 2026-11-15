import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.notification import NotificationService
from app.config import get_settings

@pytest.mark.asyncio
async def test_fast2sms_dispatch_logic():
    settings = get_settings()
    with patch.object(settings, "fast2sms_api_key", "test_fast2sms_key"):
        service = NotificationService()
        assert service.is_sms_configured() is True

        # Test phone number formatting and POST call
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"return": True, "request_id": "req_123", "message": ["SMS sent successfully."]}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_get_client", return_value=mock_client):
            # Test with +91 international format
            success = await service.send_phone_otp("+919876543210", "123456", purpose="recovery")
            assert success is True
            mock_client.post.assert_called_once()
            call_kwargs = mock_client.post.call_args[1]
            assert call_kwargs["json"]["numbers"] == "9876543210"
            assert "123456" in call_kwargs["json"]["message"]
            assert call_kwargs["headers"]["authorization"] == "test_fast2sms_key"

@pytest.mark.asyncio
async def test_twilio_dispatch_fallback():
    settings = get_settings()
    with patch.object(settings, "fast2sms_api_key", ""), \
         patch.object(settings, "twilio_account_sid", "AC123"), \
         patch.object(settings, "twilio_auth_token", "token123"), \
         patch.object(settings, "twilio_from_number", "+1234567890"):
        service = NotificationService()
        assert service.is_sms_configured() is True

        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_get_client", return_value=mock_client):
            success = await service.send_username_sms("+919876543210", "Agent007")
            assert success is True
            mock_client.post.assert_called_once()
            call_kwargs = mock_client.post.call_args[1]
            assert call_kwargs["data"]["To"] == "+919876543210"
            assert "Agent007" in call_kwargs["data"]["Body"]



@pytest.mark.asyncio
async def test_phone_recovery_zero_cost_email_fallback(setup_db):
    """Verifies that when SMS provider is unconfigured, phone recovery seamlessly uses email for ₹0."""
    from app.services.notification import notification_service
    with patch.object(notification_service, "is_sms_configured", return_value=False), \
         patch.object(notification_service, "is_email_configured", return_value=True), \
         patch.object(notification_service, "send_email_otp", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True

        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/auth/forgot-password", json={
                "channel": "phone",
                "identifier": "+919876543210"
            })
            assert res.status_code == 200
            data = res.json()
            assert "dispatched" in data["message"].lower()
