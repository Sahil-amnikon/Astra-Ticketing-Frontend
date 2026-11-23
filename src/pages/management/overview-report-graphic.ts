import { breakdown } from './module-report-data';
import {
  overviewModules,
  overviewNumbers,
  overviewLifecycle,
  type OverviewReport,
} from './overview-report-data';

const escape = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const palette = ['#3563ef', '#8b5cf6', '#06a6a0', '#e96991'];
export function overviewGraphic(report: OverviewReport): string {
  const numbers = overviewNumbers(report);
  const total = numbers.reduce((sum, item) => sum + item.total, 0);
  const statuses = overviewModules.map((module) =>
    breakdown(report.modules[module.kind], 'status'),
  );
  const height =
    1080 + Math.max(1, ...statuses.map((rows) => rows.length)) * 36;
  const text = (
    x: number,
    y: number,
    value: unknown,
    size = 16,
    weight = 400,
    fill = '#172748',
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(value)}</text>`;
  function chart(
    x: number,
    y: number,
    width: number,
    title: string,
    rows: [string, number][],
    compact = false,
  ): string {
    const denominator = Math.max(1, ...rows.map(([, count]) => count));
    return (
      text(x, y, title, 21, 700) +
      rows
        .map(([name, count], index) => {
          const top = y + 35 + index * (compact ? 36 : 62);
          return (
            text(x, top, name.replaceAll('_', ' '), compact ? 13 : 15) +
            text(x + width - 70, top, count, 16, 700) +
            `<rect x="${x}" y="${top + 9}" width="${width - 80}" height="${compact ? 7 : 12}" rx="3" fill="#e8edf5"/><rect x="${x}" y="${top + 9}" width="${(count / denominator) * (width - 80)}" height="${compact ? 7 : 12}" rx="3" fill="${palette[index % palette.length]}"/>`
          );
        })
        .join('')
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${height}" viewBox="0 0 1280 ${height}" role="img" aria-label="ASTRA holistic overview with charts and numbers"><rect width="1280" height="${height}" fill="#f5f7fc"/><g font-family="Arial, sans-serif">
    ${text(48, 62, 'ASTRA | Holistic overview', 32, 700)}
    ${text(48, 98, `${report.filters.from} through ${report.filters.to} (UTC) | Created date`, 17)}
    ${text(48, 128, `Client: ${report.clientName}`, 16)}
    ${text(48, 156, `Generated: ${report.generatedAt}`, 14)}
    ${text(48, 184, `Search: ${report.filters.q || 'None'}`, 14)}
    <rect x="32" y="210" width="1216" height="115" rx="16" fill="#ffffff"/>
    ${[['Overall records', total], ...numbers.map((n) => [n.name, n.total])].map(([name, count], index) => text(54 + index * 300, 247, name, 16) + text(54 + index * 300, 296, count, 34, 700, palette[index])).join('')}
    <rect x="32" y="345" width="592" height="330" rx="16" fill="#ffffff"/><rect x="644" y="345" width="604" height="330" rx="16" fill="#ffffff"/>
    ${chart(
      54,
      382,
      546,
      'Records by module',
      numbers.map((n) => [n.name, n.total]),
    )}
    ${chart(666, 382, 560, 'Current lifecycle', overviewLifecycle(report))}
    ${text(48, 714, 'Overall numbers and attention indicators', 22, 700)}
    ${['Module', 'Total', 'Active', 'Resolved / completed', 'Cancelled / rejected', 'Failed / rolled back'].map((name, i) => text([48, 315, 415, 535, 785, 1035][i], 752, name, 13, 700)).join('')}
    ${numbers.map((n, i) => [n.name, n.total, n.active, n.completed, n.cancelled, n.failed].map((value, j) => text([48, 315, 415, 535, 785, 1035][j], 788 + i * 32, value, 15)).join('')).join('')}
    ${text(48, 898, numbers.map((n) => `${n.indicator}: ${n.attention}`).join('   |   '), 16, 700)}
    ${overviewModules.map((module, i) => chart(48 + i * 410, 944, 390, `${module.name} by status`, statuses[i], true)).join('')}
    ${text(48, height - 48, 'Status, owner, SLA and risk are current values for records created in the period. Linked records count in their own modules.', 13)}
    ${text(48, height - 24, 'Resolved / completed excludes cancelled, rejected, failed and rolled-back records. All three modules were collected in full.', 13)}
    </g></svg>`;
}
export function downloadOverviewFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadOverviewPng(report: OverviewReport) {
  const svg = overviewGraphic(report);
  // The application permits data images in its existing content security policy.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(
        new Error(
          'The graphical report could not be prepared. Retry or download SVG.',
        ),
      );
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width * 2;
  canvas.height = image.height * 2;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error(
      'Image downloads are unavailable in this browser. Download SVG instead.',
    );
  context.scale(2, 2);
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('The graphical download failed. Please retry.')),
      'image/png',
    ),
  );
  downloadOverviewFile(
    `astra-overview-${report.filters.from}-${report.filters.to}.png`,
    blob,
  );
}
