import React from 'react';
import { 
  FileCheck2, 
  Plus, 
  ShieldCheck, 
  UserCheck, 
  Users, 
  Cpu, 
  Database,
  Bell
} from 'lucide-react';
import type { UserRole, UserSession } from '../types/invoice';

interface NavbarProps {
  currentTab: 'queue' | 'escalated' | 'target_erp';
  onTabChange: (tab: 'queue' | 'escalated' | 'target_erp') => void;
  activeUser: UserSession;
  onUserChange: (user: UserSession) => void;
  onOpenUpload: () => void;
  escalatedCount: number;
}

const PRESET_USERS: UserSession[] = [
  {
    username: 'john.accountant',
    fullName: 'John Doe',
    role: 'ACCOUNTANT' as UserRole,
  },
  {
    username: 'sarah.approver',
    fullName: 'Sarah Jenkins',
    role: 'APPROVER' as UserRole,
  },
  {
    username: 'alex.supervisor',
    fullName: 'Alex Vance',
    role: 'SUPERVISOR' as UserRole,
  },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  activeUser,
  onUserChange,
  onOpenUpload,
  escalatedCount,
}) => {
  return (
    <header className="px-6 py-4">
      <div className="max-w-[1600px] mx-auto crystal-card rounded-squircle-lg px-6 py-3 flex items-center justify-between shadow-crystal-card">
        {/* Left: Brand & Operational Status */}
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl pod-purple flex items-center justify-center text-white shadow-crystal-glow-purple">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold tracking-tight text-crystal-textPrimary">
                LedgerFlow
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200">
                Autonomous Pipeline
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-slate-600">Dual Database Live</span>
              <span className="text-slate-400">•</span>
              <span>FastAPI Engine</span>
            </div>
          </div>
        </div>

        {/* Center: Navigation Pill Switcher */}
        <nav className="hidden md:flex items-center p-1.5 rounded-full crystal-pill space-x-1.5 border border-white/80">
          <button
            onClick={() => onTabChange('queue')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-2 ${
              currentTab === 'queue'
                ? 'pod-blue text-white shadow-crystal-glow-blue'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-white/40'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Invoice Registry</span>
          </button>

          <button
            onClick={() => onTabChange('escalated')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-2 ${
              currentTab === 'escalated'
                ? 'pod-coral text-white shadow-crystal-glow-coral'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-white/40'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Human Review Queue</span>
            {escalatedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-rose-600 font-bold ml-1 shadow-sm">
                {escalatedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('target_erp')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-2 ${
              currentTab === 'target_erp'
                ? 'pod-purple text-white shadow-crystal-glow-purple'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-white/40'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Target ERP Ledger</span>
          </button>
        </nav>

        {/* Right: Notification Pill, Maker-Checker Role Switcher & Upload Action */}
        <div className="flex items-center space-x-3">
          {/* Notification Pill */}
          <div className="relative">
            <button
              onClick={() => onTabChange('escalated')}
              className="w-9 h-9 rounded-2xl crystal-pill flex items-center justify-center text-slate-600 hover:text-indigo-900 transition-colors"
              title="Escalated Cases"
            >
              <Bell className="w-4 h-4" />
              {escalatedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                  {escalatedCount}
                </span>
              )}
            </button>
          </div>

          {/* User / Maker-Checker Role Pill */}
          <div className="relative group">
            <div className="crystal-pill px-3 py-1.5 rounded-2xl flex items-center space-x-2 text-xs cursor-pointer hover:bg-white/80 transition-colors">
              <div className="w-7 h-7 rounded-xl pod-blue flex items-center justify-center text-white font-medium shadow-sm">
                {activeUser.role === 'APPROVER' ? (
                  <UserCheck className="w-3.5 h-3.5" />
                ) : (
                  <Users className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {activeUser.fullName}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {activeUser.role === 'ACCOUNTANT' ? 'Maker (Editor)' : 'Checker (Approver)'}
                </span>
              </div>
            </div>

            {/* Role dropdown for fast switching during Maker-Checker verification */}
            <div className="absolute right-0 mt-2 w-60 crystal-card rounded-squircle p-2 hidden group-hover:block shadow-2xl border border-white/90 z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-indigo-100">
                Maker-Checker Persona
              </div>
              <div className="mt-1 space-y-1">
                {PRESET_USERS.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => onUserChange(u)}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs transition-colors flex items-center justify-between ${
                      activeUser.username === u.username
                        ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                        : 'text-slate-700 hover:bg-white/60 hover:text-indigo-900'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{u.fullName}</div>
                      <div className="text-[10px] text-slate-500">
                        {u.role === 'ACCOUNTANT' ? 'Accountant (Maker)' : 'Approver (Checker)'}
                      </div>
                    </div>
                    {activeUser.username === u.username && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ingest Invoice Button */}
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-2xl pod-purple text-white text-xs font-bold flex items-center space-x-1.5 shadow-crystal-glow-purple transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ingest Voucher</span>
          </button>
        </div>
      </div>
    </header>
  );
};
