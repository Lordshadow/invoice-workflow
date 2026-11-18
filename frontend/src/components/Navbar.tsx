import React, { useState, useRef, useEffect } from 'react';
import { 
  FileCheck2, 
  Plus, 
  ShieldCheck, 
  UserCheck, 
  Users, 
  Cpu, 
  Database,
  ChevronDown,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import type { UserSession } from '../types/invoice';

interface NavbarProps {
  currentTab: 'queue' | 'escalated' | 'target_erp' | 'admin';
  onTabChange: (tab: 'queue' | 'escalated' | 'target_erp' | 'admin') => void;
  activeUser: UserSession;
  onUserChange?: (user: UserSession) => void;
  onOpenUpload: () => void;
  escalatedCount: number;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  activeUser,
  onOpenUpload,
  escalatedCount,
  onLogout,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-3 sm:px-6 md:px-8 py-3">
      <div className="max-w-[1720px] mx-auto liquid-navbar px-4 sm:px-6 py-2.5 flex items-center justify-between border-white/80 shadow-lg relative">
        {/* Left: Brand & Operational Status */}
        <div className="flex items-center space-x-3.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-md text-white border border-white/60 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold tracking-tight text-slate-900">
                LedgerFlow
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-indigo-700 font-bold border border-white/90">
                Autonomous Pipeline
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Pipeline Active</span>
            </div>
          </div>
        </div>

        {/* Center: Navigation Pill Switcher */}
        <nav className="hidden md:flex items-center p-1 rounded-full bg-white/40 border border-white/70 space-x-1 shadow-sm">
          <button
            onClick={() => onTabChange('queue')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              currentTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-700 hover:text-indigo-900 hover:bg-white/50'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Invoice Registry</span>
            </span>
          </button>

          <button
            onClick={() => onTabChange('escalated')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              currentTab === 'escalated'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-700 hover:text-amber-800 hover:bg-white/50'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Human Review Queue</span>
              {escalatedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-amber-700 font-extrabold ml-1">
                  {escalatedCount}
                </span>
              )}
            </span>
          </button>

          <button
            onClick={() => onTabChange('target_erp')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              currentTab === 'target_erp'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-700 hover:text-blue-900 hover:bg-white/50'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>Target ERP Ledger</span>
            </span>
          </button>

          {(activeUser.role === 'ADMIN' || activeUser.role === 'SUPERVISOR') && (
            <button
              onClick={() => onTabChange('admin')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-purple-900 hover:bg-white/50'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Staff & Governance</span>
              </span>
            </button>
          )}
        </nav>

        {/* Right: Authenticated User Persona & Ingest Action */}
        <div className="flex items-center space-x-3">
          {/* Authenticated User Capsule */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="liquid-pill px-3 py-1.5 flex items-center space-x-2 text-xs cursor-pointer border border-white/80 hover:bg-white/60 transition-all duration-200 active:scale-95 shadow-xs"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 ${
                activeUser.role === 'APPROVER'
                  ? 'bg-emerald-100 text-emerald-700'
                  : activeUser.role === 'ACCOUNTANT'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {activeUser.role === 'APPROVER' ? (
                  <UserCheck className="w-3.5 h-3.5" />
                ) : (
                  <Users className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-800 leading-tight">
                  {activeUser.fullName}
                </span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                  {activeUser.role === 'ACCOUNTANT' 
                    ? 'Maker (Editor)' 
                    : activeUser.role === 'APPROVER' 
                    ? 'Checker (Approver)' 
                    : 'Administrator'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Seamless Liquid Glass Profile Card (Zero UI Mismatch!) */}
            <div 
              style={{ position: 'absolute' }}
              className={`absolute right-0 top-full mt-2 w-72 liquid-dropdown-glass p-3 shadow-2xl z-50 transition-all duration-200 ease-out origin-top-right ${
                isDropdownOpen 
                  ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
                  : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
              }`}
            >
              {/* Profile Card Header */}
              <div className="flex items-center space-x-3 pb-3 border-b border-white/50">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                  activeUser.role === 'APPROVER'
                    ? 'bg-gradient-to-tr from-emerald-600 to-teal-400'
                    : activeUser.role === 'ACCOUNTANT'
                    ? 'bg-gradient-to-tr from-indigo-600 to-cyan-400'
                    : 'bg-gradient-to-tr from-purple-600 to-indigo-500'
                }`}>
                  {activeUser.role === 'APPROVER' ? (
                    <UserCheck className="w-5 h-5" />
                  ) : (
                    <Users className="w-5 h-5" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-black text-slate-900 truncate">
                    {activeUser.fullName}
                  </div>
                  <div className="text-[10px] text-slate-600 truncate font-medium">
                    {activeUser.email || `${activeUser.username}@enterprise.com`}
                  </div>
                  <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mt-1 border ${
                    activeUser.role === 'APPROVER'
                      ? 'bg-emerald-500/20 text-emerald-900 border-emerald-400/40'
                      : activeUser.role === 'ACCOUNTANT'
                      ? 'bg-indigo-500/20 text-indigo-900 border-indigo-400/40'
                      : 'bg-purple-500/20 text-purple-900 border-purple-400/40'
                  }`}>
                    {activeUser.role === 'ACCOUNTANT' 
                      ? 'Maker Authority' 
                      : activeUser.role === 'APPROVER' 
                      ? 'Checker Authority' 
                      : 'Full Admin Authority'}
                  </span>
                </div>
              </div>

              {/* Verified Account Details */}
              <div className="mt-3 p-3 rounded-xl bg-white/40 border border-white/60 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-bold text-slate-500">Department:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[140px]">{activeUser.department || 'Finance & Accounts'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-bold text-slate-500">Governance Status:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full text-[10px]">
                    Active Verified
                  </span>
                </div>
              </div>

              {/* Sign Out Action Button */}
              <div className="mt-3 pt-2 border-t border-white/50">
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onLogout();
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-rose-800 text-xs font-bold flex items-center justify-center space-x-1.5 transition-all duration-150 cursor-pointer shadow-xs active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span>Sign Out of Workspace</span>
                </button>
              </div>
            </div>
          </div>

          {/* Ingest Invoice Button (Liquid Gradient) */}
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all duration-200 active:scale-95 border border-white/40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ingest Document</span>
          </button>

          {/* Mobile / Tablet Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="md:hidden liquid-pill p-2 rounded-xl text-slate-700 hover:text-indigo-900 border border-white/80 cursor-pointer shadow-xs active:scale-95"
            title="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4 text-slate-800" /> : <Menu className="w-4 h-4 text-slate-800" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Responsive Drawer Menu (Accessible below 768px) */}
      {isMobileMenuOpen && (
        <div className="md:hidden max-w-[1720px] mx-auto mt-2 p-3 rounded-2xl liquid-dropdown-glass border border-white/80 shadow-2xl space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-0.5">
            Navigation Views
          </div>
          <button
            onClick={() => {
              onTabChange('queue');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
              currentTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-700 hover:bg-white/60 bg-white/30'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <FileCheck2 className="w-4 h-4" />
              <span>Invoice Registry</span>
            </div>
            <span className="text-[10px] opacity-80 font-normal">All vouchers</span>
          </button>

          <button
            onClick={() => {
              onTabChange('escalated');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
              currentTab === 'escalated'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-700 hover:bg-white/60 bg-white/30'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Human Review Queue</span>
            </div>
            {escalatedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-white text-amber-800 font-extrabold shadow-xs">
                {escalatedCount} Action Needed
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onTabChange('target_erp');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
              currentTab === 'target_erp'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-700 hover:bg-white/60 bg-white/30'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Database className="w-4 h-4" />
              <span>Target ERP Ledger</span>
            </div>
            <span className="text-[10px] opacity-80 font-normal">ACID Egress</span>
          </button>

          {(activeUser.role === 'ADMIN' || activeUser.role === 'SUPERVISOR') && (
            <button
              onClick={() => {
                onTabChange('admin');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                currentTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-700 hover:bg-white/60 bg-white/30'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Staff & Governance</span>
              </div>
              <span className="text-[10px] opacity-80 font-normal">Admin Portal</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
