import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Lock, 
  User, 
  ArrowRight, 
  ArrowLeft,
  ShieldCheck, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Mail,
  KeyRound,
  RefreshCw,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { LiquidBackground } from './LiquidBackground';
import { api } from '../services/api';
import type { UserSession } from '../types/invoice';

interface LoginPageProps {
  onLogin: (user: UserSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  // Sign In Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA OTP State
  const [requires2Fa, setRequires2Fa] = useState(false);
  const [preAuthToken, setPreAuthToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);

  // Countdown timer for 2FA expiration
  useEffect(() => {
    if (!requires2Fa || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [requires2Fa, timeLeft]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username.trim(), password);
      if (res.requires_2fa && res.pre_auth_token) {
        setRequires2Fa(true);
        setPreAuthToken(res.pre_auth_token);
        setMaskedEmail(res.masked_email || 'your registered corporate email');
        setTimeLeft(res.expires_in_seconds || 300);
        setDevOtpHint(res.dev_otp_hint || null);
        setOtpCode('');
      } else if (res.user) {
        onLogin(res.user);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to authenticate with corporate directory.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.verifyOtp(preAuthToken, otpCode.trim());
      onLogin(res.user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed. Please check the code and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resending || !preAuthToken) return;
    setResending(true);
    setError(null);
    setResendSuccess(null);

    try {
      const res = await api.resendOtp(preAuthToken);
      setResendSuccess(res.message || 'A fresh verification code has been dispatched.');
      setTimeLeft(res.expires_in_seconds || 300);
      if (res.dev_otp_hint) {
        setDevOtpHint(res.dev_otp_hint);
      }
      setTimeout(() => setResendSuccess(null), 5000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to resend code. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2Fa(false);
    setPreAuthToken('');
    setOtpCode('');
    setError(null);
    setDevOtpHint(null);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 md:p-8 selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background */}
      <LiquidBackground />

      <div className="relative z-10 max-w-md w-full mx-auto">
        {/* Floating Liquid Glass Auth Card */}
        <div className="liquid-card-frosted p-7 sm:p-10 shadow-2xl border-white/80 backdrop-blur-3xl transition-all duration-300">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-white/40">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg text-white border border-white/70 mb-3">
              {requires2Fa ? <KeyRound className="w-8 h-8 animate-pulse" /> : <Cpu className="w-8 h-8" />}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {requires2Fa ? 'Security Verification' : 'LedgerFlow Enterprise'}
            </h1>
            <p className="text-xs text-slate-600 font-medium mt-1 max-w-xs">
              {requires2Fa
                ? 'Two-Factor Authentication (2FA) is enforced for authorized administrative and staff access.'
                : 'Autonomous Invoice Ingestion, ERP Delivery & Dual-Control Governance Portal'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-900 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {resendSuccess && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-900 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-medium">{resendSuccess}</span>
            </div>
          )}

          {/* 2FA OTP STEP */}
          {requires2Fa ? (
            <form onSubmit={handleVerifyOtp} className="mt-6 space-y-5">
              <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-100 flex items-start space-x-3 text-xs text-indigo-950">
                <Mail className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Verification Code Sent:</span>
                  <p className="mt-0.5 text-slate-700">
                    We sent a 6-digit one-time passcode to{' '}
                    <strong className="font-bold text-indigo-900">{maskedEmail}</strong>.
                  </p>
                </div>
              </div>

              {devOtpHint && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-900 text-[11px] flex items-center justify-between font-mono">
                  <span>Dev Preview OTP:</span>
                  <span className="font-black text-xs tracking-widest bg-amber-200/80 px-2 py-0.5 rounded">
                    {devOtpHint}
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Enter 6-Digit Code
                  </label>
                  <span className="flex items-center space-x-1 text-[11px] font-semibold text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span className={timeLeft < 60 ? 'text-rose-600 font-bold' : ''}>
                      {formatTimer(timeLeft)}
                    </span>
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpCode(clean);
                  }}
                  placeholder="000000"
                  required
                  autoFocus
                  className="w-full py-3.5 text-center text-2xl font-mono font-black tracking-[0.45em] rounded-2xl liquid-input placeholder-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6 || timeLeft === 0}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/30 border border-white/60 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Verifying Code...</span>
                  ) : (
                    <>
                      <span>Verify & Enter Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back to Sign In</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                    <span>{resending ? 'Sending...' : 'Resend Code'}</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* STANDARD SIGN IN FORM */
            <form onSubmit={handleSignIn} className="mt-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Corporate Username or Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin or shadow00507@gmail.com"
                    required
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter corporate password"
                    required
                    className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/30 border border-white/60 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2 text-[11px] text-slate-500 font-medium">
                Protected by Email OTP Two-Factor Authentication.
              </div>
            </form>
          )}

          {/* Footer Security Badge */}
          <div className="mt-8 pt-4 border-t border-white/40 flex items-center justify-center space-x-2 text-[10px] font-bold text-slate-500 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>NIST PBKDF2-HMAC-SHA256 Encrypted · 2FA OTP · Dual-Control Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
};
