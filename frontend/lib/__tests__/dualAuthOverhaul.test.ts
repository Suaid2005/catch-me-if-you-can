import { describe, it, expect, beforeEach, vi } from "vitest";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";
import { authApi } from "../api";
import { COUNTRIES } from "../../components/ui/CountryPhoneInput";

describe("Dual Email + Phone Authentication Overhaul (Frontend Suite)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Phone Number Validation & E.164 Normalization via libphonenumber-js", () => {
    it("1. Correctly parses and normalizes a valid Indian (+91) phone number to E.164", () => {
      const parsed = parsePhoneNumberFromString("9876543210", "IN");
      expect(parsed).toBeDefined();
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.format("E.164")).toBe("+919876543210");
    });

    it("2. Correctly parses and normalizes a valid US (+1) phone number to E.164", () => {
      const parsed = parsePhoneNumberFromString("2125551234", "US");
      expect(parsed).toBeDefined();
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.format("E.164")).toBe("+12125551234");
    });

    it("3. Correctly parses and normalizes a valid UK (+44) phone number to E.164", () => {
      const parsed = parsePhoneNumberFromString("7911123456", "GB");
      expect(parsed).toBeDefined();
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.format("E.164")).toBe("+447911123456");
    });

    it("4. Correctly parses and normalizes a valid UAE (+971) phone number to E.164", () => {
      const parsed = parsePhoneNumberFromString("501234567", "AE");
      expect(parsed).toBeDefined();
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.format("E.164")).toBe("+971501234567");
    });

    it("5. Rejects phone numbers with invalid length or invalid format", () => {
      // Too short
      const shortNum = parsePhoneNumberFromString("123", "IN");
      expect(shortNum?.isValid() ?? false).toBe(false);

      // Too long
      const longNum = parsePhoneNumberFromString("9876543210123456", "IN");
      expect(longNum?.isValid() ?? false).toBe(false);

      // Invalid area code
      const invalidUS = parsePhoneNumberFromString("0123456789", "US");
      expect(invalidUS?.isValid() ?? false).toBe(false);
    });

    it("6. Verifies country catalogue includes India (+91), USA (+1), UK (+44), UAE (+971) and defaults to India", () => {
      expect(COUNTRIES[0].code).toBe("IN");
      expect(COUNTRIES[0].dialCode).toBe("+91");

      const codes = COUNTRIES.map((c) => c.dialCode);
      expect(codes).toContain("+91");
      expect(codes).toContain("+1");
      expect(codes).toContain("+44");
      expect(codes).toContain("+971");
    });
  });

  describe("API Client Auth Endpoints", () => {
    it("7. Dispatches registration payload with mandatory email and phone number", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "Registration successful. Verification codes sent.",
          registration_token: "reg_token_123",
          user_id: "u_1",
          username: "Agent007",
          email: "agent@catchme.test",
          phone_number: "+919876543210",
          is_active: false,
          email_verified: false,
          phone_verified: false,
        }),
      });
      global.fetch = mockFetch;

      const res = await authApi.register({
        username: "Agent007",
        email: "agent@catchme.test",
        phone_number: "+919876543210",
        password: "SecretPassword123!",
        confirm_password: "SecretPassword123!",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain("/api/auth/register");
      const body = JSON.parse(callArgs[1].body);
      expect(body.username).toBe("Agent007");
      expect(body.email).toBe("agent@catchme.test");
      expect(body.phone_number).toBe("+919876543210");
      expect(res.registration_token).toBe("reg_token_123");
    });

    it("8. Dispatches verify-email and verify-phone requests with registration token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "Email verified",
          email_verified: true,
          phone_verified: false,
          is_active: false,
        }),
      });
      global.fetch = mockFetch;

      const vEmail = await authApi.verifyEmailOtp("token_abc", "123456");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/register/verify-email"),
        expect.objectContaining({
          body: JSON.stringify({ registration_token: "token_abc", otp: "123456" }),
        })
      );
      expect(vEmail.email_verified).toBe(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: "Phone verified. Account active.",
          email_verified: true,
          phone_verified: true,
          is_active: true,
          tokens: {
            access_token: "jwt_access",
            refresh_token: "jwt_refresh",
            token_type: "bearer",
            user: { id: "u_1", username: "Agent007", avatar: "avatar_classic_detective", games_played: 0, games_won: 0, is_guest: false },
          },
        }),
      });

      const vPhone = await authApi.verifyPhoneOtp("token_abc", "654321");
      expect(vPhone.is_active).toBe(true);
      expect(vPhone.tokens?.access_token).toBe("jwt_access");
    });

    it("9. Dispatches resend OTP and change contact details requests", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "New code sent",
          channel: "email",
          resend_available_at: new Date().toISOString(),
        }),
      });
      global.fetch = mockFetch;

      await authApi.resendRegisterOtp("reg_tok", "email");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/register/resend-otp"),
        expect.objectContaining({
          body: JSON.stringify({ registration_token: "reg_tok", channel: "email" }),
        })
      );

      await authApi.changeRegisterEmail("reg_tok", "newemail@catchme.test");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/register/change-email"),
        expect.objectContaining({
          body: JSON.stringify({ registration_token: "reg_tok", email: "newemail@catchme.test" }),
        })
      );

      await authApi.changeRegisterPhone("reg_tok", "+12125551234");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/register/change-phone"),
        expect.objectContaining({
          body: JSON.stringify({ registration_token: "reg_tok", phone_number: "+12125551234" }),
        })
      );
    });

    it("10. Dispatches recovery requests supporting email and phone channels", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "Instructions dispatched" }),
      });
      global.fetch = mockFetch;

      // Recover username by email
      await authApi.recoverUsername({ channel: "email", identifier: "agent@catchme.test" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/recover-username"),
        expect.objectContaining({
          body: JSON.stringify({ channel: "email", identifier: "agent@catchme.test" }),
        })
      );

      // Recover username by phone
      await authApi.recoverUsername({ channel: "phone", identifier: "+919876543210" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/recover-username"),
        expect.objectContaining({
          body: JSON.stringify({ channel: "phone", identifier: "+919876543210" }),
        })
      );

      // Forgot password by phone
      await authApi.forgotPassword({ channel: "phone", identifier: "+919876543210" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/forgot-password"),
        expect.objectContaining({
          body: JSON.stringify({ channel: "phone", identifier: "+919876543210" }),
        })
      );
    });
  });
});

