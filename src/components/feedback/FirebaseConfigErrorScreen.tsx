import { AlertOctagon, Database, ShieldAlert } from 'lucide-react';
import { EXPECTED_FIREBASE_PROJECT_ID } from '../../lib/firebase/config';

interface FirebaseConfigErrorScreenProps {
  errors: string[];
}

export function FirebaseConfigErrorScreen({ errors }: FirebaseConfigErrorScreenProps) {
  return (
    <div className="min-h-screen bg-[#F7F9F8] dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full rounded-2xl border border-[#D64C55]/35 dark:border-[#EF6D75]/40 bg-white dark:bg-[#1D2429] p-7 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#D64C55]/10 dark:bg-[#EF6D75]/15 text-[#D64C55] dark:text-[#EF6D75] flex items-center justify-center shrink-0">
            <AlertOctagon className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-mono tracking-wider text-[#D64C55] dark:text-[#EF6D75] font-semibold">
              Firebase Configuration Error
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              Firebase Configuration Validation Failed
            </h1>
            <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
              This runtime intentionally refuses to fall back silently to local demo data when Firebase credentials are missing, incomplete, or mismatched.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#171D21] dark:text-[#F4F7F6]">
            <ShieldAlert className="w-4 h-4 text-[#D64C55] dark:text-[#EF6D75]" strokeWidth={1.75} aria-hidden="true" />
            <span>Detected Validation Issues</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs font-mono text-[#D64C55] dark:text-[#EF6D75]">
            {errors.map((err, index) => (
              <li key={index}>{err}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-2 text-xs text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-[#171D21] dark:text-[#F4F7F6]">
            <Database className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
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
