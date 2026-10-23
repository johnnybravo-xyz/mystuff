/* eslint-disable next/no-html-link-for-pages -- Native navigation avoids the Vinext Link click-handler failure. */
import { notFound } from 'vinext/shims/navigation-errors';
import { getInstallation } from '@/app/installation';
import { getShopListing } from '../../wardrobe/shop-server';
import { shopPrice } from '../../wardrobe/shop-model';
import { categoryLabels } from '../../wardrobe/model';
import type { Category } from '../../wardrobe/model';
import { ShopContactForm, ShopGallery } from '../shop-detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getInstallation()).settings.features.shop) return { title: 'Shop unavailable' };
  const item = await getShopListing(id);
  return {
    title: item?.name || 'Listing unavailable',
    description: item
      ? 'View this listing and contact the owner.'
      : 'This listing is unavailable.',
  };
}
export default async function ShopItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getInstallation()).settings.features.shop) notFound();
  const item = await getShopListing(id);
  if (!item) notFound();
  return (
    <>
      <a className="shop-back" href="/shop">
        ← Back to the shop
      </a>
      <div className="shop-detail">
        <ShopGallery item={item} />
        <section className="shop-detail-copy">
          <p className="eyebrow">
            {item.brand ||
              categoryLabels[item.category as Category] ||
              item.category}
          </p>
          <h1>{item.name}</h1>
          <p className="shop-price">
            {shopPrice(item.askingPrice, item.currency)}
            {item.askingPrice !== null && <span>{item.currency}</span>}
          </p>
          <dl className="shop-facts">
            {item.colour && (
              <div>
                <dt>Colour</dt>
                <dd>{item.colour}</dd>
              </div>
            )}
            {item.size && (
              <div>
                <dt>Size</dt>
                <dd>{item.size}</dd>
              </div>
            )}
          </dl>
          {item.description && (
            <p className="shop-description">{item.description}</p>
          )}
          <ShopContactForm itemId={item.id} />
        </section>
      </div>
    </>
  );
}
