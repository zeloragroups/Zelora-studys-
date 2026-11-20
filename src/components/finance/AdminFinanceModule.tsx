import { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  ClipboardCheck,
  FileBarChart2,
  History,
  LayoutDashboard,
  Receipt,
  Settings2,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  academicService,
  accountService,
  feeService,
  financialReportService,
  isFirebaseConnectedMode,
  paymentService,
  receiptService,
  salaryService,
} from '../../services';
import type {
  AccountRecord,
  AdminFinancialDashboardData,
  BatchRecord,
  ClassRecord,
  FeeConfiguration,
  FeeReceipt,
  FinancialAuditEntry,
  FinancialReportFilter,
  FinancialReportSummary,
  PaymentClaimDetailView,
  PaymentVerificationAudit,
  StudentFeeAccountView,
  TeacherSalarySummaryView,
  UpiConfiguration,
} from '../../types';
import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatusText } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';
import {
  AdminFeeVerificationPanel,
  type FeeVerificationPanelSection,
} from './AdminFeeVerificationPanel';
import { AdminReportsAuditPanel } from './AdminReportsAuditPanel';
import { AdminSalaryPanel } from './AdminSalaryPanel';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';

export type AdminFinanceTab =
  | 'overview'
  | FeeVerificationPanelSection
  | 'salaries'
  | 'reports'
  | 'audit';

interface AdminFinanceModuleProps {
  initialTab?: AdminFinanceTab;
}

const TABS: Array<{ id: AdminFinanceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'verification_queue', label: 'Verify Claims', icon: ClipboardCheck },
  { id: 'student_accounts', label: 'Student Fees', icon: Users },
  { id: 'fee_config', label: 'Fee Rules', icon: Settings2 },
  { id: 'upi_config', label: 'UPI Settings', icon: Smartphone },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'salaries', label: 'Teacher Salaries', icon: Banknote },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'audit', label: 'Audit History', icon: History },
];

export function AdminFinanceModule({ initialTab = 'overview' }: AdminFinanceModuleProps) {
  const { principal } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminFinanceTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [dashboard, setDashboard] = useState<AdminFinancialDashboardData | null>(null);
  const [activeFeeConfig, setActiveFeeConfig] = useState<FeeConfiguration | null>(null);
  const [feeConfigHistory, setFeeConfigHistory] = useState<FeeConfiguration[]>([]);
  const [upiConfig, setUpiConfig] = useState<UpiConfiguration | null>(null);
  const [studentAccounts, setStudentAccounts] = useState<StudentFeeAccountView[]>([]);
  const [claims, setClaims] = useState<PaymentClaimDetailView[]>([]);
  const [receipts, setReceipts] = useState<FeeReceipt[]>([]);
  const [salarySummaries, setSalarySummaries] = useState<TeacherSalarySummaryView[]>([]);
  const [financialAudit, setFinancialAudit] = useState<FinancialAuditEntry[]>([]);
  const [verificationAudit, setVerificationAudit] = useState<PaymentVerificationAudit[]>([]);

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [teachers, setTeachers] = useState<AccountRecord[]>([]);

  const [reportFilter, setReportFilter] = useState<FinancialReportFilter>({
    granularity: 'monthly',
    month: '2026-11',
    year: '2026',
  });
  const [reportSummary, setReportSummary] = useState<FinancialReportSummary | null>(null);

  const [previewReceipt, setPreviewReceipt] = useState<FeeReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const loadFinanceData = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required for financial management.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        dashRes,
        cfgRes,
        cfgHistRes,
        upiRes,
        acctRes,
        clmRes,
        recRes,
        salRes,
        fAudRes,
        vAudRes,
        repRes,
        clsRes,
        batRes,
        tchRes,
      ] = await Promise.all([
        financialReportService.getAdminFinancialDashboard(principal),
        feeService.getActiveFeeConfiguration(principal),
        feeService.listFeeConfigurationHistory(principal),
        feeService.getUpiConfiguration(principal),
        feeService.listAdminStudentFeeAccounts(principal),
        paymentService.listAdminPaymentClaims(principal, 'all'),
        receiptService.listReceiptsForAdmin(principal),
        salaryService.listAdminTeacherSalarySummaries(principal),
        financialReportService.listFinancialAuditHistory(principal),
        paymentService.listPaymentVerificationAudit(principal),
        financialReportService.getFinancialReportSummary(principal, reportFilter),
        academicService.listClasses(principal),
        academicService.listBatches(principal),
        accountService.listAccounts(principal, { role: 'teacher' }),
      ]);

      setDashboard(dashRes);
      setActiveFeeConfig(cfgRes);
      setFeeConfigHistory(cfgHistRes);
      setUpiConfig(upiRes);
      setStudentAccounts(acctRes);
      setClaims(clmRes);
      setReceipts(recRes);
      setSalarySummaries(salRes);
      setFinancialAudit(fAudRes);
      setVerificationAudit(vAudRes);
      setReportSummary(repRes);
      setClasses(clsRes);
      setBatches(batRes);
      setTeachers(tchRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load finance workspace.');
    } finally {
      setLoading(false);
    }
  }, [principal, reportFilter]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Card title="Access Denied">
        <p className="text-sm text-[#D64C55] dark:text-[#EF6D75]">
          Only authorized Administrators can manage fee structures, payment verifications, receipts, and teacher salaries.
        </p>
      </Card>
    );
  }

  const pendingCount = claims.filter((c) => c.claim.status === 'verification_pending').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Finance, Verification & Payroll · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo Mode'}`}
        title="Fee Management & Teacher Salaries"
        subtitle="Configure fixed INR fees, manage UPI Pay Now settings, verify student payment claims, issue digital receipts, and manage teacher salaries."
        rightSlot={
          <StatusText
            tone={pendingCount > 0 ? 'warning' : 'nominal'}
            label={
              pendingCount > 0
                ? `${pendingCount} Pending Claim(s) to Verify`
                : 'No Pending Claims'
            }
          />
        }
      />

      {toast && (
        <Alert
          tone="success"
          onDismiss={() => setToast(null)}
          className="no-print"
        >
          {toast}
        </Alert>
      )}

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Horizontal Tab Navigation */}
      <Tabs
        variant="underline"
        ariaLabel="Admin financial management tabs"
        className="no-print"
        value={activeTab}
        onChange={setActiveTab}
        items={TABS.map((tab) => {
          const Icon = tab.icon;
          return {
            id: tab.id,
            label: tab.label,
            icon: <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />,
            count:
              tab.id === 'verification_queue' && pendingCount > 0
                ? pendingCount
                : undefined,
          };
        })}
      />

      {loading && !dashboard ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33]/70 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {(activeTab === 'overview' || activeTab === 'reports' || activeTab === 'audit') && (
            <AdminReportsAuditPanel
              mode={activeTab}
              dashboard={dashboard}
              reportSummary={reportSummary}
              reportFilter={reportFilter}
              onChangeReportFilter={setReportFilter}
              financialAudit={financialAudit}
              paymentVerificationAudit={verificationAudit}
              classes={classes}
              batches={batches}
              teachers={teachers}
              onQuickNavigateTab={(tabId) => setActiveTab(tabId as AdminFinanceTab)}
            />
          )}

          {(activeTab === 'fee_config' ||
            activeTab === 'student_accounts' ||
            activeTab === 'verification_queue' ||
            activeTab === 'upi_config' ||
            activeTab === 'receipts') && (
            <AdminFeeVerificationPanel
              section={activeTab}
              activeFeeConfig={activeFeeConfig}
              feeConfigHistory={feeConfigHistory}
              upiConfig={upiConfig}
              studentAccounts={studentAccounts}
              claims={claims}
              receipts={receipts}
              classes={classes}
              batches={batches}
              onRefresh={loadFinanceData}
              onToast={showToast}
              onOpenReceipt={(rec) => setPreviewReceipt(rec)}
            />
          )}

          {activeTab === 'salaries' && (
            <AdminSalaryPanel
              summaries={salarySummaries}
              onRefresh={loadFinanceData}
              onToast={showToast}
            />
          )}
        </>
      )}

      <ReceiptPreviewModal
        receipt={previewReceipt}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}
