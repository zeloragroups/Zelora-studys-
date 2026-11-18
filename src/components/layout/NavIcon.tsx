import {
  BarChart3,
  BookOpen,
  CalendarCheck2,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  Home,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  UserCircle2,
  Users,
  Wallet,
} from 'lucide-react';
import type { NavIconName } from '../../config/navigation';

interface NavIconProps {
  name: NavIconName;
  className?: string;
}

export function NavIcon({ name, className = 'w-4 h-4' }: NavIconProps) {
  switch (name) {
    case 'home':
      return <Home className={className} aria-hidden="true" />;
    case 'overview':
      return <LayoutDashboard className={className} aria-hidden="true" />;
    case 'accounts':
      return <Users className={className} aria-hidden="true" />;
    case 'academics':
      return <GraduationCap className={className} aria-hidden="true" />;
    case 'attendance':
      return <CalendarCheck2 className={className} aria-hidden="true" />;
    case 'assessments':
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case 'notices':
      return <Megaphone className={className} aria-hidden="true" />;
    case 'homework':
      return <NotebookPen className={className} aria-hidden="true" />;
    case 'classes':
      return <BookOpen className={className} aria-hidden="true" />;
    case 'learning':
      return <BookOpen className={className} aria-hidden="true" />;
    case 'profile':
      return <UserCircle2 className={className} aria-hidden="true" />;
    case 'finance':
      return <Wallet className={className} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 className={className} aria-hidden="true" />;
    case 'settings':
      return <Settings className={className} aria-hidden="true" />;
    default:
      return <ClipboardCheck className={className} aria-hidden="true" />;
  }
}
