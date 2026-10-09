import { useEffect, type ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react';
import { count, money } from '../lib/format';

export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

export type Tone = 'blue' | 'mint' | 'rose' | 'violet';

/** Numbers are treated as paise and shown in compact rupees; strings are shown as given. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  foot,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  foot?: string;
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">
        <Icon size={22} />
      </div>
      <div className="stat-text">
        <strong>{typeof value === 'number' ? money(value, true) : value}</strong>
        <span>{label}</span>
        {foot && <small>{foot}</small>}
      </div>
    </div>
  );
}

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: PillTone }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function PanelTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SmallLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="small-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}

export function DetailRow({ label, value, total = false }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={`detail-row${total ? ' total' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);
}

/** Right-hand panel over a dimmed page. Closes on the backdrop, the close button or Escape. */
export function Drawer({
  eyebrow,
  title,
  subtitle,
  onClose,
  className = '',
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className={`drawer ${className}`}
        role="dialog"
        aria-label={title}
        onClick={event => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <small>{eyebrow}</small>
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Modal({
  onClose,
  className = '',
  label,
  children,
}: {
  onClose: () => void;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="overlay modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-label={label} onClick={event => event.stopPropagation()}>
        <button className="icon-button modal-close" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  size,
  total,
  onPage,
  showPageCount = true,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  showPageCount?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        Showing {total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} of {count(total)}
      </span>
      <div>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>{showPageCount ? `Page ${page} / ${pages}` : `Page ${page}`}</span>
        <button aria-label="Next page" disabled={page * size >= total} onClick={() => onPage(page + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: Array<[title: string, subtitle: string]>; current: number }) {
  return (
    <div className="stepper">
      {steps.map(([title, subtitle], index) => (
        <div className={`step ${index < current ? 'complete' : ''} ${index === current ? 'current' : ''}`} key={title}>
          <div className="step-top">
            <span className="step-circle">{index < current ? <CheckCircle2 size={19} /> : index + 1}</span>
            <span className="step-line" />
          </div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div>
        <Icon size={38} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
