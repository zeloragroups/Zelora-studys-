import { AlertOctagon, Database, ShieldAlert } from 'lucide-react';
import { EXPECTED_FIREBASE_PROJECT_ID } from '../../lib/firebase/config';

interface FirebaseConfigErrorScreenProps {
  errors: string[];
}

export function FirebaseConfigErrorScreen({ errors }: FirebaseConfigErrorScreenProps) {
  return (
    <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full rounded-2xl border border-[#D94C5C]/35 dark:border-[#F16B75]/40 bg-white dark:bg-[#171D34] p-7 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 text-[#D94C5C] dark:text-[#F16B75] flex items-center justify-center shrink-0">
            <AlertOctagon className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-mono uppercase tracking-wider text-[#D94C5C] dark:text-[#F16B75] font-semibold">
              FIREBASE_CONFIGURATION_ERROR
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              Firebase Configuration Validation Failed
            </h1>
            <p className="text-sm text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
              This runtime intentionally refuses to fall back silently to local demo data when Firebase credentials are missing, incomplete, or mismatched.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            <ShieldAlert className="w-4 h-4 text-[#D94C5C] dark:text-[#F16B75]" aria-hidden="true" />
            <span>Detected Validation Issues</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs font-mono text-[#D94C5C] dark:text-[#F16B75]">
            {errors.map((err, index) => (
              <li key={index}>{err}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2 text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            <Database className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
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
