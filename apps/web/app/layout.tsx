import type { Metadata } from 'next';
import './globals.css';
import './corporate-workspace.css';
import './astra-workspace.css';
export const metadata: Metadata = {
  title: 'ASTRA | Ticketing System',
  description: 'ASTRA IT service management and ticketing workspace',
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
