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
import { ICON_STROKE_WIDTH } from '../../design/tokens';

interface NavIconProps {
  name: NavIconName;
  className?: string;
}

export function NavIcon({ name, className = 'w-5 h-5' }: NavIconProps) {
  switch (name) {
    case 'home':
      return <Home className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'overview':
      return <LayoutDashboard className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'accounts':
      return <Users className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'academics':
      return <GraduationCap className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'attendance':
      return <CalendarCheck2 className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'assessments':
      return <FileSpreadsheet className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'notices':
      return <Megaphone className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'homework':
      return <NotebookPen className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'classes':
      return <BookOpen className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'learning':
      return <BookOpen className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'profile':
      return <UserCircle2 className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'finance':
      return <Wallet className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    case 'settings':
      return <Settings className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
    default:
      return <ClipboardCheck className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />;
  }
}
