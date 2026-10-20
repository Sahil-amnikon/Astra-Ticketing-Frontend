import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_ROOT = path.resolve(
  process.env.ATTACHMENT_STORAGE_ROOT ?? '/app/storage',
);
const READY_MARKER =
  process.env.ATTACHMENT_STORAGE_MARKER ?? '.amnikon-storage-ready';

function resolveStoragePath(storageKey: string) {
  if (!storageKey || storageKey.startsWith('database:')) {
    throw new Error('Invalid filesystem storage key');
  }

  const rootPrefix = STORAGE_ROOT.endsWith(path.sep)
    ? STORAGE_ROOT
    : `${STORAGE_ROOT}${path.sep}`;
  const resolved = path.resolve(STORAGE_ROOT, storageKey);

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootPrefix)) {
    throw new Error('Attachment storage key escapes storage root');
  }

  return resolved;
}

async function assertStorageReady() {
  await stat(STORAGE_ROOT);
  await stat(path.join(STORAGE_ROOT, READY_MARKER));
}

function safeExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  const safe = ext.replace(/[^a-z0-9.]/g, '').slice(0, 17);
  return safe.length > 1 ? safe : '';
}

export async function storeTicketAttachment(input: {
  ticketId: string;
  attachmentId: string;
  fileName: string;
  content: Buffer;
}) {
  await assertStorageReady();

  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const extension = safeExtension(input.fileName);
  const storageKey =
    `tickets/${year}/${month}/${input.ticketId}/${input.attachmentId}${extension}`;

  const target = resolveStoragePath(storageKey);
  const dir = path.dirname(target);

  await mkdir(dir, { recursive: true, mode: 0o2770 });

  const temp = path.join(
    dir,
    `.${input.attachmentId}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temp, input.content, { mode: 0o660 });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    storageKey,
    sha256: createHash('sha256').update(input.content).digest('hex'),
  };
}

export async function readStoredTicketAttachment(storageKey: string) {
  await assertStorageReady();
  return readFile(resolveStoragePath(storageKey));
}

export async function deleteStoredTicketAttachment(storageKey: string) {
  if (!storageKey || storageKey.startsWith('database:')) return;
  await assertStorageReady();
  await rm(resolveStoragePath(storageKey), { force: true });
}
