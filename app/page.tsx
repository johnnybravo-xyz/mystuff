import { requireArchiveUser } from './auth';
import { getInstallation } from './installation';
import { getArchive } from './wardrobe/server';
import { ArchiveApp } from './wardrobe/archive-app';
import { collections } from './wardrobe/model';
import type { OwnerFilter, Collection } from './wardrobe/model';
import type { View } from './wardrobe/components';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const installation = await getInstallation();
  const profileIds = installation.profiles.map((profile) => profile.id);
  const owner: OwnerFilter =
    typeof query.owner === 'string' &&
    (profileIds.includes(query.owner) || query.owner === 'unassigned') &&
    (query.owner !== 'unassigned' || query.view === 'manage')
      ? query.owner
      : 'all';
  const requestedCollection: Collection = collections.includes(
    query.collection as Collection,
  )
    ? (query.collection as Collection)
    : 'all';
  const collection: Collection =
    requestedCollection === 'all' ||
    installation.settings.enabledCollections.includes(requestedCollection)
      ? requestedCollection
      : 'all';
  const requestedView: View = [
    'wishlist',
    'inquiries',
    'settings',
    'outfits',
    'review',
    'export',
    'manage',
  ].includes(query.view as string)
    ? (query.view as View)
    : 'wardrobe';
  const view: View =
    (requestedView === 'wishlist' && !installation.settings.features.wishlist) ||
    (requestedView === 'outfits' && !installation.settings.features.outfits) ||
    (requestedView === 'inquiries' && !installation.settings.features.shop)
      ? 'wardrobe'
      : requestedView;
  const user = await requireArchiveUser(
    `/?view=${view}&owner=${owner}&collection=${collection}`,
  );
  const primaryProfile = installation.profiles[0]?.id || 'unassigned';
  return (
    <ArchiveApp
      initial={await getArchive(user.userId)}
      initialOwner={
        (view === 'outfits') && owner === 'all'
          ? primaryProfile
          : owner
      }
      initialView={view}
      initialCollection={collection}
      configuration={installation.settings}
      profiles={installation.profiles}
    />
  );
}
