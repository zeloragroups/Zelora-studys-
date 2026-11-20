import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap } from 'lucide-react';
import { StudentHomeworkModule } from '../assessments/StudentHomeworkModule';
import { Tabs } from '../ui/Tabs';
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
      <Tabs
        ariaLabel="Student learning sections"
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'homework',
            label: 'My Homework',
            icon: <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />,
          },
          {
            id: 'academics',
            label: 'Subjects & Timetable',
            icon: <GraduationCap className="w-4 h-4 shrink-0" aria-hidden="true" />,
          },
        ]}
      />

      {tab === 'homework' ? (
        <StudentHomeworkModule />
      ) : (
        <StudentAcademicWorkspace section="academics" />
      )}
    </div>
  );
}
