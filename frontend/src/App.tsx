import { useState, useEffect, useCallback } from 'react';
import { 
  Home, 
  BarChart2, 
  ShieldCheck, 
  Users, 
  Database, 
  UploadCloud 
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { KPICards } from './components/KPICards';
import { InvoiceQueue } from './components/InvoiceQueue';
import { SplitScreenReview } from './components/SplitScreenReview';
import { TargetERPViewer } from './components/TargetERPViewer';
import { UploadModal } from './components/UploadModal';
import { api } from './services/api';
import type { 
  EscalationStats, 
  InvoiceDetail, 
  InvoiceSummary, 
  ProcessInvoiceResult, 
  UserSession 
} from './types/invoice';

const DEFAULT_USER: UserSession = {
  username: 'john.accountant',
  fullName: 'John Doe',
  role: 'ACCOUNTANT',
};

export function App() {
  // Navigation & User Persona
  const [currentTab, setCurrentTab] = useState<'queue' | 'escalated' | 'target_erp'>('queue');
  const [activeUser, setActiveUser] = useState<UserSession>(DEFAULT_USER);

  // Data State
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [stats, setStats] = useState<EscalationStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Review Workspace State
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<InvoiceDetail | null>(null);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  // Load Invoices and Metrics
  const loadData = useCallback(async () => {
    try {
      const statsPromise = api.getEscalationStats();
      let invoicesPromise: Promise<InvoiceSummary[]>;

      if (currentTab === 'escalated' || selectedFilter === 'ESCALATED') {
        invoicesPromise = api.getEscalatedInvoices({ search: searchQuery });
      } else {
        const statusParam = selectedFilter !== 'ALL' ? selectedFilter : undefined;
        invoicesPromise = api.getInvoices({ status: statusParam, search: searchQuery });
      }

      const [statsData, invoicesData] = await Promise.all([statsPromise, invoicesPromise]);
      setStats(statsData);
      setInvoices(invoicesData);
    } catch (err) {
      console.error('Failed to load invoice pipeline data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentTab, selectedFilter, searchQuery]);

  // Initial load and periodic polling every 12 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Open invoice review
  const handleSelectInvoice = async (invoiceId: string) => {
    try {
      const detail = await api.getInvoiceDetail(invoiceId);
      setSelectedInvoiceDetail(detail);
    } catch (err) {
      console.error('Failed to load invoice details:', err);
    }
  };

  // Close review workspace
  const handleCloseReview = () => {
    setSelectedInvoiceDetail(null);
    loadData();
  };

  // When invoice is updated/approved in workspace
  const handleInvoiceUpdated = (updated: InvoiceDetail) => {
    setSelectedInvoiceDetail(updated);
    loadData();
  };

  // Switch tabs
  const handleTabChange = (tab: 'queue' | 'escalated' | 'target_erp') => {
    setCurrentTab(tab);
    setSelectedInvoiceDetail(null);
    if (tab === 'escalated') {
      setSelectedFilter('ESCALATED');
    } else if (tab === 'queue') {
      setSelectedFilter('ALL');
    }
  };

  // Filter click from KPI cards
  const handleKpiFilterClick = (filter: string) => {
    if (filter === 'ESCALATED') {
      setCurrentTab('escalated');
      setSelectedFilter('ESCALATED');
    } else {
      setCurrentTab('queue');
      setSelectedFilter(filter);
    }
    setSelectedInvoiceDetail(null);
  };

  // Successful upload
  const handleUploadSuccess = (res: ProcessInvoiceResult) => {
    loadData();
    if (res.invoice_id) {
      handleSelectInvoice(res.invoice_id);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 flex py-6 px-4 md:px-8 selection:bg-purple-200 selection:text-purple-900">
      {/* 3D Ambient Lighting Background Flares (Reference Image Depth) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-10 left-10 w-96 h-96 bg-indigo-200/50 rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-10 w-[32rem] h-[32rem] bg-pink-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-[36rem] h-[36rem] bg-orange-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/4 w-[30rem] h-[30rem] bg-blue-100/50 rounded-full blur-3xl" />
      </div>

      {/* Main Outer Layout: Vertical Glass Rail + Main Floating Glass Stage */}
      <div className="relative z-10 w-full max-w-[1760px] mx-auto flex items-start gap-5">
        {/* Left Floating Frosted Glass Rail (Matching Reference Image) */}
        <aside className="hidden lg:flex flex-col items-center py-6 px-3 crystal-board rounded-squircle-lg shadow-crystal-board border border-white/90 sticky top-6 z-20 space-y-6">
          {/* Logo / Home Icon Button */}
          <button
            onClick={() => handleTabChange('queue')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
              currentTab === 'queue'
                ? 'pod-purple text-white shadow-crystal-glow-purple'
                : 'crystal-pill text-slate-600 hover:text-indigo-900'
            }`}
            title="Invoice Registry"
          >
            <Home className="w-5 h-5" />
          </button>

          {/* Quick Metrics / Analytics Button */}
          <button
            onClick={() => handleKpiFilterClick('ALL')}
            className="w-11 h-11 rounded-2xl crystal-pill flex items-center justify-center text-slate-600 hover:text-indigo-900 hover:bg-white/80 transition-all"
            title="Pipeline Analytics"
          >
            <BarChart2 className="w-5 h-5" />
          </button>

          {/* Review Queue Button */}
          <button
            onClick={() => handleTabChange('escalated')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all relative ${
              currentTab === 'escalated'
                ? 'pod-coral text-white shadow-crystal-glow-coral'
                : 'crystal-pill text-slate-600 hover:text-indigo-900'
            }`}
            title="Human Review Queue"
          >
            <ShieldCheck className="w-5 h-5" />
            {stats && stats.escalated_count > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                {stats.escalated_count}
              </span>
            )}
          </button>

          {/* Target ERP Database Button */}
          <button
            onClick={() => handleTabChange('target_erp')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
              currentTab === 'target_erp'
                ? 'pod-emerald text-white shadow-sm'
                : 'crystal-pill text-slate-600 hover:text-indigo-900'
            }`}
            title="Target Company ERP Database"
          >
            <Database className="w-5 h-5" />
          </button>

          <div className="w-6 h-[1px] bg-slate-300 my-1" />

          {/* Upload Quick Button */}
          <button
            onClick={() => setIsUploadOpen(true)}
            className="w-11 h-11 rounded-2xl pod-blue text-white shadow-crystal-glow-blue flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            title="Ingest Voucher (PDF/Photo)"
          >
            <UploadCloud className="w-5 h-5" />
          </button>

          {/* Persona / User Info */}
          <div
            className="w-11 h-11 rounded-2xl crystal-pill flex items-center justify-center text-slate-600 font-bold text-xs"
            title={`Active User: ${activeUser.fullName} (${activeUser.role})`}
          >
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
        </aside>

        {/* Center / Right Floating Glass Stage (Matching Main Board in Reference Image) */}
        <div className="flex-1 crystal-board rounded-squircle-xl shadow-crystal-board border border-white/90 overflow-hidden flex flex-col min-h-[90vh]">
          {/* Top Glass Navigation Bar */}
          <Navbar
            currentTab={currentTab}
            onTabChange={handleTabChange}
            activeUser={activeUser}
            onUserChange={setActiveUser}
            onOpenUpload={() => setIsUploadOpen(true)}
            escalatedCount={stats?.escalated_count ?? 0}
          />

          {/* Main Stage Content */}
          <main className="flex-1 py-4">
            {selectedInvoiceDetail ? (
              <SplitScreenReview
                invoice={selectedInvoiceDetail}
                activeUser={activeUser}
                onBack={handleCloseReview}
                onInvoiceUpdated={handleInvoiceUpdated}
              />
            ) : currentTab === 'target_erp' ? (
              <TargetERPViewer />
            ) : (
              <>
                {/* Visual Analytics & Glowing Metric Pods */}
                <KPICards 
                  stats={stats} 
                  onFilterClick={handleKpiFilterClick} 
                  onOpenUpload={() => setIsUploadOpen(true)}
                  onNavigateTab={handleTabChange}
                />

                {/* Filterable Table Registry */}
                <InvoiceQueue
                  invoices={invoices}
                  loading={loading}
                  onSelectInvoice={handleSelectInvoice}
                  onRefresh={loadData}
                  selectedFilter={selectedFilter}
                  onFilterChange={setSelectedFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </>
            )}
          </main>
        </div>
      </div>

      {/* Ingestion & Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

export default App;
