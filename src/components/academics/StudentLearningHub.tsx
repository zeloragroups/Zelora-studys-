import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap } from 'lucide-react';
import { cn } from '../../utils/cn';
import { StudentHomeworkModule } from '../assessments/StudentHomeworkModule';
import { StudentAcademicWorkspace } from './StudentAcademicWorkspace';

interface StudentLearningHubProps {
  initialTab?: 'homework' | 'academics';
}

/**
 * Unified Student Learning hub mapped to mobile bottom nav slot 1 ("Learning").
 * Combines Text-Only Homework and Class Subjects & Timetable under a crisp switch.
 */
export function StudentLearningHub({ initialTab = 'homework' }: StudentLearningHubProps) {
  const [tab, setTab] = useState<'homework' | 'academics'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-5">
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55]"
        role="tablist"
        aria-label="Student learning sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'homework'}
          onClick={() => setTab('homework')}
          className={cn(
            'inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
            tab === 'homework'
              ? 'bg-[#7552D9] text-white dark:bg-[#8B5CF6]'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>My Homework</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'academics'}
          onClick={() => setTab('academics')}
          className={cn(
            'inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
            tab === 'academics'
              ? 'bg-[#7552D9] text-white dark:bg-[#8B5CF6]'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          <GraduationCap className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Subjects & Timetable</span>
        </button>
      </div>

      {tab === 'homework' ? (
        <StudentHomeworkModule />
      ) : (
        <StudentAcademicWorkspace section="academics" />
      )}
    </div>
  );
}
