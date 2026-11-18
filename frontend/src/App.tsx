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
  PipelineProcessState,
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

  const handleUserChange = (user: UserSession) => {
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

  // Live Pipeline Processing Execution State on Hero Wave
  const [pipelineProcess, setPipelineProcess] = useState<PipelineProcessState>({
    isActive: false,
    currentStage: 0,
    stageProgress: 0,
    status: 'idle',
  });

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

  // Filter change from table pills (Two-way tab & filter synchronization)
  const handleQueueFilterChange = (filter: string) => {
    setSelectedFilter(filter);
    if (filter === 'ESCALATED') {
      setCurrentTab('escalated');
    } else {
      setCurrentTab('queue');
    }
    setSelectedInvoiceDetail(null);
  };

  // Successful upload fallback
  const handleUploadSuccess = (res: ProcessInvoiceResult) => {
    loadData();
    if (res.invoice_id) {
      handleSelectInvoice(res.invoice_id);
    }
  };

  // Live Multi-Stage Pipeline Execution Handler displayed directly on the Hero Wave
  const handleStartPipelineUpload = async (
    file: File,
    source: string = 'manual_upload',
    enableStp: boolean = true
  ) => {
    setIsUploadOpen(false);
    setSelectedInvoiceDetail(null);
    if (currentTab !== 'queue') {
      setCurrentTab('queue');
    }

    const fileName = file.name;
    const fileSizeKb = Math.round((file.size / 1024) * 10) / 10;

    // Stage 0: Intake & SHA-256
    setPipelineProcess({
      isActive: true,
      fileName,
      fileSizeKb,
      currentStage: 0,
      stageProgress: 18,
      status: 'running',
      statusMessage: 'Intake: Generating SHA-256 hash & channel reception...',
    });

    const t1 = setTimeout(() => {
      setPipelineProcess((prev) => ({
        ...prev,
        currentStage: 1,
        stageProgress: 38,
        statusMessage: 'Vision: 300 DPI rasterization, OpenCV deskewing & QR scanner...',
      }));
    }, 600);

    const t2 = setTimeout(() => {
      setPipelineProcess((prev) => ({
        ...prev,
        currentStage: 2,
        stageProgress: 65,
        statusMessage: 'AI Extraction: Multimodal Vision LLM field extraction & confidence scoring...',
      }));
    }, 1500);

    const t3 = setTimeout(() => {
      setPipelineProcess((prev) => ({
        ...prev,
        currentStage: 3,
        stageProgress: 85,
        statusMessage: 'Deterministic Validation: Checking Indian GSTINs, HSNs & line-item arithmetic...',
      }));
    }, 2400);

    try {
      const res = await api.uploadInvoice(file, source, enableStp);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      setPipelineProcess({
        isActive: true,
        fileName,
        fileSizeKb,
        currentStage: 4,
        stageProgress: 100,
        status: 'completed',
        statusMessage: res.delivered_to_target
          ? 'Autonomous Straight-Through Processing Complete: Posted to Target ERP!'
          : res.is_escalated
          ? 'Validation Discrepancy: Routed to Human Maker-Checker Queue'
          : 'Document Processed Successfully',
        result: res,
      });

      loadData();
    } catch (err: unknown) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      const msg = err instanceof Error ? err.message : 'Pipeline execution failed.';
      setPipelineProcess({
        isActive: true,
        fileName,
        fileSizeKb,
        currentStage: 3,
        stageProgress: 100,
        status: 'error',
        statusMessage: msg,
        error: msg,
      });
    }
  };

  // Run live simulation on Hero Wave using curated B2B sample
  const handleRunSamplePipeline = async () => {
    try {
      const sampleFile = await api.downloadSampleFile('02_synthetic_invoice_interstate.pdf');
      handleStartPipelineUpload(sampleFile, 'manual_upload', true);
    } catch (err) {
      console.error('Failed to run sample pipeline:', err);
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
          onUserChange={handleUserChange}
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
            <TargetERPViewer onBack={() => handleTabChange('queue')} />
          ) : (
            <>
              {/* TIER 1 & 2: Top Metric Cards (Total, Ingestion Spline, Human Review Rate, Velocity) */}
              <LiquidTopCards stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 3: Luminous Waveform Flow Monitor with Real-Time Pipeline Processing */}
              <LiquidHeroWave 
                stats={stats} 
                onFilterClick={handleFilterClick}
                pipelineProcess={pipelineProcess}
                onRunSamplePipeline={handleRunSamplePipeline}
                onSelectInvoice={handleSelectInvoice}
                onDismissPipeline={() => setPipelineProcess({ isActive: false, currentStage: 0, stageProgress: 0, status: 'idle' })}
              />

              {/* TIER 4 & 5: Middle Row (Gross Value, Precision Donut, Intake Channels, Balance, Avg Value, Exceptions) */}
              <LiquidMiddleCards stats={stats} onFilterClick={handleFilterClick} />

              {/* TIER 6: Interactive Voucher Registry Table with Search & Status Filters */}
              <InvoiceQueue
                invoices={invoices}
                loading={loading}
                onSelectInvoice={handleSelectInvoice}
                onRefresh={loadData}
                selectedFilter={selectedFilter}
                onFilterChange={handleQueueFilterChange}
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
        onStartPipelineUpload={handleStartPipelineUpload}
      />
    </div>
  );
}

export default App;
