import { readConfig } from './config';
import type { Dependencies } from './dependencies';
import { loadMailSettings, type MailSettings } from './mail-settings';
import { normalizeAddress, queueTicketEmail } from './mail-queue';
import type { PoolClient } from 'pg';

export interface IncomingMail {
  mailbox: string;
  messageId: string;
  sender: string;
  recipients: string[];
  subject: string;
  body: string;
  references: string[];
  inReplyTo?: string;
  automatic: boolean;
  authenticated: boolean;
  attachments: { fileName: string; contentType: string; content: Buffer }[];
  attachmentProblem?: boolean;
}
export function referenceIds(value: string) {
  return [...new Set(value.match(/<[^<>\s]{1,998}>/g) ?? [])].slice(-30);
}
export function acceptedEmailFile(name: string, type: string, size: number) {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !Array.from(name).some(
      (c) => c.charCodeAt(0) < 32 || c === '/' || c === '\\',
    ) &&
    size > 0 &&
    size <= 5 * 1024 * 1024 &&
    [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(type)
  );
}
async function createEmailTicket(
  db: PoolClient,
  contact: {
    id: string;
    client_id: string;
    site_id: string | null;
  },
  categoryId: string,
  input: IncomingMail,
) {
  const number = await db.query<{ ticket_number: string }>(
    `WITH sequence AS (
      INSERT INTO client_ticket_sequences(client_id,next_number) VALUES($1,2)
      ON CONFLICT(client_id) DO UPDATE SET next_number=client_ticket_sequences.next_number+1
      RETURNING next_number-1 AS value
    ) SELECT c.ticket_prefix || '-' || lpad(sequence.value::text,6,'0') AS ticket_number
      FROM clients c CROSS JOIN sequence WHERE c.id=$1`,
    [contact.client_id],
  );
  const ticket = (
    await db.query<{ id: string; ticket_number: string }>(
      `INSERT INTO tickets(ticket_number,client_id,requester_id,site_id,subject,description,source,priority,source_message_id,category_id)
     VALUES($1,$2,$3,$4,$5,$6,'EMAIL','P3_MEDIUM',$7,$8) RETURNING id,ticket_number`,
      [
        number.rows[0]?.ticket_number,
        contact.client_id,
        contact.id,
        contact.site_id,
        input.subject.trim().slice(0, 200) || 'Email support request',
        input.body.trim().slice(0, 20000) || '(No message text)',
        input.messageId,
        categoryId,
      ],
    )
  ).rows[0];
  if (!ticket) throw new Error('EMAIL_TICKET_CREATE_FAILED');
  await db.query('UPDATE tickets SET email_reply_address=$2 WHERE id=$1', [
    ticket.id,
    input.recipients[0],
  ]);
  await db.query(
    `INSERT INTO ticket_sla(ticket_id,policy_id,calendar_id,target_priority,response_warning_at,response_due_at,resolution_warning_at,resolution_due_at)
     SELECT $1,p.id,p.calendar_id,p.priority,
       sla_add_business_minutes(p.calendar_id,now(),ceil(p.response_minutes*p.warning_percent/100.0)::int),
       sla_add_business_minutes(p.calendar_id,now(),p.response_minutes),
       sla_add_business_minutes(p.calendar_id,now(),ceil(p.resolution_minutes*p.warning_percent/100.0)::int),
       sla_add_business_minutes(p.calendar_id,now(),p.resolution_minutes)
     FROM sla_policies p WHERE p.priority='P3_MEDIUM' AND p.active`,
    [ticket.id],
  );
  await db.query(
    "INSERT INTO ticket_history(ticket_id,action,new_value) VALUES($1,'TICKET.CREATED',$2::jsonb)",
    [
      ticket.id,
      JSON.stringify({ ticketNumber: ticket.ticket_number, source: 'EMAIL' }),
    ],
  );
  await db.query(
    `INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key)
     SELECT DISTINCT u.id,$1::uuid,'TICKET_UNATTENDED',$2,$3,'mail-intake:' || $1::text || ':' || u.id::text
     FROM users u WHERE u.active AND (
       EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='ADMIN')
       OR (EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='TEAM_LEAD')
         AND EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=$4)
         AND (NOT EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id)
              OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=$5)))
     ) ON CONFLICT(event_key) DO NOTHING`,
    [
      ticket.id,
      `${ticket.ticket_number} received by email`,
      ticket.ticket_number,
      contact.client_id,
      contact.site_id,
    ],
  );
  return ticket;
}
export async function ingestMail(
  dependencies: Dependencies,
  input: IncomingMail,
) {
  const db = await dependencies.db.connect();
  try {
    await db.query('BEGIN');
    const config = (
      await db.query(
        'SELECT ticket_address,change_address FROM mail_settings WHERE id=1',
      )
    ).rows[0];
    if (![config.ticket_address, config.change_address].includes(input.mailbox))
      throw new Error('MAILBOX_CHANGED');
    const channel =
      input.mailbox === config.ticket_address ? 'TICKET' : 'CHANGE';
    const message = (
      await db.query(
        `INSERT INTO mail_messages(direction,channel,mailbox,message_id,in_reply_to,reference_ids,sender_address,recipient_addresses,subject,body,state)
      VALUES('INBOUND',$1,$2,$3,$4,$5,$6,$7,$8,$9,'REVIEW') ON CONFLICT(mailbox,message_id) DO NOTHING RETURNING id`,
        [
          channel,
          input.mailbox,
          input.messageId,
          input.inReplyTo ?? null,
          input.references,
          normalizeAddress(input.sender),
          input.recipients,
          input.subject.slice(0, 300),
          input.body.slice(0, 20000),
        ],
      )
    ).rows[0];
    if (!message) {
      await db.query('COMMIT');
      return { duplicate: true };
    }
    const id = String(message.id),
      sender = normalizeAddress(input.sender);
    // Only the original To address is considered. A forward which replaces To
    // with the collection mailbox must be reviewed until its recipient is verified.
    const recipients = [...new Set(input.recipients.map(normalizeAddress))];
    const routes = await db.query<{ address: string; client_id: string }>(
      `SELECT r.address,r.client_id FROM client_mail_routes r JOIN clients c ON c.id=r.client_id
       WHERE r.active AND c.status='ACTIVE' AND r.address=ANY($1::text[])`,
      [recipients],
    );
    const route = routes.rows.length === 1 ? routes.rows[0] : null;
    await db.query(
      'UPDATE mail_messages SET contacted_address=$2 WHERE id=$1',
      [id, route?.address ?? null],
    );
    const internalSender = await db.query(
      "SELECT 1 FROM users u WHERE u.active AND lower(u.email)=$1 AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code IN ('ADMIN','TEAM_LEAD','TECHNICIAN'))",
      [sender],
    );
    let state = 'REVIEW',
      reason = 'UNMATCHED_THREAD',
      ticketId: string | null = null,
      changeId: string | null = null;
    if (channel !== 'TICKET') {
      state = 'IGNORED';
      reason = 'INTERNAL_TICKET_EMAIL_ONLY';
    } else if (
      input.automatic ||
      [config.ticket_address, config.change_address].includes(sender)
    ) {
      state = 'IGNORED';
      reason = 'AUTOMATIC_OR_SELF';
    } else if (!input.authenticated) reason = 'SENDER_AUTH_REVIEW';
    else if (input.attachmentProblem) reason = 'ATTACHMENT_REVIEW';
    else {
      const refs = [
        ...new Set(
          [input.inReplyTo, ...input.references].filter((x): x is string =>
            Boolean(x),
          ),
        ),
      ];
      const targets = await db.query(
        `SELECT DISTINCT ticket_id,change_id FROM mail_messages
        WHERE mailbox=$1 AND message_id=ANY($2::text[]) AND state IN ('SENT','RECEIVED') AND (ticket_id IS NOT NULL OR change_id IS NOT NULL)`,
        [input.mailbox, refs],
      );
      if (targets.rowCount === 1 && route) {
        const target = targets.rows[0];
        const allowed = target.ticket_id
          ? await db.query(
              `SELECT 1 FROM tickets t WHERE t.id=$1 AND (
              (EXISTS(SELECT 1 FROM contacts c WHERE c.id=t.requester_id AND c.active AND lower(c.email)=$2)
               AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active AND lower(u.email)=$2 AND r.role_code IN ('ADMIN','TEAM_LEAD','TECHNICIAN')))
              OR EXISTS(SELECT 1 FROM users u WHERE u.active AND lower(u.email)=$2 AND (
            EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='ADMIN')
            OR (EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=t.client_id)
              AND (NOT EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id)
                OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=t.site_id))
              AND (u.id=t.assigned_user_id OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='TEAM_LEAD'))))))`,
              [target.ticket_id, sender],
            )
          : { rowCount: 0 };
        const sameClient = target.ticket_id
          ? await db.query(
              'SELECT 1 FROM tickets WHERE id=$1 AND client_id=$2 AND email_reply_address=$3',
              [target.ticket_id, route.client_id, route.address],
            )
          : { rowCount: 0 };
        if (allowed.rowCount && sameClient.rowCount) {
          ticketId = target.ticket_id;
          changeId = target.change_id;
          state = 'RECEIVED';
          reason = 'MATCHED_REPLY';
        } else reason = 'PARTICIPANT_REVIEW';
      } else if ((targets.rowCount ?? 0) > 1) reason = 'AMBIGUOUS_THREAD';
      else if (!route) reason = 'UNKNOWN_OR_AMBIGUOUS_RECIPIENT';
      else if (refs.length) reason = 'UNMATCHED_THREAD';
      else if (
        internalSender.rowCount &&
        route.client_id !== '00000000-0000-4000-8000-000000000132'
      )
        reason = 'STAFF_INTAKE_REVIEW';
      else {
        // Match the exact active contact, not a sender domain or a subject line.
        const contacts = await db.query<{
          id: string;
          client_id: string;
          site_id: string | null;
        }>(
          `SELECT c.id,c.client_id,c.site_id FROM contacts c JOIN clients cl ON cl.id=c.client_id
           WHERE c.active AND cl.status='ACTIVE' AND c.client_id=$2 AND lower(c.email)=$1
             AND (c.site_id IS NULL OR EXISTS(SELECT 1 FROM sites s WHERE s.id=c.site_id AND s.active))
           LIMIT 2`,
          [sender, route.client_id],
        );
        const source = await db.query(
          "SELECT 1 FROM ticket_sources WHERE code='EMAIL' AND active",
        );
        const category = await db.query<{ id: string }>(
          "SELECT id FROM categories WHERE parent_id IS NULL AND lower(name)='general support' AND active LIMIT 1",
        );
        if (contacts.rows.length === 0 && source.rowCount && category.rows[0]) {
          // The address identifies the client; the sender becomes its requester.
          const created = await db.query<{
            id: string;
            client_id: string;
            site_id: null;
          }>(
            `INSERT INTO contacts(client_id,name,email) VALUES($1,$2,$3)
             RETURNING id,client_id,NULL::uuid AS site_id`,
            [route.client_id, sender.split('@')[0] || sender, sender],
          );
          contacts.rows.push(created.rows[0]!);
        }
        if (contacts.rows.length === 1 && source.rowCount && category.rows[0]) {
          const ticket = await createEmailTicket(
            db,
            contacts.rows[0]!,
            category.rows[0].id,
            { ...input, recipients: [route.address] },
          );
          ticketId = ticket.id;
          state = 'RECEIVED';
          reason = 'NEW_TICKET';
        } else
          reason =
            contacts.rows.length > 1
              ? 'AMBIGUOUS_CONTACT'
              : !contacts.rows.length
                ? 'UNKNOWN_CONTACT'
                : 'EMAIL_INTAKE_CONFIGURATION';
      }
    }
    await db.query(
      'UPDATE mail_messages SET state=$2,last_error_code=$3,ticket_id=$4,change_id=$5,processed_at=now() WHERE id=$1',
      [id, state, reason, ticketId, changeId],
    );
    for (const file of state === 'IGNORED' ? [] : input.attachments) {
      if (
        !acceptedEmailFile(file.fileName, file.contentType, file.content.length)
      )
        continue;
      await db.query(
        'INSERT INTO mail_attachments(message_id,file_name,content_type,content,size_bytes) VALUES($1,$2,$3,$4,$5)',
        [
          id,
          file.fileName,
          file.contentType,
          file.content,
          file.content.length,
        ],
      );
    }
    if (ticketId && reason === 'NEW_TICKET') {
      await queueTicketEmail(
        db,
        ticketId,
        null,
        null,
        'New ticket received by email.',
      );
    } else if (ticketId) {
      await db.query('UPDATE tickets SET updated_at=now() WHERE id=$1', [
        ticketId,
      ]);
      await db.query(
        "INSERT INTO ticket_history(ticket_id,action,new_value) VALUES($1,'TICKET.EMAIL_REPLY_RECEIVED',$2::jsonb)",
        [ticketId, JSON.stringify({ messageId: id, sender })],
      );
      await db.query(
        `INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key)
        SELECT assigned_user_id,id,'PUBLIC_REPLY',ticket_number || ' received an email reply',subject,$2 FROM tickets WHERE id=$1 AND assigned_user_id IS NOT NULL ON CONFLICT(event_key) DO NOTHING`,
        [ticketId, `email:${id}`],
      );
    }
    if (changeId) {
      await db.query('UPDATE changes SET updated_at=now() WHERE id=$1', [
        changeId,
      ]);
      await db.query(
        "INSERT INTO change_history(change_id,event,details) VALUES($1,'CHANGE.EMAIL_REPLY_RECEIVED',$2::jsonb)",
        [changeId, JSON.stringify({ messageId: id, sender })],
      );
      await db.query(
        `INSERT INTO notifications(user_id,change_id,type,title,body,event_key)
        SELECT owner_user_id,id,'CHANGE_STATUS_UPDATED',change_number || ' received an email reply',title,$2 FROM changes WHERE id=$1 ON CONFLICT(event_key) DO NOTHING`,
        [changeId, `email:${id}`],
      );
    }
    await db.query(
      "INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES('EMAIL.RECEIVED','EMAIL',$1,$2::jsonb)",
      [id, JSON.stringify({ state, reason, ticketId, changeId })],
    );
    await db.query('COMMIT');
    return { id, state };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: { emailAddress: { address: string } }[];
  body?: { contentType: string; content: string };
  internetMessageHeaders?: { name: string; value: string }[];
}
function graphUrl(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'graph.microsoft.com' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !parsed.pathname.startsWith('/v1.0/users/')
  )
    throw new Error('GRAPH_CURSOR_INVALID');
  return parsed.href;
}
async function graphGet(url: string, token: string) {
  const response = await fetch(graphUrl(url), {
    headers: {
      authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok)
    throw Object.assign(new Error('Mailbox request failed'), {
      code: `GRAPH_MAIL_${response.status}`,
    });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GRAPH_EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 8 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('GRAPH_RESPONSE_TOO_LARGE');
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function processMailInbox(
  dependencies: Dependencies,
  settings?: MailSettings,
) {
  const s = settings ?? (await loadMailSettings(dependencies));
  if (s.inbound_provider !== 'MICROSOFT_365' || !s.inbound_since) return 0;
  const config = readConfig();
  if (
    !config.ENTRA_TENANT_ID ||
    !config.ENTRA_CLIENT_ID ||
    !config.ENTRA_CLIENT_SECRET
  )
    return 0;
  const lock = await dependencies.db.connect();
  let count = 0;
  try {
    const acquired = (
      await lock.query('SELECT pg_try_advisory_lock($1) AS acquired', [538002])
    ).rows[0]?.acquired;
    if (!acquired) return 0;
    const response = await fetch(
      `https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.ENTRA_CLIENT_ID,
          client_secret: config.ENTRA_CLIENT_SECRET,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw Object.assign(new Error('Mail token failed'), {
        code: `GRAPH_MAIL_TOKEN_${response.status}`,
      });
    const token = String(
      ((await response.json()) as { access_token?: string }).access_token ?? '',
    );
    if (!token) throw new Error('GRAPH_MAIL_TOKEN_MISSING');
    for (const mailbox of [s.ticket_address]) {
      try {
        const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
        const state = (
          await dependencies.db.query(
            'SELECT cursor FROM mail_sync_state WHERE mailbox=$1',
            [mailbox],
          )
        ).rows[0];
        let cursor = state?.cursor as string | undefined;
        if (!cursor) {
          const url = new URL(`${base}/mailFolders/inbox/messages/delta`);
          url.searchParams.set('$select', 'id,receivedDateTime');
          url.searchParams.set(
            '$filter',
            `receivedDateTime ge ${new Date(s.inbound_since).toISOString()}`,
          );
          url.searchParams.set('$top', '20');
          cursor = url.href;
        }
        for (let page = 0; page < 3; page++) {
          const batch = (await graphGet(cursor, token)) as {
            value: (GraphMessage & { '@removed'?: unknown })[];
            '@odata.nextLink'?: string;
            '@odata.deltaLink'?: string;
          };
          for (const item of batch.value ?? []) {
            if (
              item['@removed'] ||
              (item.receivedDateTime &&
                new Date(item.receivedDateTime) < new Date(s.inbound_since))
            )
              continue;
            const message = (await graphGet(
              `${base}/messages/${encodeURIComponent(item.id)}?$select=id,internetMessageId,subject,from,toRecipients,body,internetMessageHeaders,hasAttachments`,
              token,
            )) as GraphMessage;
            if (
              !message.internetMessageId ||
              !message.from?.emailAddress?.address
            )
              continue;
            const headers = message.internetMessageHeaders ?? [];
            const header = (name: string) =>
              headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
            const files: IncomingMail['attachments'] = [];
            let attachmentProblem = false;
            if (message.hasAttachments) {
              const result = (await graphGet(
                `${base}/messages/${encodeURIComponent(item.id)}/attachments?$select=id,name,contentType,size&$top=11`,
                token,
              )) as {
                value: {
                  '@odata.type': string;
                  id: string;
                  name: string;
                  contentType: string;
                  size: number;
                  contentBytes?: string;
                }[];
                '@odata.nextLink'?: string;
              };
              attachmentProblem =
                Boolean(result['@odata.nextLink']) || result.value.length > 10;
              for (const file of result.value.slice(0, 10)) {
                if (
                  file['@odata.type'] !== '#microsoft.graph.fileAttachment' ||
                  !acceptedEmailFile(file.name, file.contentType, file.size)
                ) {
                  attachmentProblem = true;
                  continue;
                }
                if (
                  files.reduce((n, f) => n + f.content.length, 0) + file.size >
                  20 * 1024 * 1024
                ) {
                  attachmentProblem = true;
                  continue;
                }
                const downloaded = (await graphGet(
                  `${base}/messages/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(file.id)}`,
                  token,
                )) as { contentBytes?: string };
                if (!downloaded.contentBytes) {
                  attachmentProblem = true;
                  continue;
                }
                const content = Buffer.from(downloaded.contentBytes, 'base64');
                if (
                  !acceptedEmailFile(
                    file.name,
                    file.contentType,
                    content.length,
                  )
                ) {
                  attachmentProblem = true;
                  continue;
                }
                files.push({
                  fileName: file.name,
                  contentType: file.contentType,
                  content,
                });
              }
            }
            const outcome = await ingestMail(dependencies, {
              mailbox,
              messageId: message.internetMessageId,
              sender: message.from.emailAddress.address,
              recipients: (message.toRecipients ?? []).map(
                (x) => x.emailAddress.address,
              ),
              subject: message.subject ?? '',
              body:
                message.body?.contentType.toLowerCase() === 'text'
                  ? message.body.content
                  : '[HTML message retained in mailbox; review required]',
              inReplyTo: referenceIds(header('in-reply-to'))[0],
              references: referenceIds(header('references')),
              automatic:
                !['', 'no'].includes(header('auto-submitted').toLowerCase()) ||
                /^multipart\/report/i.test(header('content-type')),
              // Failed, missing or ambiguous authentication is held for manual review. Never approve changes by email.
              authenticated: /\bdmarc=pass\b/i.test(
                header('authentication-results'),
              ),
              attachments: files,
              attachmentProblem:
                attachmentProblem ||
                message.body?.contentType.toLowerCase() !== 'text',
            });
            if (!outcome.duplicate) count++;
          }
          const next = batch['@odata.nextLink'] ?? batch['@odata.deltaLink'];
          if (!next) throw new Error('GRAPH_MAIL_CURSOR_MISSING');
          await dependencies.db.query(
            'INSERT INTO mail_sync_state(mailbox,cursor,last_sync_at,last_error_code) VALUES($1,$2,now(),NULL) ON CONFLICT(mailbox) DO UPDATE SET cursor=excluded.cursor,last_sync_at=now(),last_error_code=NULL',
            [mailbox, graphUrl(next)],
          );
          cursor = next;
          if (!batch['@odata.nextLink']) break;
        }
      } catch (error) {
        const code = String(
          (error as { code?: string }).code ?? 'MAIL_SYNC_FAILED',
        ).slice(0, 80);
        await dependencies.db.query(
          "INSERT INTO mail_sync_state(mailbox,last_error_code) VALUES($1,$2) ON CONFLICT(mailbox) DO UPDATE SET last_error_code=$2,cursor=CASE WHEN $2='GRAPH_MAIL_410' THEN NULL ELSE mail_sync_state.cursor END",
          [mailbox, code],
        );
      }
    }
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [538002]);
    lock.release();
  }
  return count;
}
