import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import PreviewWorkspace from '../../src/pages/Preview/PreviewWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ASTRA | SPARK UI preview',
  robots: { index: false, follow: false },
};
export default function PreviewPage() {
  if (process.env.ASTRA_UI_PREVIEW !== '1') notFound();
  return (
    <Suspense fallback={<p role="status">Loading workspace preview…</p>}>
      <PreviewWorkspace />
    </Suspense>
  );
}
