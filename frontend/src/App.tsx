import { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { LiquidBackground } from './components/LiquidBackground';
import { LiquidTopCards } from './components/LiquidTopCards';
import { LiquidHeroWave } from './components/LiquidHeroWave';
import { LiquidMiddleCards } from './components/LiquidMiddleCards';
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

export function App() {
  // Navigation & User Session State
  const [currentTab, setCurrentTab] = useState<'queue' | 'escalated' | 'target_erp'>('queue');
  
  // Load initial session from localStorage or default to null for Login Screen
  const [activeUser, setActiveUser] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem('ledgerflow_user_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (user: UserSession) => {
    try {
      localStorage.setItem('ledgerflow_user_session', JSON.stringify(user));
    } catch {
      // ignore
    }
    setActiveUser(user);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('ledgerflow_user_session');
    } catch {
      // ignore
    }
    setActiveUser(null);
  };

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
    if (!activeUser) return;
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
  }, [activeUser, currentTab, selectedFilter, searchQuery]);

  // Initial load and periodic polling every 12 seconds
  useEffect(() => {
    if (activeUser) {
      loadData();
      const interval = setInterval(loadData, 12000);
      return () => clearInterval(interval);
    }
  }, [activeUser, loadData]);

  // Open invoice review
  const handleSelectInvoice = async (invoiceId: string) => {
    try {
      const detail = await api.getInvoiceDetail(invoiceId);
      setSelectedInvoiceDetail(detail);
    } catch (err) {
      console.error('Failed to load invoice details:', err);
      setSelectedInvoiceDetail(null);
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

  // Filter click from cards
  const handleFilterClick = (filter: string) => {
    if (filter === 'ESCALATED') {
      setCurrentTab('escalated');
      setSelectedFilter('ESCALATED');
    } else if (filter === 'TARGET_ERP') {
      setCurrentTab('target_erp');
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

  // 1. If not authenticated, display Enterprise Liquid Glass Login Page
  if (!activeUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // 2. If authenticated, display Full Executive Dashboard
  return (
    <div className="min-h-screen relative flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background */}
      <LiquidBackground />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top Navbar Header with Complete Functional Navigation */}
        <Navbar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          activeUser={activeUser}
          onUserChange={setActiveUser}
          onOpenUpload={() => setIsUploadOpen(true)}
          escalatedCount={stats?.escalated_count ?? 0}
          onLogout={handleLogout}
        />

        {/* Main Floating Glass Stage */}
        <main className={`flex-1 w-full mx-auto px-3 sm:px-6 md:px-8 py-4 transition-all duration-300 ${
          selectedInvoiceDetail ? 'max-w-[1800px]' : 'max-w-[1280px]'
        }`}>
          {/* Active Split-Screen Review Workspace */}
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
              {/* TIER 1 & 2: Top Metric Cards (Total, Ingestion Spline, Human Review Rate, Velocity) */}
              <LiquidTopCards stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 3: Luminous Waveform Flow Monitor */}
              <LiquidHeroWave stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 4 & 5: Middle Row (Gross Value, Precision Donut, Intake Channels, Balance, Avg Value, Exceptions) */}
              <LiquidMiddleCards stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 6: Interactive Voucher Registry Table with Search & Status Filters */}
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

      {/* Document Ingestion & Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

export default App;
