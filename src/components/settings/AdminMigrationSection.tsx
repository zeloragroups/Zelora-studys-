import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  isFirebaseConnectedMode,
  migrationService,
} from '../../services';
import { getFirebaseClientDescriptor } from '../../services/firebase/firebaseClient';
import {
  firebaseStorageService,
  type StorageProbeResult,
} from '../../services/firebase/firebaseStorageService';
import type {
  MigrationExecutionReport,
  MigrationPreviewReport,
} from '../../services/firebase/firebaseMigrationService';
import { formatDateTime } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

export function AdminMigrationSection() {
  const { principal } = useAuth();
  const firebaseDescriptor = getFirebaseClientDescriptor();
  const firebaseConnected = isFirebaseConnectedMode();

  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<MigrationPreviewReport | null>(null);
  const [executionReport, setExecutionReport] = useState<MigrationExecutionReport | null>(null);
  const [includeDemoFixtures, setIncludeDemoFixtures] = useState(false);
  const [confirmMigration, setConfirmMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmClearModalOpen, setConfirmClearModalOpen] = useState(false);
  const [storageProbe, setStorageProbe] = useState<StorageProbeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!firebaseConnected) return;
    void firebaseStorageService
      .probeBucketAvailability()
      .then((res) => {
        if (!cancelled) setStorageProbe(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [firebaseConnected]);

  if (!principal || principal.role !== 'admin') {
    return null;
  }

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 5000);
  };

  const handleScanLocalInventory = async () => {
    if (!firebaseConnected) {
      setError(
        'Cannot inspect Firestore duplicate state while running in explicit LOCAL_DEMO mode. Switch VITE_APP_DATA_MODE to firebase to migrate into academy-0007.'
      );
      return;
    }
    setScanning(true);
    setError(null);
    setExecutionReport(null);
    try {
      const report = await migrationService.previewLocalDataMigration(principal);
      setPreview(report);
      showToast('Dry-run local storage inventory scan completed.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to scan local data inventory.'
      );
    } finally {
      setScanning(false);
    }
  };

  const handleExecuteMigration = async () => {
    if (!confirmMigration) {
      setError('Please check the confirmation box before writing records to Cloud Firestore.');
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      const result = await migrationService.executeLocalDataMigration(principal, {
        includeDemoFixtures,
        confirmMigration: true,
      });
      setExecutionReport(result);
      setConfirmMigration(false);
      showToast(
        `Migration finished: ${result.migratedCount} migrated, ${result.skippedDuplicateCount} duplicates skipped.`
      );
      const refreshedPreview = await migrationService.previewLocalDataMigration(principal);
      setPreview(refreshedPreview);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Controlled Firestore migration failed.'
      );
    } finally {
      setExecuting(false);
    }
  };

  const handleClearLocalCache = () => {
    const removed = migrationService.clearLocalDemoCacheExplicitly();
    setConfirmClearModalOpen(false);
    setPreview(null);
    showToast(
      removed.length > 0
        ? `Cleared ${removed.length} local browser cache key(s). Firestore records remain untouched.`
        : 'No local browser cache keys were present to clear.'
    );
  };

  const previewColumns: TableColumn<MigrationPreviewReport['categories'][number]>[] = [
    {
      key: 'category',
      header: 'Local Storage Entity',
      render: (row) => (
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-[#20262B] dark:text-[#F4F7F6]">
            {row.category}
          </p>
          <p className="text-[11px] font-mono text-[#68737C] dark:text-[#AAB6B4]">
            → {row.firestoreCollection}
          </p>
        </div>
      ),
    },
    {
      key: 'counts',
      header: 'Detected / Custom / Demo',
      render: (row) => (
        <div className="text-xs font-mono tabular-nums space-y-0.5">
          <p className="text-[#20262B] dark:text-[#F4F7F6]">
            {row.totalFound} found · {row.eligibleCustomCount} custom
          </p>
          <p className="text-[#68737C] dark:text-[#AAB6B4]">
            {row.demoFixturesDetected} demo fixture(s)
          </p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Firestore & Auth Status',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <p className="font-mono text-[#68737C] dark:text-[#AAB6B4]">
            {row.alreadyInFirestoreCount} already in Firestore
          </p>
          {row.requiresManualActionCount > 0 && (
            <StatusText
              tone="warning"
              label={`${row.requiresManualActionCount} manual Auth / UID link`}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title="Firebase Production Connection Status"
        subtitle="Real-time runtime mode, database binding, Storage readiness, and Functions execution path."
        action={
          <StatusText
            tone={firebaseConnected ? 'nominal' : 'warning'}
            label={firebaseDescriptor.runtimeMode}
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#20262B] dark:text-[#F4F7F6]">
              <Database className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
              <span>Project & Database</span>
            </div>
            <p className="font-mono text-[#20262B] dark:text-[#F4F7F6]">
              {firebaseDescriptor.projectId ?? 'LOCAL_DEMO'}
            </p>
            <p className="font-mono text-[11px] text-[#68737C] dark:text-[#AAB6B4] truncate">
              {firebaseDescriptor.firestoreDatabaseId ?? 'Browser storage'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#20262B] dark:text-[#F4F7F6]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
              <span>Firestore Connectivity</span>
            </div>
            <p className="font-mono text-[#20262B] dark:text-[#F4F7F6]">
              {firebaseDescriptor.firestoreState}
            </p>
            <p className="text-[11px] text-[#68737C] dark:text-[#AAB6B4]">
              Strict multi-role Security Rules active
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#20262B] dark:text-[#F4F7F6]">
              <HardDrive className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
              <span>Firebase Storage</span>
            </div>
            <p className="font-mono text-[#20262B] dark:text-[#F4F7F6]">
              {!firebaseConnected
                ? 'Disabled (Local Mode)'
                : storageProbe === null
                  ? 'Checking...'
                  : storageProbe.available
                    ? 'Configured'
                    : storageProbe.statusCode === 404
                      ? 'Not Initialized (404)'
                      : 'Unavailable'}
            </p>
            <p className="text-[11px] text-[#68737C] dark:text-[#AAB6B4]">
              {!firebaseConnected
                ? 'Browser local demo mode'
                : storageProbe?.available
                  ? 'Centre branding assets only (2 MB cap)'
                  : 'Optional; core app & branding run on Firestore/Spark'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#20262B] dark:text-[#F4F7F6]">
              <UploadCloud className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
              <span>Cloud Functions</span>
            </div>
            <p className="font-mono text-[#20262B] dark:text-[#F4F7F6]">
              {firebaseDescriptor.functionsEnabled ? 'Enabled (Callable)' : 'Disabled (Spark Mode)'}
            </p>
            <p className="text-[11px] text-[#68737C] dark:text-[#AAB6B4]">
              {firebaseDescriptor.functionsEnabled
                ? 'Cloud Functions active'
                : 'Spark Free Plan — zero Blaze billing required'}
            </p>
          </div>
        </div>
      </Card>

      {toast && (
        <Alert tone="success" onDismiss={() => setToast(null)}>
          {toast}
        </Alert>
      )}

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card
        title="Controlled Local-to-Firebase Data Migration"
        subtitle="Non-destructive dry-run inventory scan, duplicate checking, demo fixture exclusion, credential sanitization, and optional execution."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={scanning}
            disabled={!firebaseConnected || executing}
            onClick={() => void handleScanLocalInventory()}
            iconLeft={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Scan Local Browser Data
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-4 text-xs text-[#68737C] dark:text-[#AAB6B4] space-y-2 leading-relaxed">
            <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
              Safety Guarantees
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Built-in sample/demo records (<span className="font-mono">STU-0001</span>,{' '}
                <span className="font-mono">TCH-0001</span>, demo batches/fees) are excluded by default so sample fixtures never pollute production Firestore.
              </li>
              <li>
                Sensitive fields (<span className="font-mono">passwordHash</span>,{' '}
                <span className="font-mono">devSecretKey</span>, local session tokens, and base64 image blobs) are automatically stripped.
              </li>
              <li>
                Local browser data is preserved untouched after migration for recovery. Clearing local demo caches is strictly manual and separate.
              </li>
            </ul>
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3">
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Scanned Records</p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums">
                    {preview.totalRecordsFound}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3">
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Custom Eligible</p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                    {preview.totalEligibleCustomRecords}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3">
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Demo Fixtures</p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-[#A67317] dark:text-[#E5B04D]">
                    {preview.totalDemoFixtures}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3">
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Already in Firestore</p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums">
                    {preview.totalDuplicatesInFirestore}
                  </p>
                </div>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-xl border border-[#A67317]/30 dark:border-[#E5B04D]/35 bg-[#A67317]/8 dark:bg-[#E5B04D]/10 p-3.5 space-y-1.5 text-xs text-[#A67317] dark:text-[#E5B04D]">
                  {preview.warnings.map((w, idx) => (
                    <p key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              <Table
                columns={previewColumns}
                rows={preview.categories}
                rowKey={(r) => `${r.firestoreCollection}-${r.category}`}
                emptyTitle="No local browser records detected"
                emptyDescription="Nothing to migrate from this browser's local storage keys."
              />

              {preview.hasLocalData && (
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-3">
                  <Checkbox
                    checked={includeDemoFixtures}
                    onChange={setIncludeDemoFixtures}
                    label="Include built-in demo fixtures"
                    description="Not recommended for production — leave unchecked to migrate only custom records."
                  />

                  <Checkbox
                    checked={confirmMigration}
                    onChange={setConfirmMigration}
                    label="I confirm migrating eligible records into Cloud Firestore project academy-0007"
                    description="Existing IDs will be skipped and local browser data remains intact."
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmClearModalOpen(true)}
                      iconLeft={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Clear Local Demo Cache Only
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={executing}
                      disabled={!confirmMigration || !firebaseConnected}
                      onClick={() => void handleExecuteMigration()}
                      iconLeft={<UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Execute Controlled Migration
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {executionReport && (
            <div className="rounded-xl border border-[#168A63]/30 dark:border-[#42DDA9]/40 bg-[#168A63]/6 dark:bg-[#42DDA9]/10 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                  Migration Summary ({formatDateTime(executionReport.executedAt)})
                </p>
                <StatusText
                  tone={executionReport.failedCount === 0 ? 'nominal' : 'warning'}
                  label={`${executionReport.migratedCount} Migrated · ${executionReport.skippedDuplicateCount} Skipped`}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono tabular-nums">
                <div>Migrated: {executionReport.migratedCount}</div>
                <div>Duplicates: {executionReport.skippedDuplicateCount}</div>
                <div>Demo Excluded: {executionReport.excludedDemoCount}</div>
                <div>Manual Review: {executionReport.manualReviewCount}</div>
                <div>Stripped Fields: {executionReport.strippedFieldsCount}</div>
              </div>

              {executionReport.manualReviewItems.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#E2E8E5] dark:border-[#344047]">
                  <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Items Requiring Manual Admin Auth Provisioning ({executionReport.manualReviewItems.length})
                  </p>
                  <ul className="space-y-1 text-[11px] text-[#68737C] dark:text-[#AAB6B4]">
                    {executionReport.manualReviewItems.map((item, idx) => (
                      <li key={`${item.recordId}-${idx}`}>
                        <span className="font-mono font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                          {item.recordId}
                        </span>{' '}
                        ({item.category}): {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {executionReport.errors.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-[#D64C55]/30 text-[#D64C55] dark:text-[#EF6D75]">
                  {executionReport.errors.map((errMsg, idx) => (
                    <p key={idx}>{errMsg}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmClearModalOpen}
        onClose={() => setConfirmClearModalOpen(false)}
        onConfirm={handleClearLocalCache}
        title="Clear Local Browser Demo Cache?"
        subtitle="Removes tuition_ecosystem_dev_* keys from this browser only."
        description="Cloud Firestore data in academy-0007 is never modified. Only clear your browser local dev cache after confirming your desired records exist in Cloud Firestore or are no longer needed locally."
        cancelLabel="Keep Local Cache"
        confirmLabel="Confirm Clear Browser Cache"
        confirmVariant="danger"
        tone="warning"
      />
    </div>
  );
}
