import type { Metadata } from 'next';
import { categoryLabels, coverPhotos, isClothing } from './model';
import type { WardrobeItem } from './model';

export function siteOrigin(): string | undefined {
  const value =
    process.env.ARCHIVE_PUBLIC_URL ||
    (process.env.NODE_ENV !== 'production'
      ? 'http://localhost:3000'
      : undefined);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      return url.origin;
  } catch {}
  return undefined;
}

export function pieceMetadata(
  item: WardrobeItem,
  installationTitle = 'My Stuff',
): Metadata {
  const title = `${item.name} · ${item.brand} | ${installationTitle}`;
  const description = (
    item.category === 'fragrance'
      ? [
          item.brand,
          item.fragrance?.concentration || 'Edition to confirm',
          item.fragrance?.family,
          `Bottle size ${item.size || 'to confirm'}`,
        ]
      : isClothing(item)
        ? [
            item.brand,
            item.colour || 'Colour to confirm',
            `Size ${item.size || 'to confirm'}`,
            item.fit,
          ]
        : [
            item.brand,
            categoryLabels[item.category],
            item.colour === 'unknown' ? '' : item.colour,
            item.size,
            ...(item.details || [])
              .slice(0, 2)
              .map((detail) => `${detail.label}: ${detail.value}`),
          ]
  )
    .filter(Boolean)
    .join(' · ');
  const origin = siteOrigin();
  const imageId = coverPhotos(item)[0]?.imageId;
  const images =
    origin && imageId
      ? [{ url: `${origin}/api/images/${imageId}`, alt: item.name }]
      : [];
  return {
    title,
    description,
    openGraph: { title, description, images },
    twitter: {
      card: images.length ? 'summary_large_image' : 'summary',
      title,
      description,
      images,
    },
  };
}
