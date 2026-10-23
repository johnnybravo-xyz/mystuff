import type { ItemSale, WardrobeItem } from './model';

export const shopCurrencies = [
  { value: 'USD', label: 'USD — US dollar', fractionDigits: 2 },
  { value: 'INR', label: 'INR — Indian rupee', fractionDigits: 2 },
  { value: 'EUR', label: 'EUR — Euro', fractionDigits: 2 },
  { value: 'GBP', label: 'GBP — British pound', fractionDigits: 2 },
  { value: 'AED', label: 'AED — UAE dirham', fractionDigits: 2 },
  { value: 'SGD', label: 'SGD — Singapore dollar', fractionDigits: 2 },
  { value: 'AUD', label: 'AUD — Australian dollar', fractionDigits: 2 },
  { value: 'CAD', label: 'CAD — Canadian dollar', fractionDigits: 2 },
  { value: 'CHF', label: 'CHF — Swiss franc', fractionDigits: 2 },
  { value: 'JPY', label: 'JPY — Japanese yen', fractionDigits: 0 },
] as const;

export function shopCurrencyDigits(currency: string): number {
  const option = shopCurrencies.find((value) => value.value === currency);
  if (!option)
    throw new RangeError('Choose a supported asking-price currency.');
  return option.fractionDigits;
}

type SaleItem = Pick<WardrobeItem, 'status' | 'imageId' | 'photos'> &
  Partial<Pick<WardrobeItem, 'facts'>>;
export type ShopListing = {
  id: string;
  name: string;
  brand: string;
  category: string;
  colour: string;
  size: string;
  description: string;
  askingPrice: number | null;
  currency: string;
  photoIds: string[];
};
export type ShopInquiry = {
  id: string;
  itemId: string;
  itemName: string;
  name: string;
  contact: string;
  comment: string;
  createdAt: string;
};
export const emptySale = (): ItemSale => ({
  published: false,
  askingPrice: null,
  currency: 'USD',
  description: '',
  photoIds: [],
});
export function availableSalePhotoIds(
  item: Pick<WardrobeItem, 'imageId' | 'photos'> &
    Partial<Pick<WardrobeItem, 'facts'>>,
) {
  return [
    ...new Set(
      [
        item.imageId,
        ...(item.facts?.photos || []).map((photo) => photo.imageId),
        ...(item.photos || []).map((photo) => photo.imageId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
export function validateSale(value: unknown, item: SaleItem): string | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Enter valid shop listing details.';
  const sale = value as ItemSale;
  if (typeof sale.published !== 'boolean')
    return 'Choose whether to publish this listing.';
  const currency = sale.currency === undefined ? 'USD' : sale.currency;
  if (!shopCurrencies.some((option) => option.value === currency))
    return 'Choose a supported asking-price currency.';
  const digits = shopCurrencyDigits(currency);
  if (
    sale.askingPrice !== null &&
    (typeof sale.askingPrice !== 'number' ||
      !Number.isFinite(sale.askingPrice) ||
      sale.askingPrice <= 0 ||
      sale.askingPrice > 1_000_000_000 ||
      (digits === 0
        ? !Number.isInteger(sale.askingPrice)
        : Math.abs(
            sale.askingPrice * 100 - Math.round(sale.askingPrice * 100),
          ) > 0.0001))
  )
    return `Enter a positive asking price in ${currency} ${digits === 0 ? 'as a whole number' : 'with at most two decimal places'}, or leave it blank.`;
  if (typeof sale.description !== 'string' || sale.description.length > 3000)
    return 'Keep the public description within 3,000 characters.';
  const available = new Set(availableSalePhotoIds(item));
  if (
    !Array.isArray(sale.photoIds) ||
    sale.photoIds.length > 20 ||
    sale.photoIds.some((id) => typeof id !== 'string' || !available.has(id)) ||
    new Set(sale.photoIds).size !== sale.photoIds.length
  )
    return 'Choose up to 20 different photos attached to this item.';
  if (sale.published && item.status !== 'owned')
    return 'Only owned items can be published in the shop.';
  if (sale.published && !sale.photoIds.length)
    return 'Choose at least one public photo before publishing.';
  return null;
}

// This is the only item representation sent to public routes or their client components.
export function publicListing(item: WardrobeItem): ShopListing | null {
  if (
    item.status !== 'owned' ||
    item.sale?.published !== true ||
    ['returned', 'cancelled', 'in_transit'].includes(
      item.facts?.fulfillment || '',
    ) ||
    validateSale(item.sale, item)
  )
    return null;
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    colour: item.colour,
    size: item.size,
    description: item.sale.description,
    askingPrice: item.sale.askingPrice,
    currency: item.sale.currency ?? 'USD',
    photoIds: [...item.sale.photoIds],
  };
}

export function shopPrice(amount: number | null, currency = 'USD'): string {
  if (amount === null) return 'Ask for price';
  shopCurrencyDigits(currency);
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.ceil(amount));
}
export function shopPhotoUrl(itemId: string, imageId: string) {
  return `/shop/images/${encodeURIComponent(itemId)}/${encodeURIComponent(imageId)}`;
}

export type InquiryInput = {
  itemId: string;
  name: string;
  contact: string;
  comment: string;
  website: string;
};
export function validateInquiry(value: unknown): InquiryInput | string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Enter your name and contact details.';
  const input = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof input[key] === 'string' ? input[key].trim() : '';
  const result = {
    itemId: text('itemId'),
    name: text('name'),
    contact: text('contact'),
    comment: text('comment'),
    website: text('website'),
  };
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(result.itemId))
    return 'This listing is unavailable.';
  const hasControl = (text: string, allowWhitespace = false) =>
    text
      .split('')
      .some(
        (character) =>
          (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
          !(allowWhitespace && ['\n', '\r', '\t'].includes(character)),
      );
  if (
    result.name.length < 1 ||
    result.name.length > 100 ||
    hasControl(result.name)
  )
    return 'Enter a name of up to 100 characters.';
  if (
    result.contact.length > 200 ||
    hasControl(result.contact) ||
    !(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contact) ||
      (/^[+\d\s().-]{7,40}$/.test(result.contact) &&
        result.contact.replace(/\D/g, '').length >= 7)
    )
  )
    return 'Enter a valid email address or phone number.';
  if (result.comment.length > 1000 || hasControl(result.comment, true))
    return 'Keep your comment within 1,000 characters.';
  if (result.website.length > 200) return 'The request is invalid.';
  return result;
}
