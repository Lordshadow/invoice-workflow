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
  Building
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
                          <select
                            disabled={isWorking}
                            value={staff.role}
                            onChange={(e) => handleRoleChange(staff.id || '', e.target.value)}
                            className="text-xs px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold cursor-pointer focus:ring-2 focus:ring-indigo-400"
                          >
                            <option value="ACCOUNTANT">Maker (Accountant)</option>
                            <option value="APPROVER">Checker (Approver)</option>
                            <option value="ADMIN">Administrator</option>
                          </select>
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
    </div>
  );
};
