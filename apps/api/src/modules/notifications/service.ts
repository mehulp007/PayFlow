import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PERMISSIONS, type NotificationFeed, type Permission, type Role } from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import { appUsers, notifications } from '../../db/schema.js';
import { membersWithRoles } from '../auth/service.js';

const FEED_SIZE = 30;

export interface NewNotification {
  kind: string;
  title: string;
  body?: string | null;
  /** In-app path the notification opens. */
  link?: string | null;
}

/** Sends one notification to each membership, skipping duplicates and the person who caused it. */
export async function notifyUsers(
  db: Db | Tx,
  organizationId: string,
  userIds: Array<string | null | undefined>,
  notification: NewNotification,
  except?: string,
): Promise<void> {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== except))];
  if (!recipients.length) return;
  await db.insert(notifications).values(
    recipients.map(userId => ({
      organizationId,
      userId,
      kind: notification.kind,
      title: notification.title,
      body: notification.body ?? null,
      link: notification.link ?? null,
    })),
  );
}

/** Notifies everyone in the organization whose role has the permission. */
export async function notifyPermission(
  db: Db | Tx,
  organizationId: string,
  permission: Permission,
  notification: NewNotification,
  except?: string,
): Promise<void> {
  const members = await membersWithRoles(db, organizationId, PERMISSIONS[permission] as Role[]);
  await notifyUsers(
    db,
    organizationId,
    members.map(member => member.id),
    notification,
    except,
  );
}

/** Accounts linked to the given employee records (their own sign-ins). */
export async function accountsForEmployees(db: Db | Tx, organizationId: string, employeeKeys: string[]) {
  if (!employeeKeys.length) return [];
  const rows = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.organizationId, organizationId),
        eq(appUsers.active, true),
        inArray(appUsers.employeeId, employeeKeys),
      ),
    );
  return rows.map(row => row.id);
}

export async function feed(db: Db, userId: string): Promise<NotificationFeed> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(FEED_SIZE);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return {
    unread,
    items: rows.map(({ id, kind, title, body, link, readAt, createdAt }) => ({
      id,
      kind,
      title,
      body,
      link,
      read: readAt !== null,
      createdAt,
    })),
  };
}

/** Marks the given notifications, or all of them, as read. */
export async function markRead(db: Db, userId: string, ids?: number[]): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids ? inArray(notifications.id, ids.length ? ids : [0]) : undefined,
      ),
    );
}
