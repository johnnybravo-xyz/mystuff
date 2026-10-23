import type { ItemPrice } from './model';

export const priceBases = ['purchase', 'retail', 'estimate'] as const;
export const priceBasisLabels = {
  purchase: 'Purchase price',
  retail: 'Retail price',
  estimate: 'Estimated price',
};
export const maximumPrice = 1_000_000_000;

export function displayItemPrice(
  amount: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.ceil(amount));
}

export function displayUsdPrice(amount: number): string {
  return displayItemPrice(amount);
}

function validAmount(value: unknown) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximumPrice
  );
}

function validDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 50 ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)
  )
    return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
  );
}

function validSource(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function itemPriceError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Price must be a currency price record or null to clear it.';
  const price = value as Record<string, unknown>;
  if (
    !validAmount(price.amount) ||
    typeof price.currency !== 'string' ||
    !Intl.supportedValuesOf('currency').includes(price.currency)
  )
    return 'Price must use a supported currency and a finite amount from 0 to 1,000,000,000.';
  if (
    price.isLowerBound !== undefined &&
    typeof price.isLowerBound !== 'boolean'
  )
    return 'Price isLowerBound must be true or false.';
  if (!priceBases.includes(price.basis as ItemPrice['basis']))
    return 'Choose purchase, retail, or estimate as the price basis.';
  if (!validDate(price.checkedAt))
    return 'Price needs a valid checked date (YYYY-MM-DD or an ISO UTC timestamp).';
  for (const field of ['sourceUrl', 'exchangeRateSourceUrl'])
    if (price[field] !== undefined && !validSource(price[field]))
      return 'Price sources must be valid HTTPS URLs without credentials.';
  if (
    price.notes !== undefined &&
    (typeof price.notes !== 'string' || price.notes.length > 1500)
  )
    return 'Price notes must be text up to 1,500 characters.';
  if (price.originalAmount !== undefined && !validAmount(price.originalAmount))
    return 'The original price must be a finite amount from 0 to 1,000,000,000.';
  if (
    price.originalCurrency !== undefined &&
    (typeof price.originalCurrency !== 'string' ||
      !Intl.supportedValuesOf('currency').includes(price.originalCurrency))
  )
    return 'The original price currency must be a supported uppercase currency code.';
  if (
    price.exchangeRate !== undefined &&
    (!validAmount(price.exchangeRate) || price.exchangeRate === 0)
  )
    return 'The exchange rate must be a positive finite number up to 1,000,000,000.';
  if (
    price.exchangeRateDate !== undefined &&
    !validDate(price.exchangeRateDate)
  )
    return 'The exchange-rate date is invalid.';
  return null;
}

export type PriceDraft = {
  amount: string;
  isLowerBound: boolean;
  basis: ItemPrice['basis'];
  sourceUrl: string;
  notes: string;
};

export function editedItemPrice(
  original: ItemPrice | null | undefined,
  draft: PriceDraft,
  checkedAt: string,
  currency = original?.currency || 'USD',
): ItemPrice | null {
  if (!draft.amount.trim()) return null;
  const amount = Number(draft.amount);
  // An amount change invalidates the old currency conversion provenance.
  const price: ItemPrice = {
    ...(original?.amount === amount ? original : {}),
    amount,
    currency,
    basis: draft.basis,
    checkedAt,
  };
  if (draft.isLowerBound) price.isLowerBound = true;
  else delete price.isLowerBound;
  if (draft.sourceUrl.trim()) price.sourceUrl = draft.sourceUrl.trim();
  else delete price.sourceUrl;
  if (draft.notes.trim()) price.notes = draft.notes.trim();
  else delete price.notes;
  const error = itemPriceError(price);
  if (error) throw new Error(error);
  return price;
}
