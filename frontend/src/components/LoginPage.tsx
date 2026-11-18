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
  AlertCircle,
  Mail,
  Building,
  UserPlus,
  LogIn
} from 'lucide-react';
import { LiquidBackground } from './LiquidBackground';
import { api } from '../services/api';
import type { UserSession } from '../types/invoice';

interface LoginPageProps {
  onLogin: (user: UserSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  
  // Sign In Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Registration Form State
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'ACCOUNTANT' | 'APPROVER'>('ACCOUNTANT');
  const [regDepartment, setRegDepartment] = useState('Accounts Payable Operations');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    setLoading(true);

    try {
      const res = await api.register({
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
        full_name: regFullName.trim(),
        requested_role: regRole,
        department: regDepartment.trim(),
      });

      // Switch to sign-in tab with success notice
      setActiveTab('signin');
      setUsername(regUsername.trim());
      setPassword('');
      setSuccessNotice(res.message || 'Staff registration submitted! Your account is pending Administrator review and approval.');
      
      // Reset registration form
      setRegFullName('');
      setRegEmail('');
      setRegUsername('');
      setRegPassword('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Staff registration failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 md:p-8 selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background */}
      <LiquidBackground />

      <div className="relative z-10 max-w-xl w-full mx-auto">
        {/* Floating Liquid Glass Auth Card */}
        <div className="liquid-card-frosted p-7 sm:p-10 shadow-2xl border-white/80 backdrop-blur-3xl">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center pb-5 border-b border-white/40">
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

          {/* Tab Switcher: Sign In vs Register Staff */}
          <div className="mt-5 flex p-1 rounded-2xl bg-white/50 border border-white/80 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeTab === 'signin'
                  ? 'bg-white text-indigo-900 shadow-sm border border-indigo-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Staff Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setError(null);
                setSuccessNotice(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white text-indigo-900 shadow-sm border border-indigo-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register New Staff</span>
            </button>
          </div>

          {/* Success Notice Banner */}
          {successNotice && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-900 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-medium">{successNotice}</div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-900 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN FORM */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="mt-5 space-y-4 animate-in fade-in duration-150">
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
                    placeholder="Enter your username or corporate email"
                    required
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
                    placeholder="Enter your password"
                    required
                    className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    <span>Verifying Credentials...</span>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2 text-[11px] text-slate-500 font-medium">
                New staff member?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setError(null);
                  }}
                  className="text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Register staff account
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: REGISTER NEW STAFF FORM */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="mt-5 space-y-3.5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Full Legal Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Clara Smith"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Corporate Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="e.g. clara@enterprise.com"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Desired Username
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. clara.maker"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password (Min 6 chars)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Create secure password"
                      required
                      minLength={6}
                      className="w-full pl-9 pr-8 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Department
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value)}
                    placeholder="e.g. Accounts Payable Operations"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              {/* Requested Role Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Requested Governance Role
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRegRole('ACCOUNTANT')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      regRole === 'ACCOUNTANT'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs'
                        : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-black">Staff Maker (Accountant)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Line-item editing, arithmetic reconciliation, and exception resolution.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('APPROVER')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      regRole === 'APPROVER'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                        : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-xs font-black">Executive Approver (Checker)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Sign-off authority to approve vouchers and commit directly to Destination ERP.
                    </p>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-300/60 text-amber-950 text-[11px] font-medium flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  All staff registrations require review and activation by a System Administrator before login is enabled.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/25 border border-white/60 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Submitting Application...</span>
                  ) : (
                    <>
                      <span>Submit Staff Application</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2 text-[11px] text-slate-500 font-medium">
                Already have an active account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setError(null);
                  }}
                  className="text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Badge */}
          <div className="mt-7 pt-4 border-t border-white/40 flex items-center justify-center space-x-2 text-[10px] font-bold text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>NIST PBKDF2-HMAC-SHA256 Encrypted · Dual-Control Maker-Checker Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
};
