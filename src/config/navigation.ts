export type WebInterfaceId =
  | 'foundation-hub'
  | 'admin-website'
  | 'admin-webapp'
  | 'teacher-webapp'
  | 'student-webapp';

export type NavIconName =
  | 'home'
  | 'overview'
  | 'accounts'
  | 'academics'
  | 'attendance'
  | 'assessments'
  | 'notices'
  | 'homework'
  | 'classes'
  | 'learning'
  | 'profile'
  | 'finance'
  | 'reports'
  | 'settings';

export interface NavItemConfig {
  id: string;
  label: string;
  sectionTitle: string;
  plannedPhase: number;
  summary: string;
  icon: NavIconName;
  group: string;
}

export interface BottomNavSlot {
  navId: string;
  label: string;
  icon: NavIconName;
  isHome?: boolean;
}

export interface InterfaceSpec {
  id: WebInterfaceId;
  title: string;
  shortTitle: string;
  audience: string;
  primaryFormFactors: string;
  responsibility: string;
  navItems: NavItemConfig[];
  bottomNav: BottomNavSlot[];
}

export const INTERFACE_SPECS: Record<Exclude<WebInterfaceId, 'foundation-hub'>, InterfaceSpec> = {
  'admin-website': {
    id: 'admin-website',
    title: 'Admin Website',
    shortTitle: 'Admin Site',
    audience: 'Centre Director / Administrative Staff',
    primaryFormFactors: 'Desktop, Laptop, Tablet',
    responsibility:
      'Full management website for centre-wide operations, accounts, classes, batches, timetables, attendance, assessments, and notices.',
    navItems: [
      {
        id: 'home',
        label: 'Home',
        sectionTitle: 'Admin Control Home',
        plannedPhase: 4,
        summary: 'Quick-action centre hub, live attendance and assessment pulse, and operational highlights.',
        icon: 'home',
        group: 'Overview',
      },
      {
        id: 'overview',
        label: 'Overview',
        sectionTitle: 'Centre Executive Overview',
        plannedPhase: 4,
        summary: 'Real-time academic counts, class attendance breakdown, assessment summary, and centre readiness.',
        icon: 'overview',
        group: 'Overview',
      },
      {
        id: 'accounts',
        label: 'Accounts',
        sectionTitle: 'Account & Role Management',
        plannedPhase: 3,
        summary: 'Admin-only creation of teacher and student accounts, unique ID generation, search, deactivation, and password resets.',
        icon: 'accounts',
        group: 'People',
      },
      {
        id: 'academics',
        label: 'Academics',
        sectionTitle: 'Classes, Batches, Subjects & Timetables',
        plannedPhase: 4,
        summary: 'Class/batch hierarchy, subject mapping, teacher assignments, student enrolments, and conflict-checked weekly timetables.',
        icon: 'academics',
        group: 'Academics',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        sectionTitle: 'Attendance Monitoring, Corrections & Alerts',
        plannedPhase: 5,
        summary: 'Filter daily and exam attendance across classes, review absence alerts, and apply mandatory-reason audited corrections.',
        icon: 'attendance',
        group: 'Monitoring',
      },
      {
        id: 'assessments',
        label: 'Assessments',
        sectionTitle: 'Homework, Online Tests, Exams & Marks',
        plannedPhase: 6,
        summary: 'Monitor centre-wide homework, online objective tests, examinations, marks release state, and audited corrections.',
        icon: 'assessments',
        group: 'Monitoring',
      },
      {
        id: 'announcements',
        label: 'Notices',
        sectionTitle: 'Announcements & Notices',
        plannedPhase: 4,
        summary: 'Create drafts, publish, unpublish, and archive text-only notices targeted to teachers, students, classes, or batches.',
        icon: 'notices',
        group: 'Monitoring',
      },
      {
        id: 'profile',
        label: 'Profile',
        sectionTitle: 'Profile & Performance',
        plannedPhase: 6,
        summary: 'Authenticated profile identity and role performance summary.',
        icon: 'profile',
        group: 'Account',
      },
      {
        id: 'finance',
        label: 'Finance',
        sectionTitle: 'Fees, Verification & Teacher Salaries',
        plannedPhase: 7,
        summary: 'Scheduled for Phase 7: fee configuration, UPI ID control, payment verification, receipts, and teacher payroll.',
        icon: 'finance',
        group: 'Planned',
      },
      {
        id: 'reports',
        label: 'Reports & Export',
        sectionTitle: 'Financial Reports & Export',
        plannedPhase: 7,
        summary: 'Monthly and yearly verified collections, outstanding balances, salary payouts, CSV export, and printable reports.',
        icon: 'reports',
        group: 'Finance',
      },
      {
        id: 'settings',
        label: 'Settings',
        sectionTitle: 'Application Settings & Configuration',
        plannedPhase: 9,
        summary: 'Tuition centre profile, dynamic app branding & local logo preview, theme defaults, academic settings, notifications, and system status.',
        icon: 'settings',
        group: 'Account',
      },
    ],
    bottomNav: [
      { navId: 'overview', label: 'Overview', icon: 'overview' },
      { navId: 'academics', label: 'Academics', icon: 'academics' },
      { navId: 'home', label: 'Home', icon: 'home', isHome: true },
      { navId: 'assessments', label: 'Assessments', icon: 'assessments' },
      { navId: 'accounts', label: 'Accounts', icon: 'accounts' },
    ],
  },
  'admin-webapp': {
    id: 'admin-webapp',
    title: 'Admin Web App',
    shortTitle: 'Admin App',
    audience: 'Centre Administrators',
    primaryFormFactors: 'Mobile, Tablet, Laptop & Desktop',
    responsibility:
      'Unified responsive Admin Web App for centre management: accounts, academics, attendance, assessments, fees, payment verification, receipts, teacher salaries, and notices.',
    navItems: [
      {
        id: 'pulse',
        label: 'Home',
        sectionTitle: 'Daily Operations Home',
        plannedPhase: 4,
        summary: 'Live KPIs for active classes, batches, enrolled students, attendance rate, and quick actions.',
        icon: 'home',
        group: 'Overview',
      },
      {
        id: 'overview',
        label: 'Overview',
        sectionTitle: 'Executive Metrics Breakdown',
        plannedPhase: 4,
        summary: 'Class-wise attendance metrics, assessment completion snapshot, and centre readiness.',
        icon: 'overview',
        group: 'Overview',
      },
      {
        id: 'lookup',
        label: 'Accounts',
        sectionTitle: 'Account & Role Management',
        plannedPhase: 3,
        summary: 'Create teacher and student accounts, search by unique ID, inspect status, and reset passwords.',
        icon: 'accounts',
        group: 'People',
      },
      {
        id: 'academics',
        label: 'Academics',
        sectionTitle: 'Academic Operations',
        plannedPhase: 4,
        summary: 'Manage classes, batches, subjects, enrolments, assignments, and weekly timetable across all viewports.',
        icon: 'academics',
        group: 'Academics',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        sectionTitle: 'Attendance & Absence Alerts',
        plannedPhase: 5,
        summary: 'Monitor submitted attendance sessions, inspect absence notifications, and perform audited corrections.',
        icon: 'attendance',
        group: 'Monitoring',
      },
      {
        id: 'assessments',
        label: 'Assessments',
        sectionTitle: 'Assessments, Tests & Marks',
        plannedPhase: 6,
        summary: 'Review centre-wide homework submissions, online test attempts, examinations, and marks audit history.',
        icon: 'assessments',
        group: 'Monitoring',
      },
      {
        id: 'finance',
        label: 'Fees & Salaries',
        sectionTitle: 'Fee Management, Verification & Teacher Salaries',
        plannedPhase: 7,
        summary: 'Configure fixed INR fees, UPI settings, verify payment claims, issue receipts, manage teacher salaries, and export reports.',
        icon: 'finance',
        group: 'Finance',
      },
      {
        id: 'notices',
        label: 'Notices',
        sectionTitle: 'Publish Announcements',
        plannedPhase: 4,
        summary: 'Publish centre-wide, class-targeted, or batch-targeted notices visible to teachers and students.',
        icon: 'notices',
        group: 'Monitoring',
      },
      {
        id: 'settings',
        label: 'Settings',
        sectionTitle: 'Application Settings & Configuration',
        plannedPhase: 9,
        summary: 'Tuition centre profile, dynamic app branding & local logo preview, theme defaults, academic settings, notifications, and system status.',
        icon: 'settings',
        group: 'Account',
      },
      {
        id: 'profile',
        label: 'Profile',
        sectionTitle: 'Profile & Performance',
        plannedPhase: 6,
        summary: 'Authenticated Admin identity and centre performance overview.',
        icon: 'profile',
        group: 'Account',
      },
    ],
    bottomNav: [
      { navId: 'overview', label: 'Overview', icon: 'overview' },
      { navId: 'academics', label: 'Academics', icon: 'academics' },
      { navId: 'pulse', label: 'Home', icon: 'home', isHome: true },
      { navId: 'finance', label: 'Finance', icon: 'finance' },
      { navId: 'lookup', label: 'Accounts', icon: 'accounts' },
    ],
  },
  'teacher-webapp': {
    id: 'teacher-webapp',
    title: 'Teacher Web App',
    shortTitle: 'Teacher App',
    audience: 'Subject & Batch Teachers',
    primaryFormFactors: 'Mobile Browsers (Android/iOS), Tablets, Laptops',
    responsibility:
      'Scoped strictly to assigned classes and subjects: daily workspace, personal timetable, attendance, homework, tests, exams, notices, and personal salary record.',
    navItems: [
      {
        id: 'home',
        label: 'Home',
        sectionTitle: 'Teacher Daily Workspace',
        plannedPhase: 6,
        summary: 'Today’s teaching timetable, quick attendance and homework actions, pending submissions, and notices.',
        icon: 'home',
        group: 'Daily Work',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        sectionTitle: 'Daily & Exam Attendance',
        plannedPhase: 5,
        summary: 'Mark regular and examination attendance for assigned batches with drafts, review, and absence alerts.',
        icon: 'attendance',
        group: 'Daily Work',
      },
      {
        id: 'classes',
        label: 'Classes',
        sectionTitle: 'Assigned Classes & Timetable',
        plannedPhase: 4,
        summary: 'View only assigned classes, batches, subjects, and personal teaching timetable.',
        icon: 'classes',
        group: 'Academic Work',
      },
      {
        id: 'homework',
        label: 'Homework',
        sectionTitle: 'Text-Only Homework & Deadlines',
        plannedPhase: 6,
        summary: 'Assign structured text-only homework with submission deadlines and review student responses.',
        icon: 'homework',
        group: 'Academic Work',
      },
      {
        id: 'assessments',
        label: 'Tests & Marks',
        sectionTitle: 'Tests, Objective Auto-Scoring & Exams',
        plannedPhase: 6,
        summary: 'Create online objective tests with auto-scoring, schedule exams, and enter manual marks.',
        icon: 'assessments',
        group: 'Academic Work',
      },
      {
        id: 'salary',
        label: 'My Salary',
        sectionTitle: 'My Salary & Payment History',
        plannedPhase: 7,
        summary: 'Read-only personal view of active salary model, monthly calculated pay periods, and payment history.',
        icon: 'finance',
        group: 'Payroll',
      },
      {
        id: 'notices',
        label: 'Notices',
        sectionTitle: 'Relevant Announcements',
        plannedPhase: 4,
        summary: 'Read published announcements targeted to teachers or your assigned classes and batches.',
        icon: 'notices',
        group: 'Communication',
      },
      {
        id: 'settings',
        label: 'Settings',
        sectionTitle: 'Teacher Settings & Preferences',
        plannedPhase: 9,
        summary: 'Account summary, Light/Dark preference, password security, notification visibility, and application details.',
        icon: 'settings',
        group: 'Account',
      },
      {
        id: 'profile',
        label: 'Profile',
        sectionTitle: 'Teacher Profile & Performance',
        plannedPhase: 6,
        summary: 'Authenticated Teacher identity and teaching performance summary.',
        icon: 'profile',
        group: 'Account',
      },
    ],
    bottomNav: [
      { navId: 'classes', label: 'Classes', icon: 'classes' },
      { navId: 'attendance', label: 'Attendance', icon: 'attendance' },
      { navId: 'home', label: 'Home', icon: 'home', isHome: true },
      { navId: 'homework', label: 'Homework', icon: 'homework' },
      { navId: 'assessments', label: 'Tests', icon: 'assessments' },
    ],
  },
  'student-webapp': {
    id: 'student-webapp',
    title: 'Student Web App',
    shortTitle: 'Student App',
    audience: 'Students & Parents (Shared Credentials)',
    primaryFormFactors: 'Mobile Browsers (Android/iOS), Tablets, Laptops',
    responsibility:
      'Personal academic and fee workspace: enrolled class & batch, subjects, timetable, homework, tests, results, attendance, fees, receipts, and notifications.',
    navItems: [
      {
        id: 'dashboard',
        label: 'Home',
        sectionTitle: 'Personal Academic Home',
        plannedPhase: 6,
        summary: 'Enrolled class and batch overview, attendance rate, homework due soon, tests, results, and alerts.',
        icon: 'home',
        group: 'Learning',
      },
      {
        id: 'learning',
        label: 'Learning',
        sectionTitle: 'My Homework, Subjects & Timetable',
        plannedPhase: 6,
        summary: 'Unified learning hub with text-only homework, mapped class subjects, and weekly batch timetable.',
        icon: 'learning',
        group: 'Learning',
      },
      {
        id: 'homework',
        label: 'Homework',
        sectionTitle: 'My Text-Only Homework',
        plannedPhase: 6,
        summary: 'Read text-only homework instructions, submit responses, review feedback, and track revisions.',
        icon: 'homework',
        group: 'Learning',
      },
      {
        id: 'academics',
        label: 'Subjects & Timetable',
        sectionTitle: 'My Class, Subjects & Timetable',
        plannedPhase: 4,
        summary: 'Review enrolled batch details, mapped subjects, and weekly batch timetable.',
        icon: 'academics',
        group: 'Learning',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        sectionTitle: 'My Attendance & Absence Alerts',
        plannedPhase: 5,
        summary: 'Overall attendance percentage, Present/Late/Absent/Excused breakdown, filterable history, and absence alerts.',
        icon: 'attendance',
        group: 'Progress',
      },
      {
        id: 'assessments',
        label: 'Tests & Results',
        sectionTitle: 'Online Tests, Exams & Results',
        plannedPhase: 6,
        summary: 'Attempt online objective tests, view scheduled exams, and inspect released marks and subject performance.',
        icon: 'assessments',
        group: 'Progress',
      },
      {
        id: 'fees',
        label: 'Fees & Receipts',
        sectionTitle: 'Fee Status, UPI Pay Now & Receipts',
        plannedPhase: 7,
        summary: 'Inspect fee due and verified paid amounts, launch UPI Pay Now, submit payment claims, read reminders, and print receipts.',
        icon: 'finance',
        group: 'Finance',
      },
      {
        id: 'notices',
        label: 'Notices',
        sectionTitle: 'Alerts & Announcements',
        plannedPhase: 4,
        summary: 'Review absence notifications, assessment updates, and published announcements for your batch.',
        icon: 'notices',
        group: 'Information',
      },
      {
        id: 'settings',
        label: 'Settings',
        sectionTitle: 'Student & Parent Settings',
        plannedPhase: 9,
        summary: 'Account details, Light/Dark preference, password security, notification visibility, and application details.',
        icon: 'settings',
        group: 'Account',
      },
      {
        id: 'profile',
        label: 'Profile',
        sectionTitle: 'Student Profile & Performance',
        plannedPhase: 6,
        summary: 'Authenticated Student identity and academic performance summary.',
        icon: 'profile',
        group: 'Account',
      },
    ],
    bottomNav: [
      { navId: 'learning', label: 'Learning', icon: 'learning' },
      { navId: 'attendance', label: 'Attendance', icon: 'attendance' },
      { navId: 'dashboard', label: 'Home', icon: 'home', isHome: true },
      { navId: 'assessments', label: 'Tests', icon: 'assessments' },
      { navId: 'fees', label: 'Fees', icon: 'finance' },
    ],
  },
};
