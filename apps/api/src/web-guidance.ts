import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { isIP } from 'node:net';
import type { AuthenticatedUser } from './auth';
import { readConfig } from './config';
import { Dependencies } from './dependencies';
import { extractProcedure, readLimitedHtml } from './source-steps';

export class WebGuidanceDto {
  @IsString() @MinLength(3) @MaxLength(500) query!: string;
}

type SearchResult = {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  extra_snippets?: unknown;
};

function isBlockedIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (!version) return false;
  if (version === 4) {
    const octets = hostname.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isBlockedIp(mapped);
  }
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

export function approvedSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      isBlockedIp(hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function excerpt(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sourceName(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

type EmbeddedImage = {
  alt: string;
  dataUrl: string;
};

async function readLimitedImage(response: Response): Promise<string | null> {
  if (!response.ok) return null;
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '';
  if (
    ![
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
    ].includes(contentType)
  )
    return null;
  if (Number(response.headers.get('content-length') ?? 0) > 350_000)
    return null;
  if (!response.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 350_000) return null;
      chunks.push(value);
    }
    return `data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function embedProcedureImages(
  images: Array<{ src: string; alt: string }>,
): Promise<EmbeddedImage[]> {
  const embedded: EmbeddedImage[] = [];
  let totalBytes = 0;
  for (const image of images.slice(0, 4)) {
    const href = approvedSource(image.src);
    if (!href) continue;
    try {
      const response = await fetch(href, {
        redirect: 'error',
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.5',
        },
        signal: AbortSignal.timeout(5000),
      });
      const dataUrl = await readLimitedImage(response);
      if (!dataUrl) continue;
      const size = Math.floor((dataUrl.length * 3) / 4);
      if (totalBytes + size > 750_000) break;
      totalBytes += size;
      embedded.push({ alt: image.alt, dataUrl });
    } catch {
      // Image retrieval is best-effort. The troubleshooting text remains usable.
    }
  }
  return embedded;
}

@Injectable()
export class WebGuidanceService {
  constructor(private readonly dependencies: Dependencies) {}

  private staff(user: AuthenticatedUser) {
    if (
      !user.roles.some((role) =>
        ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role),
      )
    )
      throw new ForbiddenException('Web guidance is for service-desk staff.');
  }

  status(user: AuthenticatedUser) {
    this.staff(user);
    const config = readConfig();
    return {
      enabled: config.WEB_GUIDANCE_ENABLED === 'true',
      provider: config.WEB_GUIDANCE_PROVIDER,
    };
  }

  async search(user: AuthenticatedUser, dto: WebGuidanceDto) {
    this.staff(user);
    const config = readConfig();
    if (config.WEB_GUIDANCE_ENABLED !== 'true')
      throw new ServiceUnavailableException('Web guidance is not configured.');

    const query = dto.query.trim();
    if (
      query.length < 3 ||
      /(?:https?:\/\/|\b[A-Z][A-Z0-9]{1,15}-\d{3,10}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b)/i.test(
        query,
      )
    )
      throw new BadRequestException(
        'Use a general troubleshooting prompt without ticket numbers, addresses, IPs, URLs, credentials, or personal data.',
      );

    const key = `web-guidance:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    let usage: number;
    try {
      usage = await this.dependencies.redis.incr(key);
      if (usage === 1) await this.dependencies.redis.expire(key, 86400);
    } catch {
      throw new ServiceUnavailableException(
        'Web guidance is temporarily unavailable.',
      );
    }
    if (usage > 20)
      throw new HttpException('Daily web guidance limit reached.', 429);

    try {
      let rawResults: SearchResult[];
      if (config.WEB_GUIDANCE_PROVIDER === 'brave') {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', '10');
        url.searchParams.set('extra_snippets', 'true');
        url.searchParams.set('safesearch', 'strict');
        const response = await fetch(url, {
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'X-Subscription-Token': config.BRAVE_SEARCH_API_KEY!,
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('provider');
        const body = (await response.json()) as {
          web?: { results?: SearchResult[] };
        };
        rawResults = Array.isArray(body.web?.results) ? body.web.results : [];
      } else {
        const url = new URL('http://searxng:8080/search');
        url.searchParams.set('q', query);
        url.searchParams.set('format', 'json');
        url.searchParams.set('safesearch', '2');
        url.searchParams.set('language', 'en-US');
        const response = await fetch(url, {
          redirect: 'error',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('provider');
        const body = (await response.json()) as {
          results?: Array<SearchResult & { content?: unknown }>;
        };
        rawResults = (Array.isArray(body.results) ? body.results : []).map(
          (item) => ({ ...item, description: item.content }),
        );
      }

      const seen = new Set<string>();
      const results = rawResults
        .flatMap((item) => {
          const href = approvedSource(item.url);
          if (!href || typeof item.title !== 'string' || seen.has(href))
            return [];
          seen.add(href);
          const snippets = [
            item.description,
            ...(Array.isArray(item.extra_snippets)
              ? item.extra_snippets.slice(0, 3)
              : []),
          ]
            .map((part) => excerpt(part))
            .filter(Boolean);
          return [
            {
              title: excerpt(item.title, 180),
              href,
              source: sourceName(href),
              excerpts: snippets,
            },
          ];
        })
        .slice(0, 10);

      const procedures = (
        await Promise.allSettled(
          results.slice(0, 5).map(async (result) => {
            if (!approvedSource(result.href)) return null;
            const page = await fetch(result.href, {
              redirect: 'error',
              headers: { accept: 'text/html,application/xhtml+xml' },
              signal: AbortSignal.timeout(7000),
            });
            const html = await readLimitedHtml(page);
            return html
              ? extractProcedure(
                  html,
                  result.title,
                  query,
                  result.href,
                  result.source,
                )
              : null;
          }),
        )
      )
        .flatMap((outcome) =>
          outcome.status === 'fulfilled' && outcome.value
            ? [outcome.value]
            : [],
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((procedure) => ({
          heading: procedure.heading,
          steps: procedure.steps,
          images: procedure.images,
          href: procedure.href,
          source: procedure.source,
        }));

      const enrichedProcedures = await Promise.all(
        procedures.map(async (procedure) => ({
          ...procedure,
          images: await embedProcedureImages(procedure.images),
        })),
      );

      return {
        results,
        procedures: enrichedProcedures,
        note: enrichedProcedures.length
          ? 'These troubleshooting steps were extracted and ranked from the most relevant search results for your prompt. Images are included when the source provides usable screenshots.'
          : 'No reliable troubleshooting procedure could be extracted from the returned pages. Open a source below for the full instructions or refine the troubleshooting prompt.',
      };
    } catch {
      throw new ServiceUnavailableException(
        'Documentation search is unavailable. Try again later.',
      );
    }
  }
}
