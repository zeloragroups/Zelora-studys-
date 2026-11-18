import { InterfaceScaffoldView } from '../InterfaceScaffoldView';

interface ShellProps {
  onSignOut?: () => void;
}

export function TeacherWebAppShell({ onSignOut }: ShellProps) {
  return (
    <InterfaceScaffoldView
      interfaceId="teacher-webapp"
      roleLabel="Teacher"
      roleAccessSummary="Strictly scoped to assigned classes and subjects. Teachers mark attendance, create text-only homework, create tests/exams, and enter marks. Cannot publish centre announcements."
      showBottomThumbBar
      onSignOut={onSignOut}
    />
  );
}
