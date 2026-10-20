import type { Dependencies } from './dependencies';
import { ticketStaffRecipients } from './mail-queue';
import {
  loadMailSettings,
  smtpTransport,
  type MailSettings,
} from './mail-settings';

export function smtpFailure(error: unknown): {
  state: 'QUEUED' | 'FAILED' | 'UNKNOWN';
  code: string;
} {
  const failure = error as {
    code?: string;
    responseCode?: number;
    command?: string;
  };
  const code = [
    'EAUTH',
    'ECONNECTION',
    'EDNS',
    'ETIMEDOUT',
    'ECONNRESET',
    'EENVELOPE',
    'EMESSAGE',
    'ESOCKET',
  ].includes(failure.code ?? '')
    ? failure.code!
    : 'SMTP_ERROR';
  if (
    failure.responseCode &&
    failure.responseCode >= 400 &&
    failure.responseCode < 500
  )
    return { state: 'QUEUED', code: `SMTP_${failure.responseCode}` };
  if (failure.responseCode && failure.responseCode >= 500)
    return { state: 'FAILED', code: `SMTP_${failure.responseCode}` };
  if (['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(code))
    return { state: 'FAILED', code };
  if (['ECONNECTION', 'EDNS'].includes(code) || failure.command === 'CONN')
    return { state: 'QUEUED', code };
  // SMTP cannot guarantee exactly-once delivery after an ambiguous disconnect.
  return { state: 'UNKNOWN', code };
}
interface OutboundMessage {
  id: string;
  channel: string;
  ticket_id: string | null;
  comment_id: string | null;
  mailbox: string;
  message_id: string;
  in_reply_to: string | null;
  reference_ids: string[];
  recipient_addresses: string[];
  subject: string;
  body: string;
  communication_id: string | null;
  attempts: number;
}
export async function processMailOutbox(
  dependencies: Dependencies,
  settings?: MailSettings,
) {
  const config = settings ?? (await loadMailSettings(dependencies));
  if (!config.enabled) return 0;
  const transport = smtpTransport(config);
  let sent = 0;
  try {
    await dependencies.db.query(
      "UPDATE mail_messages SET state='UNKNOWN',last_error_code='DELIVERY_INTERRUPTED' WHERE state='SENDING' AND lease_until<now()",
    );
    for (let index = 0; index < 10; index++) {
      const result = await dependencies.db
        .query<OutboundMessage>(`WITH next AS (
        SELECT id FROM mail_messages WHERE direction='OUTBOUND' AND state='QUEUED' AND attempts<5 AND next_attempt_at<=now()
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE mail_messages m SET state='SENDING',attempts=attempts+1,lease_until=now()+interval '2 minutes'
        FROM next WHERE m.id=next.id RETURNING m.*`);
      const item = result.rows[0];
      if (!item) break;
      const customerReply =
        item.channel === 'TICKET' && item.comment_id !== null;
      const authorizedRoute = customerReply
        ? await dependencies.db.query(
            `SELECT 1 FROM client_mail_routes r JOIN tickets t ON t.client_id=r.client_id
             JOIN contacts c ON c.id=t.requester_id JOIN ticket_comments tc ON tc.id=$3
             WHERE t.id=$1 AND r.address=$2 AND t.email_reply_address=r.address
               AND r.active AND r.outbound_authorized AND tc.ticket_id=t.id
               AND tc.comment_type='PUBLIC' AND c.active
               AND lower(c.email)=ANY($4::text[]) AND cardinality($4::text[])=1`,
            [
              item.ticket_id,
              item.mailbox,
              item.comment_id,
              item.recipient_addresses,
            ],
          )
        : { rowCount: 0 };
      if (
        (item.mailbox !== config.ticket_address && !authorizedRoute.rowCount) ||
        !['TICKET', 'TEST'].includes(item.channel) ||
        (item.channel === 'TICKET' && !item.ticket_id)
      ) {
        await dependencies.db.query(
          "UPDATE mail_messages SET state='FAILED',last_error_code='INTERNAL_TICKET_MAIL_ONLY',lease_until=NULL WHERE id=$1",
          [item.id],
        );
        continue;
      }
      const allowed =
        customerReply && authorizedRoute.rowCount
          ? item.recipient_addresses.map((a) => a.toLowerCase())
          : item.channel === 'TICKET'
            ? await ticketStaffRecipients(dependencies.db, item.ticket_id!)
            : (
                await dependencies.db.query<{ email: string }>(
                  "SELECT DISTINCT lower(u.email) AS email FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active AND r.role_code='ADMIN' AND u.id=(SELECT created_by_user_id FROM mail_messages WHERE id=$1)",
                  [item.id],
                )
              ).rows.map((r) => r.email);
      if (
        !item.recipient_addresses.length ||
        item.recipient_addresses.some(
          (address) => !allowed.includes(address.toLowerCase()),
        )
      ) {
        await dependencies.db.query(
          "UPDATE mail_messages SET state='FAILED',last_error_code='RECIPIENT_ACCESS_CHANGED',lease_until=NULL WHERE id=$1",
          [item.id],
        );
        continue;
      }
      try {
        const info = await transport.sendMail({
          from: { name: 'Amnikon Service Desk', address: item.mailbox },
          to: item.recipient_addresses,
          replyTo: item.mailbox,
          subject: item.subject,
          text: item.body,
          messageId: item.message_id,
          inReplyTo: item.in_reply_to ?? undefined,
          references: item.reference_ids,
          headers: {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
          },
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        // Partial acceptance must not blindly retry and duplicate mail for accepted recipients.
        const state = info.rejected?.length ? 'UNKNOWN' : 'SENT';
        await dependencies.db.query(
          'UPDATE mail_messages SET state=$2,processed_at=now(),lease_until=NULL,last_error_code=$3 WHERE id=$1',
          [
            item.id,
            state,
            state === 'UNKNOWN' ? 'PARTIAL_RECIPIENT_REJECTION' : null,
          ],
        );
        if (item.communication_id)
          await dependencies.db.query(
            "UPDATE change_communications SET status=$2,sent_at=CASE WHEN $2='SENT' THEN now() ELSE NULL END,attempts=$3,last_error_code=$4 WHERE id=$1",
            [
              item.communication_id,
              state === 'SENT' ? 'SENT' : 'FAILED',
              item.attempts,
              state === 'SENT' ? null : 'CHECK_EMAIL_DELIVERY',
            ],
          );
        if (state === 'SENT') sent++;
      } catch (error) {
        const failure = smtpFailure(error);
        const state =
          item.attempts >= 5 && failure.state === 'QUEUED'
            ? 'FAILED'
            : failure.state;
        await dependencies.db.query(
          "UPDATE mail_messages SET state=$2,last_error_code=$3,lease_until=NULL,next_attempt_at=now()+($4*interval '1 minute') WHERE id=$1",
          [item.id, state, failure.code, Math.min(60, 2 ** item.attempts)],
        );
        if (item.communication_id)
          await dependencies.db.query(
            'UPDATE change_communications SET status=$2,attempts=$3,last_error_code=$4 WHERE id=$1',
            [
              item.communication_id,
              state === 'QUEUED' ? 'QUEUED' : 'FAILED',
              item.attempts,
              failure.code,
            ],
          );
      }
    }
  } finally {
    transport.close();
  }
  return sent;
}
