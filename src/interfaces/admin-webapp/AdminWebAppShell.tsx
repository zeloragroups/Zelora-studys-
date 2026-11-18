import type { ReactNode } from 'react';
import { InterfaceScaffoldView } from '../InterfaceScaffoldView';

interface ShellProps {
  onSignOut?: () => void;
  headerRightExtra?: ReactNode;
}

export function AdminWebAppShell({ onSignOut, headerRightExtra }: ShellProps) {
  return (
    <InterfaceScaffoldView
      interfaceId="admin-webapp"
      roleLabel="Admin"
      roleAccessSummary="Unified responsive Admin Web App for desktop, tablet, and mobile: accounts, academics, attendance, assessments, fee management, payment verification, receipts, and teacher salaries."
      showBottomThumbBar
      onSignOut={onSignOut}
      headerRightExtra={headerRightExtra}
    />
  );
}
