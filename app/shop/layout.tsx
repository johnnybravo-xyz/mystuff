/* eslint-disable next/no-html-link-for-pages -- Native navigation avoids the Vinext Link click-handler failure. */
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getInstallation } from '../installation';
import { ArchiveBrand } from '../wardrobe/archive-brand';
import './shop.css';

export async function generateMetadata() {
  const { settings } = await getInstallation();
  return {
    title: { default: `Shop · ${settings.title}`, template: `%s · ${settings.title} shop` },
    description: settings.shop.introduction,
    robots: { index: false, follow: false },
  };
}

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const { settings } = await getInstallation();
  if (!settings.features.shop) notFound();
  return (
    <div className="shop-shell">
      <header className="shop-header">
        <ArchiveBrand title={settings.title} subtitle={settings.subtitle} />
        <a className="shop-nav" href="/shop">The shop</a>
      </header>
      <main>{children}</main>
      <footer className="shop-footer">
        {settings.shop.introduction} <span>{settings.shop.privacyCopy}</span>
      </footer>
    </div>
  );
}
