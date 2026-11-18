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

  // Detect structured FirestoreErrorInfo JSON emitted by handleFirestoreError
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
      <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] p-7 shadow-sm space-y-5">
          <div className="flex items-start gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-[#D94C5C]/12 dark:bg-[#F16B75]/18 text-[#D94C5C] dark:text-[#F16B75] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-tight">
                {this.state.friendlyTitle}
              </h1>
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                {this.state.friendlyMessage}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#E5E7EF] dark:border-[#303A55]">
            <Button
              variant="primary"
              size="sm"
              onClick={this.handleReload}
              iconLeft={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
            >
              Reload Application
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
