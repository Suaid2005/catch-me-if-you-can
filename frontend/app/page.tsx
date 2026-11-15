/**
 * app/page.tsx
 * ─────────────
 * Modern Game Lobby for 'Catch Me If You Can?'.
 *
 * Game Interface begins immediately below the header:
 * 1. ONLINE MULTIPLAYER (Dominant Hero Lobby Card with Dual CTAs)
 * 2. PRACTICE VS AI (Neural AI training arena)
 * 3. LOCAL PASS & PLAY (Single device party mode with eye-shield)
 * 4. COSMETIC VAULT & MISSIONS (Player progression and unlocks)
 * 5. PROMOTION BANNER: "Your Detective Journey Starts Here" (Guest Motivation)
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useGameStore } from "@/lib/store";
import { authApi, roomApi, ApiError } from "@/lib/api";
import { sound } from "@/lib/sound";
import SettingsModal from "@/components/ui/SettingsModal";
import GameHeader from "@/components/ui/GameHeader";
import { CountryPhoneInput } from "@/components/ui/CountryPhoneInput";
import {
  MultiplayerIcon,
  PracticeIcon,
  PassAndPlayIcon,
  VaultIcon,
  SecretStepIcon,
  ClueStepIcon,
  VoteStepIcon,
} from "@/components/ui/GameModeIcons";
import type { TokenResponse } from "@/types/game.types";

const Avatar3D = dynamic(() => import("@/components/ui/Avatar3D"), { ssr: false });

const AVATARS = [
  "avatar_classic_detective",
  "avatar_cyber_detective",
  "avatar_shadow_agent",
  "avatar_neon_hacker",
  "avatar_golden_investigator",
  "avatar_mystery_phantom",
];

type ModalType = null | "create_room" | "join_room" | "auth" | "settings";
type AuthMode =
  | "login"
  | "register"
  | "verify_email"
  | "verify_phone"
  | "forgot_username"
  | "forgot_password"
  | "forgot_password_otp"
  | "reset_password";

export default function HomePage() {
  const router = useRouter();
  const { user, setAuth, setRoom, progression, hydrateProgression, hydrateAuth } = useGameStore();
  const [mounted, setMounted] = useState(false);

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  // Forms
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("avatar_classic_detective");
  const [roomCodeInput, setRoomCodeInput] = useState("");

  // Auth fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  // Dual OTP Verification state
  const [registrationToken, setRegistrationToken] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [devEmailOtp, setDevEmailOtp] = useState<string | null>(null);
  const [devPhoneOtp, setDevPhoneOtp] = useState<string | null>(null);
  const [resendCooldownEmail, setResendCooldownEmail] = useState(0);
  const [resendCooldownPhone, setResendCooldownPhone] = useState(0);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState("");
  const [isNewPhoneValid, setIsNewPhoneValid] = useState(false);

  // Recovery fields
  const [recoveryChannel, setRecoveryChannel] = useState<"email" | "phone">("email");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [isRecoveryPhoneValid, setIsRecoveryPhoneValid] = useState(false);
  const [recoveryChallengeId, setRecoveryChallengeId] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryDevOtp, setRecoveryDevOtp] = useState<string | null>(null);
  const [recoveryTargetMasked, setRecoveryTargetMasked] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    hydrateAuth();
    hydrateProgression();
    setMounted(true);

    // Check for recoverable pending registration across browser reloads
    try {
      const saved = localStorage.getItem("catchme_pending_registration");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.registration_token) {
          setRegistrationToken(parsed.registration_token);
          setPendingEmail(parsed.email || "");
          setPendingPhone(parsed.phone_number || "");
          setDevEmailOtp(parsed.dev_email_otp || null);
          setDevPhoneOtp(parsed.dev_phone_otp || null);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [hydrateAuth, hydrateProgression]);

  // Resend OTP Cooldown Timers
  useEffect(() => {
    if (resendCooldownEmail > 0) {
      const timer = setTimeout(() => setResendCooldownEmail((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldownEmail]);

  useEffect(() => {
    if (resendCooldownPhone > 0) {
      const timer = setTimeout(() => setResendCooldownPhone((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldownPhone]);

  useEffect(() => {
    if (user?.username) {
      setDisplayName(user.username);
    }
    if (user?.avatar) {
      setSelectedAvatar(user.avatar);
    }
  }, [user]);

  // Ensure user is authenticated (as guest or existing member) before creating/joining
  const ensureUserSession = async (): Promise<boolean> => {
    if (user) return true;
    try {
      const name = displayName.trim() || `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await authApi.guest(name);
      setAuth(res.user, res.access_token, res.refresh_token);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to establish player session");
      return false;
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const ok = await ensureUserSession();
      if (!ok) return;

      const room = await roomApi.create({ max_players: 8, allow_bots: true });
      setRoom(room);
      sound.playVictory();
      router.push(`/lobby/${room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create multiplayer room");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      setError("Please enter a 6-letter room code");
      return;
    }
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const ok = await ensureUserSession();
      if (!ok) return;

      const { room } = await roomApi.join(code);
      setRoom(room);
      sound.playVictory();
      router.push(`/lobby/${room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Room not found or match already started");
    } finally {
      setLoading(false);
    }
  };

  const validateRegistrationForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!username.trim() || username.trim().length < 3) {
      errors.username = "Codename must be at least 3 characters";
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      errors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = "Please enter a valid email address";
    }
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)\.]/g, "");
    if (!cleanPhone) {
      errors.phoneNumber = "Phone number is required";
    } else if (!isPhoneValid) {
      errors.phoneNumber = "Please enter a valid national phone number for the selected country";
    }
    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAccountAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    setFieldErrors({});

    try {
      if (authMode === "login") {
        const res = await authApi.login(username.trim(), password);
        setAuth(res.user, res.access_token, res.refresh_token);
        sound.playVictory();
        setActiveModal(null);
      } else {
        if (!validateRegistrationForm()) {
          setLoading(false);
          return;
        }
        const regRes = await authApi.register({
          username: username.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim(),
          password,
          confirm_password: confirmPassword,
        });

        // If the server auto-activated on zero-cost infrastructure, log in immediately
        if (regRes.is_active && regRes.tokens) {
          setAuth(
            {
              id: regRes.user_id,
              username: regRes.username,
              avatar: "avatar_classic_detective",
              games_played: 0,
              games_won: 0,
              is_guest: false,
            },
            regRes.tokens.access_token,
            regRes.tokens.refresh_token
          );
          hydrateProgression(regRes.user_id);
          sound.playVictory();
          setActiveModal(null);
          return;
        }

        // Store pending registration for recovery
        const pendingObj = {
          registration_token: regRes.registration_token,
          user_id: regRes.user_id,
          username: regRes.username,
          email: regRes.email,
          phone_number: regRes.phone_number,
          email_verified: regRes.email_verified,
          phone_verified: regRes.phone_verified,
          dev_email_otp: regRes.dev_email_otp,
          dev_phone_otp: regRes.dev_phone_otp,
        };
        localStorage.setItem("catchme_pending_registration", JSON.stringify(pendingObj));

        setRegistrationToken(regRes.registration_token);
        setPendingEmail(regRes.email);
        setPendingPhone(regRes.phone_number);
        setDevEmailOtp(regRes.dev_email_otp || null);
        setDevPhoneOtp(regRes.dev_phone_otp || null);
        setResendCooldownEmail(60);
        setEmailOtp("");
        setPhoneOtp("");
        setAuthMode("verify_email");
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403 && err.data?.registration_token) {
        const regToken = err.data.registration_token;
        setRegistrationToken(regToken);
        if (err.data.email) setPendingEmail(err.data.email);
        if (err.data.phone_number) setPendingPhone(err.data.phone_number);
        if (err.data.email_verified && !err.data.phone_verified) {
          setAuthMode("verify_phone");
        } else {
          setAuthMode("verify_email");
        }
        setError(err.message || "Account verification incomplete. Please verify your email and phone.");
        return;
      }
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.verifyEmailOtp(registrationToken, emailOtp.trim());
      if (res.is_active && res.tokens && res.user) {
        localStorage.removeItem("catchme_pending_registration");
        setAuth(res.user, res.tokens.access_token, res.tokens.refresh_token);
        sound.playVictory();
        setActiveModal(null);
      } else {
        sound.playClick();
        setAuthMode("verify_phone");
        setResendCooldownPhone(60);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Email verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.verifyPhoneOtp(registrationToken, phoneOtp.trim());
      if (res.is_active && res.tokens && res.user) {
        localStorage.removeItem("catchme_pending_registration");
        setAuth(res.user, res.tokens.access_token, res.tokens.refresh_token);
        sound.playVictory();
        setActiveModal(null);
      } else if (!res.email_verified) {
        setAuthMode("verify_email");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Phone verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (channel: "email" | "phone") => {
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.resendRegisterOtp(registrationToken, channel);
      if (channel === "email") {
        setResendCooldownEmail(60);
        if (res.dev_otp) setDevEmailOtp(res.dev_otp);
      } else {
        setResendCooldownPhone(60);
        if (res.dev_otp) setDevPhoneOtp(res.dev_otp);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to resend ${channel} code`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.changeRegisterEmail(registrationToken, newEmailInput.trim());
      setPendingEmail(res.email || newEmailInput.trim());
      if (res.dev_email_otp) setDevEmailOtp(res.dev_email_otp);
      setShowChangeEmail(false);
      setNewEmailInput("");
      setResendCooldownEmail(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update email address");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.changeRegisterPhone(registrationToken, newPhoneInput.trim());
      setPendingPhone(res.phone_number || newPhoneInput.trim());
      if (res.dev_phone_otp) setDevPhoneOtp(res.dev_phone_otp);
      setShowChangePhone(false);
      setNewPhoneInput("");
      setResendCooldownPhone(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update phone number");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    setRecoverySuccessMsg("");

    try {
      const identifier = recoveryChannel === "email" ? recoveryEmail.trim() : recoveryPhone.trim();
      if (!identifier) {
        setError(recoveryChannel === "email" ? "Please enter your registered email" : "Please enter your registered phone number");
        setLoading(false);
        return;
      }
      const res = await authApi.recoverUsername({ channel: recoveryChannel, identifier });
      setRecoverySuccessMsg(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Recovery request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    setRecoverySuccessMsg("");

    try {
      const identifier = recoveryChannel === "email" ? recoveryEmail.trim() : recoveryPhone.trim();
      if (!identifier) {
        setError(recoveryChannel === "email" ? "Please enter your registered email" : "Please enter your registered phone number");
        setLoading(false);
        return;
      }
      const res = await authApi.forgotPassword({ channel: recoveryChannel, identifier });
      setRecoveryChallengeId(res.challenge_id);
      setRecoveryTargetMasked(res.target_masked);
      setRecoverySuccessMsg(res.message);
      setRecoveryOtp("");
      setAuthMode("forgot_password_otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyForgotPasswordOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");

    try {
      const res = await authApi.verifyForgotPasswordOtp(recoveryChallengeId, recoveryOtp.trim());
      setResetToken(res.reset_token);
      setAuthMode("reset_password");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired recovery code");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    setRecoverySuccessMsg("");

    if (newPassword !== confirmResetPassword) {
      setError("New passwords do not match");
      setLoading(false);
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const res = await authApi.resetPassword({
        reset_token: resetToken.trim(),
        new_password: newPassword,
        confirm_password: confirmResetPassword,
      });
      setRecoverySuccessMsg(res.message);
      setTimeout(() => {
        setAuthMode("login");
        setRecoverySuccessMsg("");
      }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  const level = mounted ? (progression?.level ?? 1) : 1;
  const coins = mounted ? (progression?.coins ?? 150) : 150;

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between selection:bg-purple-600 selection:text-white">
      {/* Background Ambience & Soft Atmospheric Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] bg-cyan-600/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-1/3 w-[36rem] h-[36rem] bg-indigo-600/10 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      {/* TOP NAVIGATION / GAMING HUD HEADER */}
      <GameHeader
        onOpenAuth={() => {
          sound.playClick();
          setAuthMode("login");
          setActiveModal("auth");
        }}
        onOpenSettings={() => {
          sound.playClick();
          setActiveModal("settings");
        }}
      />

      {/* MAIN GAME LOBBY VIEWPORT */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-2 sm:py-4 flex-1 flex flex-col justify-center">
        {/* LOBBY INTRO & STATUS BAR */}
        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-black uppercase tracking-wider shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Social Deduction Arena • 3–12 Players
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
            Ready to Catch the Impostor?
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
            Bluff as the secret Impostor, give subtle clues as the Detective, or sharpen your deduction instincts.
          </p>
        </div>

        {/* 4 PRIMARY GAME MODE CARDS */}
        <div id="game-modes-section" className="w-full space-y-4 sm:space-y-5">
          {/* 1. DOMINANT HERO: ONLINE MULTIPLAYER */}
          <div className="relative group overflow-hidden rounded-2xl sm:rounded-3xl p-[2px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 shadow-2xl shadow-purple-950/50 transition-all duration-300 hover:shadow-cyan-500/20">
            <div className="relative bg-gradient-to-br from-slate-950 via-purple-950/60 to-slate-900 rounded-[14px] sm:rounded-[22px] p-5 sm:p-6 md:p-8 backdrop-blur-xl">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-3 max-w-xl text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-black uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Primary Mode
                    </span>
                    <span className="text-[11px] font-mono text-gray-400 bg-slate-900/80 px-2 py-0.5 rounded border border-gray-800">
                      Real-Time WebSockets
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-600/30 to-cyan-600/30 border border-purple-400/40 flex items-center justify-center shrink-0 shadow-lg shadow-purple-600/20 group-hover:scale-105 transition-transform">
                      <MultiplayerIcon size={26} className="text-cyan-300" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white">
                        Online Multiplayer
                      </h2>
                      <p className="text-[11px] sm:text-xs text-purple-300 font-semibold tracking-wide">
                        Host or join live rooms with friends across any device
                      </p>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                    Create a private room with a 6-letter invite code or join friends on their phones and computers. Includes live timed clue rounds, private role cards, and secret voting booths!
                  </p>

                  <div className="flex flex-wrap gap-2 text-[11px] font-mono text-gray-400 pt-1">
                    <span className="bg-slate-900/90 px-2 py-1 rounded border border-gray-800/80">👥 3–12 Players</span>
                    <span className="bg-slate-900/90 px-2 py-1 rounded border border-gray-800/80">🔑 Room Code</span>
                    <span className="bg-slate-900/90 px-2 py-1 rounded border border-gray-800/80">🤖 Bot Fill Option</span>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
                  <button
                    onClick={() => { sound.playClick(); setActiveModal("create_room"); }}
                    className="px-6 py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm tracking-wider uppercase shadow-lg shadow-purple-600/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>Create Room</span>
                    <span className="text-xs">→</span>
                  </button>
                  <button
                    onClick={() => { sound.playClick(); setActiveModal("join_room"); }}
                    className="px-6 py-3.5 sm:py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-500/50 hover:border-cyan-400 text-cyan-300 font-black text-xs sm:text-sm tracking-wider uppercase shadow-lg shadow-cyan-900/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>Join with Code</span>
                    <span className="text-xs">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3 SUPPORTING CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {/* 2. PRACTICE VS AI */}
            <div
              onClick={() => { sound.playClick(); router.push("/practice"); }}
              className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-900/80 border border-purple-500/30 hover:border-purple-400 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-950/40 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PracticeIcon size={22} className="text-purple-300" />
                  </div>
                  <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                    Solo Offline
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                    Practice vs AI
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Test your wits against 3 neural AI bot detectives with genuine deductive reasoning. No lobby wait needed.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-purple-400 font-bold">
                <span>Play Solo Training</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

            {/* 3. LOCAL PASS & PLAY */}
            <div
              onClick={() => { sound.playClick(); router.push("/pass-and-play"); }}
              className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-900/80 border border-emerald-500/30 hover:border-emerald-400 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-950/40 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PassAndPlayIcon size={22} className="text-emerald-300" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                    1 Phone/PC
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                    Local Pass & Play
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Gather around one device. Features privacy eye-shield curtains so each player reveals their role secretly.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-emerald-400 font-bold">
                <span>Start Party Mode</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

            {/* 4. COSMETIC VAULT & MISSIONS */}
            <div
              onClick={() => { sound.playClick(); router.push("/vault"); }}
              className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-900/80 border border-amber-500/30 hover:border-amber-400 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-950/40 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <VaultIcon size={22} className="text-amber-300" />
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60 flex items-center gap-1">
                    <span>🪙</span> {coins}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                    Vault & Detective Shop
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Spend match coins to unlock Cyber, Shadow, and Gold detective character avatars, subtle frames, and vote stamps!
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-amber-400 font-bold">
                <span>Open Cosmetic Shop</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </div>
        </div>

        {/* PROMOTION BANNER: "Your Detective Journey Starts Here" (GUEST ONLY) */}
        {mounted && (!user || user.is_guest) && (
          <div
            data-testid="guest-registration-banner"
            className="w-full mt-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border border-purple-500/40 shadow-xl space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-black uppercase tracking-wider mb-1.5 border border-purple-500/30">
                  <span>⭐</span> Detective Career Progression
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400">
                  Your Detective Journey Starts Here
                </h3>
                <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
                  Play instantly as a guest anytime, or create a free detective account to permanently save your career achievements:
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    sound.playClick();
                    setAuthMode("register");
                    setError("");
                    setFieldErrors({});
                    setActiveModal("auth");
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-pink-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all hover:scale-105 active:scale-95"
                >
                  Create Your Free Account →
                </button>
                <button
                  onClick={() => {
                    sound.playClick();
                    const el = document.getElementById("game-modes-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-gray-700 bg-slate-900/80 hover:bg-slate-800 text-gray-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Continue as Guest
                </button>
              </div>
            </div>

            {/* Benefit Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-gray-800/80 text-[11px]">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-gray-800">
                <span className="text-base">🆔</span>
                <span className="text-gray-300 font-medium">Keep Your Detective Identity</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-gray-800">
                <span className="text-base">⭐</span>
                <span className="text-gray-300 font-medium">Build XP & Level Up</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-gray-800">
                <span className="text-base">🕵️</span>
                <span className="text-gray-300 font-medium">Collect Exclusive Avatars</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-gray-800">
                <span className="text-base">🪙</span>
                <span className="text-gray-300 font-medium">Save Your Coin Balance</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-gray-800 col-span-2 sm:col-span-1">
                <span className="text-base">📊</span>
                <span className="text-gray-300 font-medium">Track Match History</span>
              </div>
            </div>
          </div>
        )}

        {/* COMPACT HOW-TO-PLAY 3-STEP GUIDE */}
        <div className="w-full mt-6 pt-5 border-t border-gray-800/60">
          <div className="text-center mb-3">
            <span className="text-[10px] font-mono tracking-widest text-purple-400 uppercase">
              Match Rules in 30 Seconds
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-900/40 border border-gray-800/80 rounded-xl p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <SecretStepIcon size={18} className="text-amber-400" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-amber-300">1. Secret Word Revealed</h4>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Citizens receive the secret word. The Impostor receives no word and must fake it.
                </p>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-gray-800/80 rounded-xl p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <ClueStepIcon size={18} className="text-purple-400" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-purple-300">2. Give Subtle Clues</h4>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Give a one-word or short clue. Be specific enough for allies, cryptic enough to hide from the impostor.
                </p>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-gray-800/80 rounded-xl p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <VoteStepIcon size={18} className="text-rose-400" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-rose-300">3. Debate & Vote</h4>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Debate inconsistencies and vote out the suspect. If caught, the impostor can steal the win by guessing!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COMPACT FOOTER */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-4 py-3 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-gray-800/40 mt-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-400">Catch Me If You Can?</span>
          <span>•</span>
          <span>Multiplayer Social Deduction Game</span>
        </div>
        <div className="flex items-center gap-3 text-gray-500 font-mono text-[11px]">
          <span>📱 Mobile & Tablet Ready</span>
          <span>•</span>
          <span>💻 Desktop Web</span>
        </div>
      </footer>

      {/* MODAL: CREATE ROOM */}
      {activeModal === "create_room" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-slide-up">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mx-auto mb-2">
                <MultiplayerIcon size={26} className="text-purple-300" />
              </div>
              <h3 className="text-xl font-black text-white">Create Game Room</h3>
              <p className="text-xs text-gray-400">
                Set your player identity and start a private room for your group.
              </p>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Equipped Detective Avatar Identity */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-purple-500/30">
                <Avatar3D
                  avatar={progression?.equippedAvatar || user?.avatar || "avatar_classic_detective"}
                  name={displayName || user?.username || "You"}
                  size="md"
                  interactive={false}
                  animated={false}
                  frame={progression?.equippedFrame}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">
                    Equipped Detective Avatar
                  </span>
                  <strong className="text-xs sm:text-sm text-white truncate block">
                    {displayName || user?.username || "Detective Agent"}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    router.push("/vault");
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors shrink-0"
                >
                  Vault →
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Your Nickname / Codename
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Detective Holmes"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold"
                  maxLength={18}
                />
              </div>

              {error && (
                <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-sm uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {loading ? "Generating Room..." : "Launch Game Lobby →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: JOIN ROOM */}
      {activeModal === "join_room" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-slide-up">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mx-auto mb-2">
                <MultiplayerIcon size={26} className="text-cyan-300" />
              </div>
              <h3 className="text-xl font-black text-white">Join Game Room</h3>
              <p className="text-xs text-gray-400">
                Enter the 6-letter room code shared by your match host.
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              {/* Equipped Detective Avatar Identity */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-cyan-500/30">
                <Avatar3D
                  avatar={progression?.equippedAvatar || user?.avatar || "avatar_classic_detective"}
                  name={displayName || user?.username || "You"}
                  size="md"
                  interactive={false}
                  animated={false}
                  frame={progression?.equippedFrame}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                    Equipped Detective Avatar
                  </span>
                  <strong className="text-xs sm:text-sm text-white truncate block">
                    {displayName || user?.username || "Detective Agent"}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  6-Letter Room Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. S6ZR6H"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  className="w-full text-center tracking-widest text-2xl font-mono uppercase bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-3 text-cyan-300 placeholder-gray-600 focus:outline-none focus:border-cyan-400 font-black"
                  maxLength={6}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Your Nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 font-bold"
                  maxLength={18}
                />
              </div>

              {error && (
                <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-black text-sm uppercase tracking-wider text-white shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Connect to Room →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUTH / SIGN IN & REGISTRATION & RECOVERY */}
      {activeModal === "auth" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative animate-slide-up max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setActiveModal(null);
                setError("");
                setFieldErrors({});
                setRecoverySuccessMsg("");
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>

            {/* TAB SELECTOR: SIGN IN vs REGISTER (Hidden during verification and recovery) */}
            {(authMode === "login" || authMode === "register") && (
              <div className="flex border-b border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError("");
                    setFieldErrors({});
                    setRecoverySuccessMsg("");
                  }}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                    authMode === "login"
                      ? "border-purple-500 text-purple-400"
                      : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setError("");
                    setFieldErrors({});
                    setRecoverySuccessMsg("");
                  }}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                    authMode === "register"
                      ? "border-purple-500 text-purple-400"
                      : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Register New Agent
                </button>
              </div>
            )}

            {/* 1. SIGN IN FORM */}
            {authMode === "login" && (
              <form onSubmit={handleAccountAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Player Codename or Registered Email
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DetectiveAlex or alex@catchme.test"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                  />
                  {fieldErrors.username && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.username}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                  />
                  {fieldErrors.password && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.password}</p>
                  )}
                </div>

                {error && (
                  <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5 space-y-2">
                    <p>⚠️ {error}</p>
                    {registrationToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setAuthMode("verify_email");
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
                      >
                        Complete Verification Now →
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                >
                  {loading ? "Authenticating..." : "Sign In →"}
                </button>

                <div className="pt-2 flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot_username");
                      setError("");
                      setRecoverySuccessMsg("");
                    }}
                    className="hover:text-purple-300 transition-colors"
                  >
                    Forgot Username?
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot_password");
                      setError("");
                      setRecoverySuccessMsg("");
                    }}
                    className="hover:text-purple-300 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            )}

            {/* 2. REGISTRATION FORM (Dual Email + Phone Required) */}
            {authMode === "register" && (
              <form onSubmit={handleAccountAuth} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Player Codename / Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DetectiveAlex"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                  />
                  {fieldErrors.username && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.username}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-gray-300 uppercase">
                      Email Address
                    </label>
                    <span className="text-[10px] text-amber-400/90 font-medium">OTP Verified</span>
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="alex@detective.agency"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                  {fieldErrors.email && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-gray-300 uppercase">
                      Phone Number
                    </label>
                    <span className="text-[10px] text-amber-400/90 font-medium">SMS Verified</span>
                  </div>
                  <CountryPhoneInput
                    value={phoneNumber}
                    onChange={(e164, isValid) => {
                      setPhoneNumber(e164);
                      setIsPhoneValid(isValid);
                    }}
                    error={fieldErrors.phoneNumber}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                  />
                  {fieldErrors.password && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.password}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-[11px] text-rose-400 mt-1 font-semibold">⚠️ {fieldErrors.confirmPassword}</p>
                  )}
                </div>

                {error && (
                  <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                >
                  {loading ? "Starting Verification..." : "Create Detective Account →"}
                </button>
              </form>
            )}

            {/* 3. DUAL VERIFICATION: EMAIL OTP STEP */}
            {authMode === "verify_email" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                    Step 1 of 2: Email Verification
                  </div>
                  <h4 className="text-lg font-black text-white">Check Your Inbox</h4>
                  <p className="text-xs text-gray-400">
                    We sent a 6-digit confirmation code to:
                  </p>
                  <div className="font-mono text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 py-1 px-3 rounded-lg inline-block">
                    {pendingEmail || email}
                  </div>
                </div>


                <form onSubmit={handleVerifyEmail} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                      Enter 6-Digit Email Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                      className="w-full text-center tracking-[0.5em] text-xl font-mono bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-black"
                    />
                  </div>

                  {error && (
                    <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || emailOtp.length !== 6}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
                  >
                    {loading ? "Verifying Email..." : "Confirm Email & Proceed →"}
                  </button>
                </form>

                <div className="pt-2 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                  <button
                    type="button"
                    disabled={resendCooldownEmail > 0 || loading}
                    onClick={() => handleResendOtp("email")}
                    className="text-amber-400 hover:text-amber-300 font-semibold disabled:opacity-50 transition-colors"
                  >
                    {resendCooldownEmail > 0
                      ? `Resend Code in ${resendCooldownEmail}s`
                      : "Resend Email Code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangeEmail(!showChangeEmail)}
                    className="hover:text-white transition-colors"
                  >
                    Change Email
                  </button>
                </div>

                {showChangeEmail && (
                  <form onSubmit={handleChangeEmail} className="p-3 rounded-xl bg-slate-900/90 border border-gray-800 space-y-2.5">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase">
                      New Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="new@detective.agency"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      className="w-full bg-slate-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={loading || !newEmailInput.trim()}
                      className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      Update Email & Send New OTP
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 4. DUAL VERIFICATION: PHONE OTP STEP */}
            {authMode === "verify_phone" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-black uppercase tracking-wider">
                    Step 2 of 2: Phone Verification
                  </div>
                  <h4 className="text-lg font-black text-white">Verify SMS Code</h4>
                  <p className="text-xs text-gray-400">
                    We sent a 6-digit SMS code to your phone:
                  </p>
                  <div className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 py-1 px-3 rounded-lg inline-block">
                    {pendingPhone || phoneNumber}
                  </div>
                </div>


                <form onSubmit={handleVerifyPhone} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                      Enter 6-Digit SMS Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={phoneOtp}
                      onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                      className="w-full text-center tracking-[0.5em] text-xl font-mono bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-black"
                    />
                  </div>

                  {error && (
                    <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || phoneOtp.length !== 6}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
                  >
                    {loading ? "Activating Account..." : "Verify Phone & Enter Game →"}
                  </button>
                </form>

                <div className="pt-2 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                  <button
                    type="button"
                    disabled={resendCooldownPhone > 0 || loading}
                    onClick={() => handleResendOtp("phone")}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold disabled:opacity-50 transition-colors"
                  >
                    {resendCooldownPhone > 0
                      ? `Resend SMS in ${resendCooldownPhone}s`
                      : "Resend SMS Code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangePhone(!showChangePhone)}
                    className="hover:text-white transition-colors"
                  >
                    Change Phone
                  </button>
                </div>

                {showChangePhone && (
                  <form onSubmit={handleChangePhone} className="p-3 rounded-xl bg-slate-900/90 border border-gray-800 space-y-2.5">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase">
                      New Phone Number
                    </label>
                    <CountryPhoneInput
                      value={newPhoneInput}
                      onChange={(e164, isValid) => {
                        setNewPhoneInput(e164);
                        setIsNewPhoneValid(isValid);
                      }}
                    />
                    <button
                      type="submit"
                      disabled={loading || !newPhoneInput.trim()}
                      className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      Update Phone & Send New SMS
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 5. FORGOT USERNAME FLOW (Email OR Phone) */}
            {authMode === "forgot_username" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-white">Recover Detective Codename</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setError("");
                      setRecoverySuccessMsg("");
                    }}
                    className="text-xs text-purple-400 hover:text-white"
                  >
                    ← Back to Sign In
                  </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Enter your registered email address or phone number to receive your detective codename.
                </p>

                {/* Channel Selector */}
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-gray-800">
                  <button
                    type="button"
                    onClick={() => { setRecoveryChannel("email"); setError(""); }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      recoveryChannel === "email"
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Via Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRecoveryChannel("phone"); setError(""); }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      recoveryChannel === "phone"
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Via SMS
                  </button>
                </div>

                {recoverySuccessMsg ? (
                  <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-xs text-emerald-300 font-medium">
                    ✓ {recoverySuccessMsg}
                  </div>
                ) : (
                  <form onSubmit={handleRecoverUsername} className="space-y-3">
                    {recoveryChannel === "email" ? (
                      <div>
                        <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                          Registered Email
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="alex@detective.agency"
                          value={recoveryEmail}
                          onChange={(e) => setRecoveryEmail(e.target.value)}
                          className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                          Registered Phone Number
                        </label>
                        <CountryPhoneInput
                          value={recoveryPhone}
                          onChange={(e164, isValid) => {
                            setRecoveryPhone(e164);
                            setIsRecoveryPhoneValid(isValid);
                          }}
                        />
                      </div>
                    )}

                    {error && (
                      <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                        ⚠️ {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {loading ? "Searching Registry..." : "Recover Codename →"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 6. FORGOT PASSWORD FLOW (Step 1: Choose Email or Phone Channel) */}
            {authMode === "forgot_password" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-white">Reset Detective Password</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setError("");
                      setRecoverySuccessMsg("");
                    }}
                    className="text-xs text-purple-400 hover:text-white"
                  >
                    ← Back to Sign In
                  </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Choose whether to receive a 6-digit recovery OTP via email or SMS to reset your account password.
                </p>

                {/* Channel Selector */}
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-gray-800">
                  <button
                    type="button"
                    onClick={() => { setRecoveryChannel("email"); setError(""); }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      recoveryChannel === "email"
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Via Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRecoveryChannel("phone"); setError(""); }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      recoveryChannel === "phone"
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Via SMS
                  </button>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-3">
                  {recoveryChannel === "email" ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                        Registered Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="alex@detective.agency"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                        Registered Phone Number
                      </label>
                      <CountryPhoneInput
                        value={recoveryPhone}
                        onChange={(e164, isValid) => {
                          setRecoveryPhone(e164);
                          setIsRecoveryPhoneValid(isValid);
                        }}
                      />
                    </div>
                  )}

                  {error && (
                    <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {loading ? "Generating OTP..." : "Send Verification Code →"}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode("reset_password")}
                      className="text-xs text-purple-400 hover:text-white underline"
                    >
                      Already have a reset token? Enter it here →
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 7. FORGOT PASSWORD OTP STEP (Step 2: Enter 6-digit Code) */}
            {authMode === "forgot_password_otp" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-white">Enter Recovery Code</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot_password");
                      setError("");
                    }}
                    className="text-xs text-purple-400 hover:text-white"
                  >
                    ← Back
                  </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Enter the 6-digit code dispatched to: <span className="font-mono text-amber-300 font-bold">{recoveryTargetMasked}</span>
                </p>


                <form onSubmit={handleVerifyForgotPasswordOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                      6-Digit Recovery OTP
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={recoveryOtp}
                      onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, ""))}
                      className="w-full text-center tracking-[0.5em] text-xl font-mono bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-black"
                    />
                  </div>

                  {error && (
                    <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || recoveryOtp.length !== 6}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                  >
                    {loading ? "Verifying Code..." : "Verify Code & Set Password →"}
                  </button>
                </form>
              </div>
            )}

            {/* 8. RESET PASSWORD FLOW (Step 3: New Password) */}
            {authMode === "reset_password" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-white">Set New Password</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setError("");
                      setRecoverySuccessMsg("");
                    }}
                    className="text-xs text-purple-400 hover:text-white"
                  >
                    ← Back to Sign In
                  </button>
                </div>

                {recoverySuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-xs text-emerald-300 font-medium">
                    ✓ {recoverySuccessMsg}
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-3">
                  {!resetToken && (
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                        Reset Token
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Paste your reset token"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 font-mono text-xs focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                      New Password (min 8 chars)
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmResetPassword}
                      onChange={(e) => setConfirmResetPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold text-sm"
                    />
                  </div>

                  {error && (
                    <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {loading ? "Resetting Password..." : "Confirm Password Reset →"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      <SettingsModal isOpen={activeModal === "settings"} onClose={() => setActiveModal(null)} />
    </main>
  );
}
