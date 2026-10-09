import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Feedback {
  /** Short success confirmation, shown bottom-right for four seconds. */
  notify(message: string): void;
  /** Shows an error banner above the page content. */
  fail(error: unknown): void;
  clearError(): void;
  error: string;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const notify = useCallback((message: string) => setToast(message), []);
  const fail = useCallback(
    (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)),
    [],
  );
  const clearError = useCallback(() => setError(''), []);
  const value = useMemo(() => ({ notify, fail, clearError, error }), [notify, fail, clearError, error]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): Feedback {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used inside FeedbackProvider');
  return context;
}

/** Shows a failed query's error in the banner. */
export function useReportError(error: unknown) {
  const { fail } = useFeedback();
  useEffect(() => {
    if (error) fail(error);
  }, [error, fail]);
}

export function ErrorBanner() {
  const { error, clearError } = useFeedback();
  if (!error) return null;
  return (
    <div className="message error" role="alert">
      <strong>Action needs attention</strong>
      <span>{error}</span>
      <button onClick={clearError} aria-label="Dismiss error">
        <X size={16} />
      </button>
    </div>
  );
}
