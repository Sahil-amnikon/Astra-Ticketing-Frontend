import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

type Db = Pick<PoolClient, 'query'>;
export const normalizeAddress = (value: string) => value.trim().toLowerCase();
export function makeMessageId(mailbox: string) {
  return `<${randomBytes(24).toString('hex')}@${mailbox.split('@')[1]}>`;
}
// Staff membership and the ticket's current client/site scope decide recipients.
// Requester/contact addresses never enter this list.
export async function ticketStaffRecipients(db: Db, ticketId: string) {
  const result = await db.query<{ email: string }>(
    `SELECT DISTINCT lower(u.email) AS email
     FROM tickets t JOIN users u ON u.active AND u.email IS NOT NULL
     WHERE t.id=$1 AND (
       EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='ADMIN')
       OR (
         (u.id=t.assigned_user_id AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code IN ('TECHNICIAN','TEAM_LEAD'))
          OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='TEAM_LEAD'))
         AND EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=t.client_id)
         AND (NOT EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id)
              OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=t.site_id))
       )
     ) ORDER BY email`,
    [ticketId],
  );
  return result.rows.map((r) => r.email);
}
export async function queueTicketEmail(
  db: Db,
  ticketId: string,
  commentId: string | null,
  actorId: string | null,
  event: string,
) {
  const settings = (
    await db.query(
      'SELECT enabled,ticket_address FROM mail_settings WHERE id=1',
    )
  ).rows[0];
  if (!settings?.enabled) return { queued: false };
  const ticket = (
    await db.query('SELECT ticket_number,subject FROM tickets WHERE id=$1', [
      ticketId,
    ])
  ).rows[0];
  if (!ticket) return { queued: false };
  const recipients = (await ticketStaffRecipients(db, ticketId)).filter(
    (address) => address !== settings.ticket_address,
  );
  if (!recipients.length) return { queued: false };
  const parent =
    (
      await db.query(
        "SELECT message_id FROM mail_messages WHERE ticket_id=$1 AND state IN ('SENT','RECEIVED') ORDER BY created_at DESC LIMIT 1",
        [ticketId],
      )
    ).rows[0]?.message_id ?? null;
  const result = await db.query(
    `INSERT INTO mail_messages(direction,channel,ticket_id,comment_id,mailbox,message_id,in_reply_to,reference_ids,sender_address,recipient_addresses,subject,body,state,created_by_user_id)
    VALUES('OUTBOUND','TICKET',$1,$2,$3,$4,$5,$6,$3,$7,$8,$9,'QUEUED',$10) ON CONFLICT DO NOTHING RETURNING id`,
    [
      ticketId,
      commentId,
      settings.ticket_address,
      makeMessageId(settings.ticket_address),
      parent,
      parent ? [parent] : [],
      recipients,
      `[${ticket.ticket_number}] ${ticket.subject}`,
      `${event}\n\nTicket: ${ticket.ticket_number}\nSubject: ${ticket.subject}\nOpen the ticket in your assigned workspace.`,
      actorId,
    ],
  );
  return { queued: Boolean(result.rowCount) };
}

export async function queueRequesterReply(
  db: Db,
  ticketId: string,
  commentId: string,
  actorId: string,
) {
  const result = await db.query<{
    address: string;
    requester: string;
    ticket_number: string;
    subject: string;
    body: string;
  }>(
    `SELECT r.address,lower(c.email) AS requester,t.ticket_number,t.subject,tc.body
     FROM tickets t JOIN contacts c ON c.id=t.requester_id
     JOIN ticket_comments tc ON tc.id=$2 AND tc.ticket_id=t.id AND tc.comment_type='PUBLIC'
     JOIN client_mail_routes r ON r.client_id=t.client_id AND r.address=t.email_reply_address
     JOIN mail_settings s ON s.id=1 AND s.enabled
     WHERE t.id=$1 AND t.source='EMAIL' AND r.active AND r.outbound_authorized
       AND c.active AND c.email IS NOT NULL`,
    [ticketId, commentId],
  );
  if (result.rows.length !== 1) return { queued: false };
  const row = result.rows[0]!;
  const parent =
    (
      await db.query<{ message_id: string }>(
        `SELECT message_id FROM mail_messages WHERE ticket_id=$1 AND state IN ('RECEIVED','SENT')
     ORDER BY created_at DESC LIMIT 1`,
        [ticketId],
      )
    ).rows[0]?.message_id ?? null;
  const sent = await db.query(
    `INSERT INTO mail_messages(direction,channel,ticket_id,comment_id,mailbox,message_id,in_reply_to,reference_ids,sender_address,recipient_addresses,subject,body,state,created_by_user_id)
     VALUES('OUTBOUND','TICKET',$1,$2,$3,$4,$5,$6,$3,$7,$8,$9,'QUEUED',$10)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      ticketId,
      commentId,
      row.address,
      makeMessageId(row.address),
      parent,
      parent ? [parent] : [],
      [row.requester],
      `[${row.ticket_number}] ${row.subject}`,
      row.body,
      actorId,
    ],
  );
  return { queued: Boolean(sent.rowCount) };
}

export async function queueChangeEmail(
  _db: Db,
  _changeId: string,
  _communicationId: string,
  _actorId: string,
) {
  void _db;
  void _changeId;
  void _communicationId;
  void _actorId;
  throw new BadRequestException(
    'CAB email is disabled. Record updates within Change Management.',
  );
}
