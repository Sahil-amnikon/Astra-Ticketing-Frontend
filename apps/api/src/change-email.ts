import { readConfig } from './config';
import type { Dependencies } from './dependencies';

export async function processChangeEmailJobs(dependencies: Dependencies) {
  const config = readConfig();
  if (
    config.CHANGE_EMAIL_ENABLED !== 'true' ||
    !config.CHANGE_EMAIL_SENDER ||
    !config.ENTRA_CLIENT_ID ||
    !config.ENTRA_CLIENT_SECRET ||
    !config.ENTRA_TENANT_ID
  )
    return 0;
  const queued = await dependencies.db.query<{
    id: string;
    recipient_emails: string[];
    subject: string;
    body: string;
  }>(
    "SELECT id,recipient_emails,subject,body FROM change_communications WHERE status='QUEUED' AND attempts<5 ORDER BY created_at LIMIT 10",
  );
  if (!queued.rowCount) return 0;
  const tokenResponse = await fetch(
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
  if (!tokenResponse.ok)
    throw Object.assign(new Error('Token request failed'), {
      code: `GRAPH_TOKEN_${tokenResponse.status}`,
    });
  const token = String(
    ((await tokenResponse.json()) as { access_token?: string }).access_token ??
      '',
  );
  if (!token)
    throw Object.assign(new Error('Token missing'), {
      code: 'GRAPH_TOKEN_MISSING',
    });
  let sent = 0;
  for (const item of queued.rows) {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.CHANGE_EMAIL_SENDER)}/sendMail`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: item.subject,
            body: { contentType: 'Text', content: item.body },
            toRecipients: item.recipient_emails.map((address) => ({
              emailAddress: { address },
            })),
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.ok) {
      await dependencies.db.query(
        "UPDATE change_communications SET status='SENT',sent_at=now(),attempts=attempts+1,last_error_code=NULL WHERE id=$1 AND status='QUEUED'",
        [item.id],
      );
      sent++;
    } else
      await dependencies.db.query(
        "UPDATE change_communications SET status=CASE WHEN attempts+1>=5 THEN 'FAILED' ELSE 'QUEUED' END,attempts=attempts+1,last_error_code=$2 WHERE id=$1 AND status='QUEUED'",
        [item.id, `GRAPH_${response.status}`],
      );
  }
  return sent;
}
