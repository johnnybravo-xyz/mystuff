'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { displayItemPrice, priceBasisLabels } from './item-price';
import type { ItemPrice } from './model';

export function PiecePrice({
  price,
  blurPrices,
  locale = 'en-US',
}: {
  price?: ItemPrice | null;
  blurPrices: boolean;
  locale?: string;
}) {
  const [hiddenOverride, setHiddenOverride] = useState<boolean | null>(null);
  const hidden = hiddenOverride ?? blurPrices;
  return (
    <section className="piece-price" aria-label="Item price">
      <h2>Price</h2>
      {price ? (
        <>
          <div className="price-value-row">
            <span
              className={`price-amount${hidden ? ' price-concealed' : ''}`}
              aria-hidden={hidden ? true : undefined}
            >
              {price.isLowerBound ? 'Over ' : ''}
              {displayItemPrice(price.amount, price.currency, locale)}
              <small> {price.currency}</small>
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={hidden ? 'Reveal price' : 'Hide price'}
              aria-pressed={!hidden}
              onClick={() => setHiddenOverride(!hidden)}
            >
              {hidden ? <Eye /> : <EyeOff />}
              {hidden ? 'Reveal price' : 'Hide price'}
            </Button>
          </div>
          <p className="price-caption">
            {priceBasisLabels[price.basis]}
            {price.isLowerBound ? ' lower bound' : ''} · Checked{' '}
            {price.checkedAt.slice(0, 10)}
          </p>
          {!hidden && (
            <div className="price-provenance">
              {price.sourceUrl && (
                <a
                  className="retailer-link"
                  href={price.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Price source
                </a>
              )}
              {price.originalCurrency &&
                price.originalCurrency !== price.currency && (
                  <p>
                    Converted from {price.originalCurrency}
                    {price.exchangeRateDate
                      ? ` · Rate checked ${price.exchangeRateDate.slice(0, 10)}`
                      : ''}
                    {price.exchangeRateSourceUrl && (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          href={price.exchangeRateSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Exchange-rate source
                        </a>
                      </>
                    )}
                  </p>
                )}
              {price.notes && <p>{price.notes}</p>}
            </div>
          )}
        </>
      ) : (
        <p className="price-caption">
          No price recorded. Add one in Edit details.
        </p>
      )}
    </section>
  );
}
