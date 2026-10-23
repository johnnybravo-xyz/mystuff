/* eslint-disable next/no-html-link-for-pages -- Native navigation avoids the Vinext Link click-handler failure. */
import { ArrowUpRight, PackageOpen } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getInstallation } from '../installation';
import Image from 'next/image';
import { getShopListings } from '../wardrobe/shop-server';
import { shopPhotoUrl, shopPrice } from '../wardrobe/shop-model';
import { categoryLabels } from '../wardrobe/model';
import type { Category } from '../wardrobe/model';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ShopPage() {
  const { settings } = await getInstallation();
  if (!settings.features.shop) notFound();
  const items = await getShopListings();
  return (
    <>
      <section className="shop-intro">
        <p className="eyebrow">MY STUFF / THE SHOP</p>
        <h1>{settings.shop.title}</h1>
        <p>{settings.shop.introduction}</p>
      </section>
      <div className="shop-section-heading">
        <h2>Available things</h2>
        <span>
          {items.length} {items.length === 1 ? 'listing' : 'listings'}
        </span>
      </div>
      {items.length ? (
        <div className="shop-grid">
          {items.map((item) => (
            <a
              className="shop-card"
              href={`/shop/${encodeURIComponent(item.id)}`}
              key={item.id}
            >
              <div className="shop-card-photo">
                <Image
                  unoptimized
                  width={600}
                  height={800}
                  src={shopPhotoUrl(item.id, item.photoIds[0])}
                  alt={item.name}
                  loading="lazy"
                />
                <span className="shop-card-arrow">
                  <ArrowUpRight size={19} />
                </span>
              </div>
              <div className="shop-card-meta">
                <span>
                  {item.brand ||
                    categoryLabels[item.category as Category] ||
                    item.category}
                </span>
                <span>
                  {shopPrice(item.askingPrice, item.currency)}
                  {item.askingPrice !== null && <> {item.currency}</>}
                </span>
              </div>
              <h3>{item.name}</h3>
              <p>{[item.colour, item.size].filter(Boolean).join(' · ')}</p>
              <span className="shop-card-action">View details & leave a comment</span>
            </a>
          ))}
        </div>
      ) : (
        <section className="shop-empty">
          <PackageOpen size={40} />
          <h2>Nothing for sale just yet.</h2>
          <p>When something is ready for a new home, it will appear here.</p>
        </section>
      )}
    </>
  );
}
