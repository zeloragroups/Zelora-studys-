import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  friendlyTitle: string;
  friendlyMessage: string;
}

function parseFriendlyError(error: unknown): { title: string; message: string } {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unexpected error');

  if (rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(rawMessage) as {
        error?: string;
        operationType?: string;
        path?: string | null;
      };
      const inner = (parsed.error ?? '').toLowerCase();
      if (inner.includes('permission') || inner.includes('missing or insufficient')) {
        return {
          title: 'Access or Permission Restricted',
          message:
            'Your account does not have permission to view or update this record under centre security rules.',
        };
      }
      if (inner.includes('offline') || inner.includes('unavailable') || inner.includes('network')) {
        return {
          title: 'Connection Interrupted',
          message:
            'Unable to reach Cloud Firestore right now. Please check your internet connection and reload.',
        };
      }
      return {
        title: 'Database Operation Error',
        message: 'A database operation could not be completed. Please try again or contact your administrator.',
      };
    } catch {
      // Fall through safely
    }
  }

  if (rawMessage.toLowerCase().includes('firebase configuration error')) {
    return {
      title: 'Firebase Configuration Required',
      message: rawMessage,
    };
  }

  return {
    title: 'Something Went Wrong',
    message:
      'An unexpected interface error occurred. Reloading cleanly usually resolves temporary state issues.',
  };
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      friendlyTitle: 'Something Went Wrong',
      friendlyMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const parsed = parseFriendlyError(error);
    return {
      hasError: true,
      friendlyTitle: parsed.title,
      friendlyMessage: parsed.message,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error.message, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, friendlyTitle: '', friendlyMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm space-y-5">
          <div className="flex items-start gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-[var(--error-soft)] border border-[var(--error-border)] text-[var(--error)] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight">
                {this.state.friendlyTitle}
              </h1>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {this.state.friendlyMessage}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[var(--border)]">
            <Button
              variant="primary"
              size="sm"
              onClick={this.handleReload}
              iconLeft={<RotateCcw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
            >
              Reload Application
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
