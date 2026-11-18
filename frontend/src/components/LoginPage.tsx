import React, { useState } from 'react';
import { 
  Cpu, 
  Lock, 
  User, 
  ArrowRight, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  AlertCircle
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username.trim(), password);
      onLogin(res.user);
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

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 md:p-8 selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background */}
      <LiquidBackground />

      <div className="relative z-10 max-w-md w-full mx-auto">
        {/* Floating Liquid Glass Auth Card */}
        <div className="liquid-card-frosted p-7 sm:p-10 shadow-2xl border-white/80 backdrop-blur-3xl">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-white/40">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg text-white border border-white/70 mb-3">
              <Cpu className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              LedgerFlow Enterprise
            </h1>
            <p className="text-xs text-slate-600 font-medium mt-1 max-w-xs">
              Autonomous Invoice Ingestion, ERP Delivery & Dual-Control Governance Portal
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-900 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* SIGN IN FORM */}
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
                  placeholder="e.g. admin or username"
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
              Staff accounts are managed and provisioned by System Administrators.
            </div>
          </form>

          {/* Footer Security Badge */}
          <div className="mt-8 pt-4 border-t border-white/40 flex items-center justify-center space-x-2 text-[10px] font-bold text-slate-500 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>NIST PBKDF2-HMAC-SHA256 Encrypted · Dual-Control Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
};
