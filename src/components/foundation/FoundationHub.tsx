import { useState } from 'react';
import { ArrowRight, Check, Database, Layers, Shield, Sparkles } from 'lucide-react';
import { INTERFACE_SPECS, type WebInterfaceId } from '../../config/navigation';
import { useInterface } from '../../context/InterfaceContext';
import { getFirebaseClientDescriptor } from '../../services/firebase/firebaseClient';
import { validateLoginId } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { ThemeToggle } from '../ui/ThemeToggle';

interface RoadmapRow {
  phase: string;
  title: string;
  scope: string;
  status: 'completed' | 'upcoming';
}

const ROADMAP_ROWS: RoadmapRow[] = [
  {
    phase: 'Phase 1',
    title: 'Foundation, Architecture & Design System',
    scope: 'Requirements, folder structure, RBAC model, disconnected Firebase contracts, UI primitives, theme, splash, responsive shells.',
    status: 'completed',
  },
  {
    phase: 'Phase 2',
    title: 'Authentication Shell & Role Routing',
    scope: 'ID + password sign-in screens (ADM/TCH/STU), strict role guards, session context, and password-reset request flow.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 3',
    title: 'Admin Account Management',
    scope: 'Create teacher/student accounts, unique ID generation, ID search, edit/deactivate, and secure password reset initiation.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 4',
    title: 'Admin Academics, Timetable & Announcements',
    scope: 'Classes, batches, subjects, teacher mapping, student enrolment, timetable editor, and centre-wide announcements.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 5',
    title: 'Teacher Classes & Attendance Engine',
    scope: 'Assigned class rosters, manual attendance (normal-day & exam-day), and in-app student absence notification dispatch.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 6',
    title: 'Homework, Online Objective Tests & Exams',
    scope: 'Text-only homework + deadlines, online objective test builder with auto-scoring, offline exams, and manual marks entry.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 7',
    title: 'Fee Structure, UPI Pay Now, Verification & Receipts',
    scope: 'Monthly/yearly common fee, UPI ID control, partial/full payments, secure verification, 24h receipts, and reminders.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 8',
    title: 'Student & Parent Web App Workspace',
    scope: 'Personal dashboard, attendance %, progress reports, online test runner, fee ledger, receipts, and absence alerts.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 9',
    title: 'Teacher Salaries, Reports & Branding Settings',
    scope: 'Per-teacher fixed/per-session salary tracking, financial dashboard, extensible monthly/yearly reports, and centre branding.',
    status: 'upcoming',
  },
  {
    phase: 'Phase 10',
    title: 'Manual Firebase Wiring, Hardening & QA',
    scope: 'Connect owner-provisioned Firebase Auth/Firestore, deploy security rules, cross-viewport QA, and release readiness.',
    status: 'upcoming',
  },
];

export function FoundationHub() {
  const { branding, setActiveInterface } = useInterface();
  const firebaseDescriptor = getFirebaseClientDescriptor();

  const [sampleIdInput, setSampleIdInput] = useState('STU-1042');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [simulateLoading, setSimulateLoading] = useState(false);

  const idValidation = validateLoginId(sampleIdInput);

  const handleTestValidation = () => {
    setSimulateLoading(true);
    window.setTimeout(() => {
      setSimulateLoading(false);
      setFeedbackBanner(
        idValidation.valid
          ? `Validated ID format "${sampleIdInput.trim().toUpperCase()}" against role prefix rules.`
          : idValidation.error ?? 'Invalid ID format.'
      );
    }, 260);
  };

  const roadmapColumns: TableColumn<RoadmapRow>[] = [
    {
      key: 'phase',
      header: 'Phase',
      render: (row) => <span className="font-mono font-medium whitespace-nowrap">{row.phase}</span>,
    },
    {
      key: 'title',
      header: 'Milestone',
      render: (row) => <span className="font-medium text-[var(--text-primary)]">{row.title}</span>,
    },
    {
      key: 'scope',
      header: 'Planned Deliverables',
      render: (row) => <span className="text-xs text-[var(--text-muted)]">{row.scope}</span>,
    },
    {
      key: 'status',
      header: 'State',
      align: 'right',
      render: (row) =>
        row.status === 'completed' ? (
          <StatusText tone="nominal" label="Phase 1 Active" />
        ) : (
          <StatusText tone="neutral" label="Planned" />
        ),
    },
  ];

  const interfacesList = Object.values(INTERFACE_SPECS);

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0"
          >
            {branding.centreName}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--text-secondary)]">
            <a href="#interfaces" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">
              Interfaces
            </a>
            <a href="#design-system" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">
              Design System
            </a>
            <a href="#architecture" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">
              Architecture
            </a>
            <a href="#roadmap" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">
              Roadmap
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle compact />
            <Button
              size="sm"
              onClick={() => setActiveInterface('admin-website')}
            >
              Open Admin Site
            </Button>
          </div>
        </div>
      </header>

      <main id="top" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {/* Hero Overview */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>Phase 1 of 10</span>
            <span aria-hidden="true">·</span>
            <span>Foundation, Architecture & Design System</span>
            <span aria-hidden="true">·</span>
            <span>{branding.academicYearLabel}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] max-w-3xl text-balance">
            Unified Tuition Centre Ecosystem Architecture
          </h1>
          <p className="text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Four responsive web interfaces engineered around one shared TypeScript domain model, strict ID-based role access, and a disconnected Firebase integration layer ready for manual connection.
          </p>
        </section>

        {/* Foundation Metrics Row (from Local Dev Adapter, clearly labeled) */}
        <section aria-label="Foundation snapshot">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Web Interfaces"
              value={4}
              caption="Admin Site · Admin App · Teacher · Student"
            />
            <StatTile
              label="Role Workspaces"
              value={3}
              caption="Admin · Teacher · Student & Parent"
            />
            <StatTile
              label="Backend Runtime"
              value={firebaseDescriptor.runtimeMode === 'FIREBASE_CONNECTED' ? 'Firebase' : 'Local'}
              caption={firebaseDescriptor.projectId ?? 'Explicit LOCAL_DEMO'}
            />
            <StatTile
              label="Implementation Phases"
              value={10}
              caption="Phase 10 production integration"
            />
          </div>
        </section>

        {/* Four Web Interfaces */}
        <section id="interfaces" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Four Separate Web Interface Shells
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Select any shell to inspect its Phase 1 navigation and role boundaries
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {interfacesList.map((iface) => (
              <Card
                key={iface.id}
                title={iface.title}
                subtitle={`${iface.audience} · ${iface.primaryFormFactors}`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveInterface(iface.id as WebInterfaceId)}
                  >
                    <span>Preview Shell</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                }
              >
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {iface.responsibility}
                </p>
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                  {iface.navItems.map((nav) => (
                    <span key={nav.id}>{nav.label}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Reusable Design System & Interaction Verification */}
        <section id="design-system" className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Design System & Interactive Feedback Standards
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="Typography, Controls & Dual-Theme Contrast"
              subtitle="Plus Jakarta Sans display, DM Sans body, JetBrains Mono tabular numerals"
            >
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" onClick={handleTestValidation} loading={simulateLoading}>
                    Primary Action
                  </Button>
                  <Button variant="secondary" onClick={() => setSampleIdInput('TCH-0204')}>
                    Test Teacher ID
                  </Button>
                  <Button variant="ghost" onClick={() => setSampleIdInput('INVALID')}>
                    Trigger Error State
                  </Button>
                </div>

                <div className="pt-4 border-t border-[var(--border)] space-y-2">
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Dual-coded semantic states (icon + label, zero static pills)
                  </p>
                  <div className="flex flex-wrap items-center gap-5">
                    <StatusText tone="nominal" label="Verified / Present" />
                    <StatusText tone="warning" label="Pending Verification" />
                    <StatusText tone="danger" label="Absent / Overdue" />
                    <StatusText tone="neutral" label="Scheduled" />
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="Form Validation & Interaction Feedback"
              subtitle="Live validation preview for ID-based login format (ADM / TCH / STU)"
            >
              <div className="space-y-4">
                <Input
                  label="Account ID Format Check"
                  value={sampleIdInput}
                  onChange={(e) => {
                    setSampleIdInput(e.target.value);
                    setFeedbackBanner(null);
                  }}
                  placeholder="e.g. STU-1042"
                  error={idValidation.valid ? undefined : idValidation.error}
                  successMessage={
                    idValidation.valid ? 'Matches role-prefixed ID standard' : undefined
                  }
                  hint="No public self-registration; Admin issues all IDs."
                />
                {feedbackBanner && (
                  <p className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                    <Check className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                    <span>{feedbackBanner}</span>
                  </p>
                )}
              </div>
            </Card>
          </div>
        </section>

        {/* Architecture & Disconnected Backend Status */}
        <section id="architecture" className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Backend Separation & Governance Status
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Card padding="sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Database className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                <span>Firebase Layer</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                {firebaseDescriptor.message}
              </p>
              <div className="mt-3">
                <StatusText
                  tone={firebaseDescriptor.runtimeMode === 'FIREBASE_CONNECTED' ? 'nominal' : 'warning'}
                  label={`Mode: ${firebaseDescriptor.runtimeMode}`}
                />
              </div>
            </Card>

            <Card padding="sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Shield className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                <span>Security & Zero-AI Policy</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                No AI APIs, no readable passwords, no payment gateways, and no automatic WhatsApp messaging connected.
              </p>
              <div className="mt-3">
                <StatusText tone="nominal" label="Enforced End-to-End" />
              </div>
            </Card>

            <Card padding="sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Layers className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                <span>Service Registry Isolation</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                UI modules call contract-backed services via src/services/index.ts with zero silent fallback to local demo data in production.
              </p>
              <div className="mt-3">
                <StatusText tone="nominal" label="Production Hardened" />
              </div>
            </Card>
          </div>
        </section>

        {/* 10-Phase Roadmap Table */}
        <section id="roadmap" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              10-Phase Implementation Roadmap
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Approval required between phases</span>
            </span>
          </div>

          <Card padding="sm">
            <Table
              columns={roadmapColumns}
              rows={ROADMAP_ROWS}
              rowKey={(row) => row.phase}
            />
          </Card>
        </section>
      </main>
    </div>
  );
}
