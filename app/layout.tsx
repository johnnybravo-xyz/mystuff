import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getInstallation } from './installation';
import { siteOrigin } from './wardrobe/metadata';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getInstallation();
  const origin = siteOrigin();
  const images = origin
    ? [{ url: `${origin}/og.svg`, width: 1200, height: 630, alt: `${settings.title} — ${settings.subtitle}` }]
    : [];
  return {
    title: settings.title,
    description: settings.subtitle,
    robots: { index: false, follow: false },
    icons: { icon: '/favicon.svg' },
    openGraph: { title: settings.title, description: settings.subtitle, images, type: 'website' },
    twitter: { card: 'summary_large_image', title: settings.title, description: settings.subtitle, images },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { settings } = await getInstallation();
  return (
    <html lang={settings.locale.split('-')[0]}>
      <body>{children}</body>
    </html>
  );
}
