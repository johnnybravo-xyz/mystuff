'use client';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import Image from 'next/image';
import type { ItemSale, WardrobeItem } from './model';
import {
  availableSalePhotoIds,
  emptySale,
  shopCurrencies,
  shopCurrencyDigits,
  shopPrice,
} from './shop-model';
import type { ShopInquiry } from './shop-model';
import styles from './shop-seller.module.css';

async function fetchInquiries(
  offset: number,
): Promise<{ inquiries: ShopInquiry[]; total: number }> {
  const response = await fetch(`/api/shop/inquiries?offset=${offset}`, {
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Inquiries could not be loaded.');
  return result;
}

export function SaleEditor({
  item,
  onChange,
  initialOpen = false,
  summaryRef,
  defaultCurrency = 'USD',
}: {
  item: Partial<WardrobeItem>;
  onChange: (sale: ItemSale) => void;
  initialOpen?: boolean;
  summaryRef?: RefObject<HTMLElement | null>;
  defaultCurrency?: string;
}) {
  const sale = item.sale || { ...emptySale(), currency: defaultCurrency };
  const currency = sale.currency ?? 'USD';
  const priceStep = 10 ** -shopCurrencyDigits(currency);
  const photos = availableSalePhotoIds({
    imageId: item.imageId || null,
    photos: item.photos,
    facts: item.facts,
  });
  const set = (patch: Partial<ItemSale>) =>
    onChange({
      ...sale,
      photoIds: sale.photoIds.filter((id) => photos.includes(id)),
      ...patch,
    });
  return (
    <details
      className={styles.editor}
      open={initialOpen || Boolean(sale.published)}
    >
      <summary ref={summaryRef} className="scroll-mt-6">
        Sell this item{' '}
        <span>{sale.published ? 'Public listing' : 'Private'}</span>
      </summary>
      <div className={styles.editorBody}>
        <p>
          Choose what to share in{' '}
          <a href="/shop" target="_blank" rel="noreferrer">
            the public shop ↗
          </a>
          . Only the name, brand, category, colour, size and the listing details
          below are shown.
        </p>
        <label>
          Asking currency
          <select
            value={currency}
            onChange={(event) => set({ currency: event.target.value })}
          >
            {shopCurrencies.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asking price ({currency})
          <input
            type="number"
            value={sale.askingPrice ?? ''}
            min={priceStep}
            max="1000000000"
            step={priceStep}
            placeholder="Leave blank to ask for price"
            onChange={(event) =>
              set({
                askingPrice:
                  event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <p className={styles.hint}>
          Enter the asking price in {currency}. Changing currency keeps the
          entered amount.
        </p>
        <label>
          Public description
          <textarea
            rows={4}
            value={sale.description}
            maxLength={3000}
            placeholder="Condition, what is included, and how you would like to arrange pickup or delivery."
            onChange={(event) => set({ description: event.target.value })}
          />
        </label>
        <div>
          <p className={styles.label}>
            Public photos · {sale.photoIds.length} selected
          </p>
          <p className={styles.hint}>
            Choose the photos buyers can see. Your first selection is the cover.
          </p>
          {photos.length ? (
            <div className={styles.photoGrid}>
              {photos.map((id) => {
                const index = sale.photoIds.indexOf(id);
                return (
                  <div key={id} className={styles.photoChoice}>
                    <label className={index >= 0 ? styles.selected : ''}>
                      <Image
                        unoptimized
                        width={240}
                        height={320}
                        src={`/api/images/${encodeURIComponent(id)}`}
                        alt=""
                        loading="lazy"
                      />
                      <input
                        type="checkbox"
                        aria-label={`Share ${item.name || 'item'}, view ${photos.indexOf(id) + 1}`}
                        checked={index >= 0}
                        onChange={(event) => {
                          const photoIds = event.target.checked
                            ? [...sale.photoIds, id]
                            : sale.photoIds.filter((value) => value !== id);
                          set({
                            photoIds,
                            published: sale.published && photoIds.length > 0,
                          });
                        }}
                      />
                      <span>
                        {index === 0
                          ? 'Cover'
                          : index >= 0
                            ? 'Selected'
                            : 'Private'}
                      </span>
                    </label>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          set({
                            photoIds: [
                              id,
                              ...sale.photoIds.filter((value) => value !== id),
                            ],
                          })
                        }
                      >
                        Make cover
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.hint}>
              Add and save a photo before publishing.
            </p>
          )}
        </div>
        <label className={styles.publish}>
          <input
            type="checkbox"
            checked={sale.published}
            disabled={item.status !== 'owned' || !sale.photoIds.length}
            onChange={(event) => set({ published: event.target.checked })}
          />
          Publish in the shop
        </label>
        <p className={styles.hint}>
          {item.status !== 'owned'
            ? 'Only owned items can be listed.'
            : sale.published
              ? `Save this item to publish it at ${shopPrice(sale.askingPrice, currency)}${sale.askingPrice === null ? '' : ` ${currency}`}.`
              : 'This item stays private until you select Publish and save.'}{' '}
          The asking price is separate from your private item value.
        </p>
      </div>
    </details>
  );
}

export function InquiryPanel() {
  const [inquiries, setInquiries] = useState<ShopInquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  function load(offset = 0) {
    return fetchInquiries(offset)
      .then((result) => {
        setInquiries((previous) =>
          offset
            ? [...previous, ...result.inquiries].filter(
                (entry, index, all) =>
                  all.findIndex((other) => other.id === entry.id) === index,
              )
            : result.inquiries,
        );
        setTotal(result.total);
      })
      .catch((failure) => {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Inquiries could not be loaded.',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }
  useEffect(() => {
    void load();
  }, []);
  function requestLoad(offset = 0) {
    setLoading(true);
    setError('');
    void load(offset);
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this inquiry and its contact details?')) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/shop/inquiries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'The inquiry could not be deleted.');
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The inquiry could not be deleted.',
      );
      setLoading(false);
    }
  }
  return (
    <section className={styles.inquiries}>
      <div className={styles.heading}>
        <p>
          {total} {total === 1 ? 'inquiry' : 'inquiries'} · Contact details are
          private.
        </p>
        <a href="/shop" target="_blank" rel="noreferrer">
          Open public shop ↗
        </a>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}{' '}
          <button type="button" onClick={() => requestLoad()}>
            Try again
          </button>
        </p>
      )}
      {!loading && !inquiries.length && !error && (
        <div className={styles.empty}>
          <h2>No inquiries yet.</h2>
          <p>
            Edit an owned item, open “Sell this item”, choose its public photos
            and publish it.
          </p>
        </div>
      )}
      <div className={styles.inquiryList}>
        {inquiries.map((inquiry) => (
          <article key={inquiry.id}>
            <div className={styles.inquiryHeading}>
              <a href={`/pieces/${encodeURIComponent(inquiry.itemId)}`}>
                {inquiry.itemName}
              </a>
              <time dateTime={inquiry.createdAt}>
                {new Date(inquiry.createdAt).toLocaleString()}
              </time>
            </div>
            <h2>{inquiry.name}</h2>
            <p className={styles.contact}>{inquiry.contact}</p>
            {inquiry.comment && (
              <p className={styles.comment}>{inquiry.comment}</p>
            )}
            <button
              type="button"
              onClick={() => void remove(inquiry.id)}
              disabled={loading}
            >
              Delete inquiry
            </button>
          </article>
        ))}
      </div>
      {loading && <output>Loading inquiries…</output>}
      {!loading && inquiries.length < total && (
        <button
          type="button"
          className={styles.more}
          onClick={() => requestLoad(inquiries.length)}
        >
          Load more inquiries
        </button>
      )}
    </section>
  );
}
