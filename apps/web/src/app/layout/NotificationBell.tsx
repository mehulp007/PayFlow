import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import type { AppNotification } from '@payflow/shared';
import { useMarkNotificationsRead, useNotifications } from '../queries';
import { timeAgo } from '../../lib/format';

/** Topbar bell: approvals, send-backs, payslips and leave decisions for the signed-in account. */
export function NotificationBell() {
  const navigate = useNavigate();
  const feed = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const unread = feed.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function openNotification(notification: AppNotification) {
    if (!notification.read) markRead.mutate([notification.id]);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  }

  return (
    <div className="bell" ref={container}>
      <button
        className="icon-button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={19} />
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover notifications" role="dialog" aria-label="Notifications">
          <div className="popover-header">
            <strong>Notifications</strong>
            <button
              className="text-button"
              disabled={!unread || markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              <CheckCheck size={15} /> Mark all read
            </button>
          </div>
          {feed.data?.items.length ? (
            <ul>
              {feed.data.items.map(item => (
                <li key={item.id}>
                  <button className={item.read ? '' : 'unread'} onClick={() => openNotification(item)}>
                    <span className="notification-dot" />
                    <span>
                      <strong>{item.title}</strong>
                      {item.body && <small>{item.body}</small>}
                      <time>{timeAgo(item.createdAt)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="popover-empty">You are all caught up.</p>
          )}
        </div>
      )}
    </div>
  );
}
