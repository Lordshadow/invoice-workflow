import React from 'react';
import { 
  Grid, 
  ChevronDown, 
  Camera, 
  User, 
  PieChart, 
  ShieldCheck, 
  Settings, 
  Play, 
  Folder, 
  DollarSign, 
  Heart, 
  Box, 
  Flower2 
} from 'lucide-react';
import type { UserSession } from '../types/invoice';

interface LiquidDocksProps {
  currentTab: 'queue' | 'escalated' | 'target_erp';
  onTabChange: (tab: 'queue' | 'escalated' | 'target_erp') => void;
  onOpenUpload: () => void;
  activeUser: UserSession;
  onUserChange: (user: UserSession) => void;
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

export const LiquidDocks: React.FC<LiquidDocksProps> = ({
  currentTab,
  onTabChange,
  onOpenUpload,
  activeUser,
  onUserChange,
  escalatedCount,
}) => {
  return (
    <>
      {/* Left Vertical Floating Glass Dock (Matches Left Edge of Image) */}
      <aside className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center space-y-3.5">
        {/* 1. Grid / App Hub */}
        <button
          onClick={() => onTabChange('queue')}
          title="Invoice Registry & Overview"
          className="liquid-dock-icon bg-white/40 text-slate-700 hover:text-indigo-900"
        >
          <Grid className="w-5 h-5 text-indigo-700" />
        </button>

        {/* 2. Cyan-Teal Gradient Squircle Chevron */}
        <div 
          onClick={() => onTabChange('queue')}
          className="liquid-dock-icon bg-gradient-to-tr from-cyan-400 to-teal-300 text-white shadow-lg shadow-cyan-500/25 border-cyan-200/60"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </div>

        {/* 3. Sunset Pink/Orange Gradient Camera Icon (Opens Ingestion Upload Modal!) */}
        <button
          onClick={onOpenUpload}
          title="Ingest Invoice Document"
          className="liquid-dock-icon bg-gradient-to-tr from-pink-500 via-rose-400 to-amber-400 text-white shadow-lg shadow-pink-500/30 border-pink-200/70"
        >
          <Camera className="w-5 h-5 text-white" />
        </button>

        {/* 4. User Persona Avatar Squircle (Maker-Checker Switcher) */}
        <div className="relative group">
          <div 
            title={`Active Persona: ${activeUser.fullName} (${activeUser.role})`}
            className="liquid-dock-icon bg-white/45 text-slate-800 hover:bg-white/60 border-white/80"
          >
            <User className="w-5 h-5 text-indigo-800" />
          </div>

          {/* Quick Flyout Menu on Hover */}
          <div className="absolute left-full ml-3 top-0 w-52 liquid-card-frosted p-2.5 hidden group-hover:block shadow-2xl border border-white/80 z-50">
            <div className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-1 tracking-wider">
              Maker-Checker Switcher
            </div>
            {PRESET_USERS.map((u) => (
              <button
                key={u.username}
                onClick={() => onUserChange(u)}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs transition-colors flex items-center justify-between ${
                  activeUser.username === u.username
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <span>{u.fullName}</span>
                <span className="text-[9px] opacity-80 uppercase">{u.role}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Pie / Quarter Chart Icon (Human Review Queue) */}
        <button
          onClick={() => onTabChange('escalated')}
          title="Human Review Queue"
          className={`liquid-dock-icon transition-all ${
            currentTab === 'escalated'
              ? 'bg-indigo-600 text-white shadow-indigo-500/40'
              : 'bg-white/40 text-slate-700 hover:text-indigo-900'
          }`}
        >
          <PieChart className="w-5 h-5 text-indigo-700" />
          {escalatedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
              {escalatedCount}
            </span>
          )}
        </button>

        {/* 6. ID Badge / Governance Icon */}
        <div 
          onClick={() => onTabChange('target_erp')}
          title="Target ERP Ledger"
          className="liquid-dock-icon bg-indigo-500/30 text-indigo-900 border-indigo-200/60"
        >
          <ShieldCheck className="w-5 h-5 text-indigo-800" />
        </div>

        {/* Small floating glass droplet */}
        <div className="w-3.5 h-3.5 rounded-full liquid-sphere-large mt-1 opacity-80" />
      </aside>

      {/* Right Vertical Floating Glass Dock (Matches Right Edge of Image) */}
      <aside className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center space-y-3.5">
        {/* 1. Deep Cobalt Blue Flower / Clover */}
        <div 
          title="Straight-Through Processing Engine"
          className="liquid-dock-icon bg-indigo-700 text-white shadow-lg shadow-indigo-700/30 border-indigo-400/50"
        >
          <Flower2 className="w-5 h-5 text-white" />
        </div>

        {/* 2. Frosted White Gear / Settings */}
        <div 
          title="System Settings & OCC Locks"
          className="liquid-dock-icon bg-white/40 text-slate-700 hover:text-indigo-900"
        >
          <Settings className="w-5 h-5 text-slate-700" />
        </div>

        {/* 3. Blue Play / Preview Squircle */}
        <button
          onClick={() => onTabChange('queue')}
          title="Review Canvas Workspace"
          className="liquid-dock-icon bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-600/30 border-blue-300/60"
        >
          <Play className="w-5 h-5 text-white fill-white" />
        </button>

        {/* 4. Frosted Folder Document Registry */}
        <button
          onClick={() => onTabChange('queue')}
          title="Invoice Registry"
          className={`liquid-dock-icon ${
            currentTab === 'queue' ? 'bg-white/70 text-indigo-900 font-bold' : 'bg-white/40 text-slate-700'
          }`}
        >
          <Folder className="w-5 h-5 text-indigo-800" />
        </button>

        {/* 5. Currency Dollar Blue Circle (Target ERP Egress) */}
        <button
          onClick={() => onTabChange('target_erp')}
          title="Target Company ERP Database"
          className={`liquid-dock-icon rounded-full ${
            currentTab === 'target_erp'
              ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg'
              : 'bg-blue-500/25 text-blue-900 border-blue-300/60'
          }`}
        >
          <DollarSign className="w-5 h-5 text-blue-900 font-bold" />
        </button>

        {/* 6. Gold Heart / Diamond (Pipeline Health) */}
        <div 
          title="100% Deterministic Financial Accuracy"
          className="liquid-dock-icon bg-gradient-to-tr from-amber-400 to-yellow-300 text-white shadow-lg shadow-amber-400/30 border-amber-200/70"
        >
          <Heart className="w-5 h-5 text-white fill-white" />
        </div>

        {/* 7. Crystal 3D Cube (ACID Immutability Ledger) */}
        <div 
          title="ACID Transaction Ledger"
          className="liquid-dock-icon bg-white/45 text-slate-700 border-white/80"
        >
          <Box className="w-5 h-5 text-indigo-700" />
        </div>
      </aside>
    </>
  );
};
