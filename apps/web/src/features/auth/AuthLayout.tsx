import type { ReactNode } from 'react';
import { Wallet } from 'lucide-react';

/** Split sign-in layout: form on the left, navy brand panel on the right. */
export function AuthLayout({
  kicker,
  title,
  intro,
  children,
  aside,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-icon">
            <Wallet size={23} />
          </span>
          <div>
            <strong>PayFlow</strong>
            <small>DEMO WORKSPACE</small>
          </div>
        </div>
        <div className="auth-intro">
          <span>{kicker}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        {children}
      </div>
      <aside className="auth-aside">{aside}</aside>
    </div>
  );
}
