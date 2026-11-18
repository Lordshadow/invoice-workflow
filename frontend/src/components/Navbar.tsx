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
  Check
} from 'lucide-react';
import type { UserSession } from '../types/invoice';

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
    role: 'ACCOUNTANT',
  },
  {
    username: 'sarah.approver',
    fullName: 'Sarah Jenkins',
    role: 'APPROVER',
  },
  {
    username: 'alex.supervisor',
    fullName: 'Alex Vance',
    role: 'SUPERVISOR',
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
    <header className="sticky top-0 z-40 px-4 md:px-8 py-3">
      <div className="max-w-[1300px] mx-auto liquid-card-frosted px-6 py-2.5 flex items-center justify-between border-white/80 shadow-lg relative">
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
        </nav>

        {/* Right: Maker-Checker Role Switcher & Upload Action */}
        <div className="flex items-center space-x-3">
          {/* User / Maker-Checker Role Pill */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="liquid-pill px-3 py-1.5 flex items-center space-x-2 text-xs cursor-pointer border border-white/80 hover:bg-white/60 transition-all duration-200 active:scale-95 shadow-xs"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                {activeUser.role === 'APPROVER' ? (
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-800 leading-tight">
                  {activeUser.fullName}
                </span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                  {activeUser.role === 'ACCOUNTANT' ? 'Maker (Editor)' : 'Checker (Approver)'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Smooth Floating Role Dropdown (Pure Absolute with Fade/Scale) */}
            <div 
              style={{ position: 'absolute' }}
              className={`absolute right-0 top-full mt-2 w-64 bg-white/95 backdrop-blur-2xl rounded-2xl p-2.5 shadow-2xl border border-white/90 z-50 transition-all duration-200 ease-out origin-top-right ${
                isDropdownOpen 
                  ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
                  : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
              }`}
            >
              <div className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 mb-1.5">
                Maker-Checker Persona
              </div>
              <div className="space-y-1">
                {PRESET_USERS.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => {
                      onUserChange(u);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs transition-all duration-150 flex items-center justify-between cursor-pointer ${
                      activeUser.username === u.username
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-slate-700 hover:bg-slate-100/70'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{u.fullName}</div>
                      <div className="text-[10px] opacity-80 font-medium">
                        {u.role === 'ACCOUNTANT' ? 'Accountant (Maker)' : 'Approver (Checker)'}
                      </div>
                    </div>
                    {activeUser.username === u.username && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </button>
                ))}
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
        </div>
      </div>
    </header>
  );
};
