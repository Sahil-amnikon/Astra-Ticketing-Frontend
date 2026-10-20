import * as cheerio from 'cheerio';

export type ProcedureImageRef = {
  src: string;
  alt: string;
};

export type Procedure = {
  heading: string;
  steps: string[];
  images: ProcedureImageRef[];
  href: string;
  source: string;
  score: number;
};

function words(value: string) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(
    (word) =>
      ![
        'the',
        'and',
        'for',
        'with',
        'issue',
        'steps',
        'troubleshooting',
        'cannot',
        'from',
      ].includes(word),
  );
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

type ImageNode = {
  attribs?: Record<string, string | undefined>;
};

function imageSrc(image: ImageNode, baseHref: string): string | null {
  const candidates = [
    image.attribs?.src,
    image.attribs?.['data-src'],
    image.attribs?.['data-lazy-src'],
  ];
  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith('data:')) continue;
    try {
      const resolved = new URL(candidate, baseHref);
      if (resolved.protocol === 'https:') return resolved.href;
    } catch {
      // Ignore malformed image references.
    }
  }
  return null;
}

function isUsefulImage(image: ImageNode, baseHref: string): boolean {
  const src = imageSrc(image, baseHref);
  if (!src) return false;
  const type = `${image.attribs?.class ?? ''} ${image.attribs?.id ?? ''} ${image.attribs?.role ?? ''}`.toLowerCase();
  if (/logo|icon|avatar|sprite|social|tracking|badge|button/.test(type)) return false;
  const width = Number.parseInt(image.attribs?.width ?? '', 10);
  const height = Number.parseInt(image.attribs?.height ?? '', 10);
  if (
    (Number.isFinite(width) && width > 0 && width < 140) ||
    (Number.isFinite(height) && height > 0 && height < 100)
  )
    return false;
  return /\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(src);
}


// Extract a short, ordered procedure from the publisher's HTML. Never combine
// separate articles into one sequence or infer a step absent from the source.
export function extractProcedure(
  html: string,
  title: string,
  query: string,
  href: string,
  source: string,
): Procedure | null {
  const $ = cheerio.load(html);
  const main = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('[role="main"]').first();
  if (!main.length) return null;
  main.find('script,style,nav,footer,header,aside,form').remove();
  const tokens = words(query);
  const titleText = clean(title).toLowerCase();
  let best: Procedure | null = null;
  main.find('ol,ul').each((_, list) => {
    const items = $(list).children('li');
    if (items.length < 2 || items.length > 20) return;
    const steps = items
      .toArray()
      .map((item) => {
        const clone = $(item).clone();
        clone.find('ol,ul,script,style').remove();
        return clean(clone.text()).slice(0, 220);
      })
      .filter((step) => step.length >= 12 && step.length <= 220);
    if (steps.length < 2) return;
    const sectionHeading = clean(
      $(list).prevAll('h2,h3,h4').first().text() ||
        $(list).parent().prevAll('h2,h3,h4').first().text(),
    ).slice(0, 160);
    const heading =
      sectionHeading ||
      clean(main.find('h1').first().text() || title).slice(0, 160);
    if (
      /^(related|see also|in this article|contents|references|applies to)/i.test(
        heading,
      )
    )
      return;
    const stepText = steps.join(' ').toLowerCase();
    if (
      !tokens.some((token) =>
        `${sectionHeading.toLowerCase()} ${stepText}`.includes(token),
      )
    )
      return;
    const score =
      tokens.reduce(
        (sum, token) =>
          sum +
          (heading.toLowerCase().includes(token) ? 4 : 0) +
          (titleText.includes(token) ? 2 : 0) +
          (stepText.includes(token) ? 1 : 0),
        0,
      ) +
      (/troubleshoot|resolve|fix|solution|check|diagnos/i.test(heading)
        ? 2
        : 0) +
      (list.name === 'ol' ? 2 : 0);
    if (score < 6) return;
    const images: ProcedureImageRef[] = [];
    main.find('img').each((_, image) => {
      if (!isUsefulImage(image, href)) return;
      const src = imageSrc(image, href);
      if (!src || images.some((candidate) => candidate.src === src)) return;
      const alt = clean($(image).attr('alt') ?? '');
      const caption = clean($(image).closest('figure').find('figcaption').first().text());
      const imageText = `${alt} ${caption} ${src}`.toLowerCase();
      const insideSelectedList = $(image).parents().toArray().some((parent) => parent === list);
      const relevance = insideSelectedList
        ? 10
        : tokens.reduce((sum, token) => sum + (imageText.includes(token) ? 2 : 0), 0);
      if (!insideSelectedList && relevance === 0) return;
      images.push({ src, alt: alt || caption });
    });

    const candidate = {
      heading,
      steps: steps.slice(0, 5),
      images: images.slice(0, 4),
      href,
      source,
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  });
  return best;
}

export async function readLimitedHtml(
  response: Response,
): Promise<string | null> {
  if (
    !response.ok ||
    !response.headers.get('content-type')?.toLowerCase().includes('text/html')
  )
    return null;
  if (Number(response.headers.get('content-length') ?? 0) > 1_500_000)
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
      if (total > 1_500_000) return null;
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
