import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'TheTracker Console', template: '%s · TheTracker' },
  description: 'See your field team, visits and customers live.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#14122B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { fontSize: 14, borderRadius: 10, background: '#14122B', color: '#fff' } }} />
      </body>
    </html>
  );
}
