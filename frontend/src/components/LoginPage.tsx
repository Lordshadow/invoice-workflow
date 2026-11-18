import React, { useState } from 'react';
import { 
  Cpu, 
  Lock, 
  User, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  UserCheck, 
  Users, 
  KeyRound, 
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

const PRESET_ACCOUNTS: Array<{
  username: string;
  fullName: string;
  role: 'ACCOUNTANT' | 'APPROVER' | 'SUPERVISOR';
  title: string;
  email: string;
  badge: string;
  badgeColor: string;
  description: string;
}> = [
  {
    username: 'sarah.approver',
    fullName: 'Sarah Jenkins',
    role: 'APPROVER',
    title: 'Financial Controller / Senior Approver',
    email: 'sarah.jenkins@enterprise.com',
    badge: 'Executive Checker',
    badgeColor: 'bg-emerald-500/20 text-emerald-800 border-emerald-400/40',
    description: 'Executive authority to approve audited vouchers and commit directly to the Target ERP ledger.',
  },
  {
    username: 'john.accountant',
    fullName: 'John Doe',
    role: 'ACCOUNTANT',
    title: 'Senior Accounts Payable Specialist',
    email: 'john.doe@enterprise.com',
    badge: 'Staff Maker (Editor)',
    badgeColor: 'bg-indigo-500/20 text-indigo-800 border-indigo-400/40',
    description: 'Ingests invoices, performs line-item reconciliation, and flags math/duplicate exceptions.',
  },
  {
    username: 'alex.supervisor',
    fullName: 'Alex Vance',
    role: 'SUPERVISOR',
    title: 'Chief Financial Controller & Administrator',
    email: 'alex.vance@enterprise.com',
    badge: 'System Administrator',
    badgeColor: 'bg-purple-500/20 text-purple-800 border-purple-400/40',
    description: 'System-wide audit trail access, policy thresholds, and destination ERP ledger oversight.',
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('sarah.approver');
  const [password, setPassword] = useState('approver123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username, password);
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

  const handleSelectPreset = (preset: typeof PRESET_ACCOUNTS[0]) => {
    setUsername(preset.username);
    setPassword('password123');
    setError(null);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 md:p-8 selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background */}
      <LiquidBackground />

      <div className="relative z-10 max-w-xl w-full mx-auto">
        {/* Floating Liquid Glass Login Card */}
        <div className="liquid-card-frosted p-8 sm:p-10 shadow-2xl border-white/80 backdrop-blur-3xl">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-white/40">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg text-white border border-white/70 mb-3">
              <Cpu className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              LedgerFlow Enterprise
            </h1>
            <p className="text-xs text-slate-600 font-medium mt-1 max-w-sm">
              Autonomous Invoice Ingestion, ERP Delivery & Dual-Control Governance Portal
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Select Profile Pills */}
          <div className="mt-6">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Fast Role Sign-In (Maker-Checker Profiles)
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PRESET_ACCOUNTS.map((preset) => {
                const isSelected = username === preset.username;
                return (
                  <button
                    key={preset.username}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3.5 rounded-2xl text-left border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-white/95 border-indigo-600 shadow-lg ring-2 ring-indigo-500/50 scale-[1.01]'
                        : 'bg-white/50 border-white/70 hover:bg-white/75 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        preset.role === 'APPROVER'
                          ? 'bg-emerald-100 text-emerald-700'
                          : preset.role === 'ACCOUNTANT'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {preset.role === 'APPROVER' ? (
                          <UserCheck className="w-4 h-4" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-extrabold text-slate-900">
                            {preset.fullName}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${preset.badgeColor}`}>
                            {preset.badge}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {preset.title}
                        </div>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="flex items-center space-x-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-600 shrink-0">
                        Select
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Corporate Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. sarah.approver or john.accountant"
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Security Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your corporate password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all duration-200 active:scale-98 border border-white/30 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <KeyRound className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Executive Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Compliance & Governance Footer */}
          <div className="mt-6 pt-4 border-t border-white/40 flex items-center justify-between text-[10px] text-slate-500">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>SOC-2 Type II Certified</span>
            </div>
            <span>Dual-Control Governance Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
