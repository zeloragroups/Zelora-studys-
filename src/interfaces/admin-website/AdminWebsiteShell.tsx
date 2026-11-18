import type { ReactNode } from 'react';
import { InterfaceScaffoldView } from '../InterfaceScaffoldView';

interface ShellProps {
  onSignOut?: () => void;
  headerRightExtra?: ReactNode;
}

export function AdminWebsiteShell({ onSignOut, headerRightExtra }: ShellProps) {
  return (
    <InterfaceScaffoldView
      interfaceId="admin-website"
      roleLabel="Admin"
      roleAccessSummary="Full centre management access via Admin ID + password. Creates teacher and student accounts without viewing existing passwords."
      showBottomThumbBar
      onSignOut={onSignOut}
      headerRightExtra={headerRightExtra}
    />
  );
}
