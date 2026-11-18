import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { LiquidBackground } from './components/LiquidBackground';
import { LiquidDocks } from './components/LiquidDocks';
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
    <div className="min-h-screen relative flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* 3D Iridescent Floating Spheres & Gradient Background (Matches Uploaded Image) */}
      <LiquidBackground />

      {/* Floating Vertical Glass Docks (Left and Right Edges from Image) */}
      <LiquidDocks
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenUpload={() => setIsUploadOpen(true)}
        activeUser={activeUser}
        onUserChange={setActiveUser}
        escalatedCount={stats?.escalated_count ?? 0}
      />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top Navbar Header */}
        <Navbar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          activeUser={activeUser}
          onUserChange={setActiveUser}
          onOpenUpload={() => setIsUploadOpen(true)}
          escalatedCount={stats?.escalated_count ?? 0}
        />

        {/* Main Floating Glass Stage */}
        <main className="flex-1 max-w-[1250px] w-full mx-auto px-4 sm:px-6 md:px-8 py-4">
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
              {/* TIER 1 & 2: Top Cards ("1929", Ingestion Spline, "15,7%" Dark Card, Velocity) */}
              <LiquidTopCards stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 3: Luminous Wave Aura Hero Banner (Iconic Wide Center Card from Image) */}
              <LiquidHeroWave stats={stats} />

              {/* TIER 4 & 5: Middle Row ("20,94" Value, "19,06" & "93,34" Radial Ring, Intake Bars, Arc Ring Gauge, "45,62", "41,5%") */}
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
