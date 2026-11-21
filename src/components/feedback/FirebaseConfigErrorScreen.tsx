import { AlertOctagon, Database, ShieldAlert } from 'lucide-react';
import { EXPECTED_FIREBASE_PROJECT_ID } from '../../lib/firebase/config';

interface FirebaseConfigErrorScreenProps {
  errors: string[];
}

export function FirebaseConfigErrorScreen({ errors }: FirebaseConfigErrorScreenProps) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full rounded-2xl border border-[var(--error-border)] bg-[var(--surface)] p-7 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--error-soft)] border border-[var(--error-border)] text-[var(--error)] flex items-center justify-center shrink-0">
            <AlertOctagon className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-mono tracking-wider text-[var(--error)] font-semibold">
              Firebase Configuration Error
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              Firebase Configuration Validation Failed
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              This runtime intentionally refuses to fall back silently to local demo data when Firebase credentials are missing, incomplete, or mismatched.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <ShieldAlert className="w-4 h-4 text-[var(--error)]" strokeWidth={1.75} aria-hidden="true" />
            <span>Detected Validation Issues</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs font-mono text-[var(--error)]">
            {errors.map((err, index) => (
              <li key={index}>{err}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-4 space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
            <Database className="w-4 h-4 text-[var(--accent-text)]" strokeWidth={1.75} aria-hidden="true" />
            <span>How to Resolve</span>
          </div>
          <p>
            1. Ensure <code className="font-mono">firebase-applet-config.json</code> or{' '}
            <code className="font-mono">VITE_FIREBASE_*</code> environment variables match Firebase project{' '}
            <code className="font-mono font-semibold">{EXPECTED_FIREBASE_PROJECT_ID}</code>.
          </p>
          <p>
            2. For local offline development only, set{' '}
            <code className="font-mono">VITE_APP_DATA_MODE=local_demo</code> in your development environment. Production builds ignore local demo mode.
          </p>
        </div>
      </div>
    </div>
  );
}
