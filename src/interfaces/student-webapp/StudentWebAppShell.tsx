import { InterfaceScaffoldView } from '../InterfaceScaffoldView';

interface ShellProps {
  onSignOut?: () => void;
}

export function StudentWebAppShell({ onSignOut }: ShellProps) {
  return (
    <InterfaceScaffoldView
      interfaceId="student-webapp"
      roleLabel="Student / Parent"
      roleAccessSummary="Parents share the student's Student ID + password. Scoped to personal attendance, marks, text homework, online tests, UPI fee status, receipts, and in-app absence alerts."
      showBottomThumbBar
      onSignOut={onSignOut}
    />
  );
}
