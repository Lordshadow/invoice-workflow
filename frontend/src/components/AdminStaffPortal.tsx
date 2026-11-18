import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserCheck, 
  ShieldAlert, 
  CheckCircle2, 
  Search, 
  RotateCw, 
  AlertCircle, 
  Shield, 
  Trash2, 
  Lock, 
  Unlock, 
  Building,
  UserPlus,
  X,
  KeyRound,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ChevronDown,
  Check
} from 'lucide-react';
import { api } from '../services/api';
import type { UserSession, StaffListResponse } from '../types/invoice';

interface AdminStaffPortalProps {
  activeUser: UserSession;
  onBack?: () => void;
}

export const AdminStaffPortal: React.FC<AdminStaffPortalProps> = ({ activeUser, onBack }) => {
  const [data, setData] = useState<StaffListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'REJECTED'>('ALL');

  // Custom Role Dropdown Menu State
  const [openRoleMenuId, setOpenRoleMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenRoleMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Register Staff Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regRole, setRegRole] = useState<'ACCOUNTANT' | 'APPROVER' | 'ADMIN'>('ACCOUNTANT');
  const [regDepartment, setRegDepartment] = useState('Accounts Payable Operations');
  const [regStatus, setRegStatus] = useState<'ACTIVE' | 'PENDING_APPROVAL'>('ACTIVE');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const handleRegisterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSubmitting(true);
    try {
      const newUser = await api.adminRegisterStaff({
        full_name: regFullName.trim(),
        email: regEmail.trim(),
        username: regUsername.trim(),
        password: regPassword,
        role: regRole,
        department: regDepartment.trim(),
        status: regStatus,
      });
      setActionNotice(`Staff member '${newUser.username}' successfully registered and provisioned as ${newUser.role}.`);
      setIsRegisterModalOpen(false);
      // Reset form
      setRegFullName('');
      setRegEmail('');
      setRegUsername('');
      setRegPassword('');
      setRegRole('ACCOUNTANT');
      setRegDepartment('Accounts Payable Operations');
      setRegStatus('ACTIVE');
      await fetchStaff();
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : 'Failed to register staff member.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listStaff(statusFilter === 'ALL' ? undefined : statusFilter);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch staff directory.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleApprove = async (userId: string, role: string) => {
    try {
      setActionInProgress(userId);
      setError(null);
      await api.approveStaff(userId, role, undefined, `Approved by ${activeUser.username}`);
      setActionNotice(`Staff member approved as ${role}.`);
      await fetchStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve staff member.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (userId: string) => {
    try {
      setActionInProgress(userId);
      setError(null);
      await api.rejectStaff(userId, 'Application rejected by Administrator.');
      setActionNotice('Staff registration rejected.');
      await fetchStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject application.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setActionInProgress(userId);
      setError(null);
      await api.updateStaffRole(userId, newRole);
      setActionNotice(`Role updated to ${newRole}.`);
      await fetchStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStatusToggle = async (user: UserSession) => {
    try {
      setActionInProgress(user.id || user.username);
      setError(null);
      const targetStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await api.updateStaffStatus(user.id || '', targetStatus);
      setActionNotice(`Account status changed to ${targetStatus}.`);
      await fetchStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update account status.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete staff account '${username}'?`)) {
      return;
    }
    try {
      setActionInProgress(userId);
      setError(null);
      await api.deleteStaff(userId);
      setActionNotice(`Staff account '${username}' deleted.`);
      await fetchStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete staff account.');
    } finally {
      setActionInProgress(null);
    }
  };

  // Filter staff roster
  const staffList = data?.staff || [];
  const filteredStaff = staffList.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = s.fullName.toLowerCase().includes(q);
      const matchEmail = (s.email || '').toLowerCase().includes(q);
      const matchUser = s.username.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchUser) return false;
    }
    return true;
  });

  const pendingStaff = staffList.filter((s) => s.status === 'PENDING_APPROVAL');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="liquid-card-hero p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/30">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg border border-white/80 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  Staff & Governance Administration
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-900 border border-purple-400/40">
                  Dual-Control Authority
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Review pending staff applications, assign Maker/Checker roles, and manage corporate access
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setRegError(null);
                setIsRegisterModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-black flex items-center space-x-1.5 transition-all shadow-md shadow-indigo-500/20 border border-white/60 cursor-pointer active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Register New Staff</span>
            </button>
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-xl bg-slate-900/10 hover:bg-slate-900/20 text-slate-800 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                ← Back to Invoices
              </button>
            )}
            <button
              onClick={fetchStaff}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white/60 hover:bg-white/80 border border-white/80 text-slate-700 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 text-indigo-600 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Directory</span>
            </button>
          </div>
        </div>

        {/* Action Notice */}
        {actionNotice && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-900 text-xs flex items-center justify-between font-medium animate-in fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionNotice}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer text-xs font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-900 text-xs flex items-center justify-between font-medium animate-in fade-in">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer text-xs font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* Telemetry Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
          <div className="p-4 rounded-2xl liquid-card-frosted border border-white/80">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Total Staff</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {data?.total ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Registered Corporate Accounts
            </div>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${
            (data?.pending_count ?? 0) > 0
              ? 'bg-amber-500/15 border-amber-400/80 shadow-md animate-pulse'
              : 'liquid-card-frosted border-white/80'
          }`}>
            <div className="flex items-center justify-between text-slate-600 text-[11px] font-bold uppercase tracking-wider">
              <span>Pending Review</span>
              <ShieldAlert className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">
              {data?.pending_count ?? 0}
            </div>
            <div className="text-[10px] text-amber-800 font-bold mt-0.5">
              {(data?.pending_count ?? 0) > 0 ? 'Action Required: Approve Staff' : 'Queue Clear'}
            </div>
          </div>

          <div className="p-4 rounded-2xl liquid-card-frosted border border-white/80">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Staff Makers</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-indigo-900 mt-1">
              {data?.active_makers ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Accountants (Line Item Editors)
            </div>
          </div>

          <div className="p-4 rounded-2xl liquid-card-frosted border border-white/80">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Executive Checkers</span>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-900 mt-1">
              {data?.active_checkers ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Approvers (ERP Posting Authority)
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: PENDING STAFF APPLICATIONS (If Any) */}
      {pendingStaff.length > 0 && (
        <div className="liquid-card-frosted p-6 rounded-3xl border border-amber-400/60 shadow-lg space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              Pending Staff Registration Applications ({pendingStaff.length})
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Immediate Approval Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingStaff.map((applicant) => {
              const isWorking = actionInProgress === applicant.id;
              return (
                <div
                  key={applicant.id || applicant.username}
                  className="p-4 rounded-2xl bg-white/80 border border-amber-200/80 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-black text-slate-900">
                        {applicant.fullName}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        @{applicant.username} · {applicant.email}
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-[10px] text-slate-500">
                        <Building className="w-3 h-3 text-slate-400" />
                        <span>{applicant.department || 'Finance & Accounts'}</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                      Requested: {applicant.role}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleReject(applicant.id || '')}
                      className="px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleApprove(applicant.id || '', 'ACCOUNTANT')}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-[11px] font-extrabold shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      Approve as Maker
                    </button>

                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleApprove(applicant.id || '', 'APPROVER')}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-[11px] font-extrabold shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      Approve as Checker
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: STAFF DIRECTORY ROSTER */}
      <div className="liquid-card-frosted p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
        {/* Controls Bar: Search & Status Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name, username, or corporate email..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white/60 text-slate-600 hover:bg-white/90 border border-white/80'
                }`}
              >
                {st === 'ALL' ? 'All Staff' : st === 'PENDING_APPROVAL' ? 'Pending' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/60 bg-white/60 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Governance Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Approval Info</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40 text-xs">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500 font-medium">
                    No staff members match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const isPrimaryAdmin = staff.username === 'admin';
                  const isWorking = actionInProgress === (staff.id || staff.username);

                  return (
                    <tr key={staff.id || staff.username} className="hover:bg-white/60 transition-colors">
                      {/* 1. Staff Member */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900">{staff.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-medium font-mono">
                          @{staff.username} · {staff.email}
                        </div>
                      </td>

                      {/* 2. Role Dropdown */}
                      <td className="py-3 px-4">
                        {isPrimaryAdmin ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                            Super Administrator
                          </span>
                        ) : (
                          <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => setOpenRoleMenuId(openRoleMenuId === (staff.id || staff.username) ? null : (staff.id || staff.username))}
                              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs cursor-pointer ${
                                staff.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200'
                                  : staff.role === 'APPROVER'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-indigo-100 text-indigo-900 border-indigo-300 hover:bg-indigo-200'
                              }`}
                            >
                              <span>
                                {staff.role === 'ADMIN'
                                  ? 'Administrator'
                                  : staff.role === 'APPROVER'
                                  ? 'Checker (Approver)'
                                  : 'Maker (Accountant)'}
                              </span>
                              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                            </button>

                            {openRoleMenuId === (staff.id || staff.username) && (
                              <div className="absolute left-0 mt-1.5 w-56 rounded-2xl bg-white shadow-2xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-100 mb-1">
                                  Change Governance Role
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRoleChange(staff.id || '', 'ACCOUNTANT');
                                    setOpenRoleMenuId(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 transition-colors cursor-pointer ${
                                    staff.role === 'ACCOUNTANT'
                                      ? 'bg-indigo-50 text-indigo-950 font-black'
                                      : 'text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                                  <div className="flex-1">
                                    <div className="font-extrabold text-slate-900">Maker (Accountant)</div>
                                    <div className="text-[10px] text-slate-500 font-normal">Line-item editing & prep</div>
                                  </div>
                                  {staff.role === 'ACCOUNTANT' && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRoleChange(staff.id || '', 'APPROVER');
                                    setOpenRoleMenuId(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 transition-colors cursor-pointer ${
                                    staff.role === 'APPROVER'
                                      ? 'bg-emerald-50 text-emerald-950 font-black'
                                      : 'text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                                  <div className="flex-1">
                                    <div className="font-extrabold text-slate-900">Checker (Approver)</div>
                                    <div className="text-[10px] text-slate-500 font-normal">Final sign-off & ERP delivery</div>
                                  </div>
                                  {staff.role === 'APPROVER' && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRoleChange(staff.id || '', 'ADMIN');
                                    setOpenRoleMenuId(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center space-x-2 transition-colors cursor-pointer ${
                                    staff.role === 'ADMIN'
                                      ? 'bg-purple-50 text-purple-950 font-black'
                                      : 'text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                                  <div className="flex-1">
                                    <div className="font-extrabold text-slate-900">Administrator</div>
                                    <div className="text-[10px] text-slate-500 font-normal">Full governance access</div>
                                  </div>
                                  {staff.role === 'ADMIN' && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 3. Account Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          staff.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : staff.status === 'PENDING_APPROVAL'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : staff.status === 'SUSPENDED'
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          <span>{staff.status}</span>
                        </span>
                      </td>

                      {/* 4. Department */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {staff.department || 'Finance & Accounts'}
                      </td>

                      {/* 5. Approval Info */}
                      <td className="py-3 px-4 text-[11px] text-slate-500">
                        {staff.approvedBy ? (
                          <div>
                            <span className="font-bold text-slate-700">By:</span> {staff.approvedBy}
                          </div>
                        ) : (
                          <span className="text-amber-600 font-bold">Unapproved</span>
                        )}
                        {staff.createdAt && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(staff.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* 6. Actions */}
                      <td className="py-3 px-4 text-right">
                        {!isPrimaryAdmin && (
                          <div className="inline-flex items-center space-x-1.5">
                            {/* Toggle Suspend / Active */}
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => handleStatusToggle(staff)}
                              title={staff.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate Account'}
                              className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                staff.status === 'ACTIVE'
                                  ? 'border-amber-200 hover:bg-amber-100 text-amber-700'
                                  : 'border-emerald-200 hover:bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {staff.status === 'ACTIVE' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => handleDelete(staff.id || '', staff.username)}
                              title="Delete Staff Account"
                              className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Staff Registration Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg liquid-modal-glass p-6 sm:p-8 shadow-2xl relative border border-white/90">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/60">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md border border-white/70 shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Register New Staff Member
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    Provision corporate accounts with assigned Maker/Checker governance roles
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/40 hover:bg-white/80 border border-white/80 text-slate-500 hover:text-slate-800 transition-all shadow-xs flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {regError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-900 text-xs flex items-center space-x-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{regError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleRegisterStaff} className="mt-4 space-y-3.5">
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
                      placeholder="e.g. Priya Sharma"
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
                      placeholder="e.g. priya@enterprise.local"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. priya.maker"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl liquid-input placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Initial Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 6 characters"
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

              {/* Role Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Assign Governance Role
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegRole('ACCOUNTANT')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      regRole === 'ACCOUNTANT'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs'
                        : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold">Maker</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Accountant</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('APPROVER')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      regRole === 'APPROVER'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                        : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold">Checker</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Approver</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('ADMIN')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      regRole === 'ADMIN'
                        ? 'bg-purple-50 border-purple-400 text-purple-950 shadow-xs'
                        : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Shield className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span className="text-xs font-bold">Admin</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Governance</p>
                  </button>
                </div>
              </div>

              {/* Status Toggle */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Account Activation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegStatus('ACTIVE')}
                    className={`p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      regStatus === 'ACTIVE'
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-900'
                        : 'bg-white/50 border-white/80 text-slate-600 hover:bg-white/80'
                    }`}
                  >
                    Active Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegStatus('PENDING_APPROVAL')}
                    className={`p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      regStatus === 'PENDING_APPROVAL'
                        ? 'bg-amber-500/15 border-amber-400 text-amber-900'
                        : 'bg-white/50 border-white/80 text-slate-600 hover:bg-white/80'
                    }`}
                  >
                    Pending Review
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/60">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-black shadow-md shadow-indigo-500/20 border border-white/60 transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {regSubmitting ? (
                    <span>Provisioning...</span>
                  ) : (
                    <>
                      <span>Register & Provision Staff</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
