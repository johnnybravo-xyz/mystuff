import type { Metadata } from 'next';
import { notFound } from 'vinext/shims/navigation-errors';
import { getArchiveUser, requireArchiveUser } from '@/app/auth';
import { getInstallation } from '@/app/installation';
import { getArchive } from '@/app/wardrobe/server';
import { GroupOverview } from '@/app/wardrobe/group-overview';
import { groupPath } from '@/app/wardrobe/group-model';
import { collections } from '@/app/wardrobe/model';
import type { Collection, OwnerFilter } from '@/app/wardrobe/model';
import type { GroupView } from '@/app/wardrobe/group-model';

export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getArchiveUser();
  if (!user)
    return {
      title: 'Private group | My Stuff',
      openGraph: { images: [] },
      twitter: { images: [] },
    };
  const { id } = await params;
  const installation = await getInstallation();
  const group = (await getArchive(user.userId)).groups.find(
    (entry) => entry.id === id,
  );
  return {
    title: `${group?.name || 'Group not found'} | ${installation.settings.title}`,
    openGraph: { images: [] },
    twitter: { images: [] },
  };
}
export default async function GroupPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const installation = await getInstallation();
  const profileIds = installation.profiles.map((profile) => profile.id);
  const view: GroupView =
    query.view === 'wishlist' || query.view === 'archived'
      ? query.view
      : 'owned';
  const owner: OwnerFilter =
    typeof query.owner === 'string' &&
    profileIds.includes(query.owner) &&
    query.owner !== 'unassigned'
      ? (query.owner as OwnerFilter)
      : 'all';
  const collection: Collection = collections.includes(
    query.collection as Collection,
  )
    ? (query.collection as Collection)
    : 'all';
  const user = await requireArchiveUser(groupPath(id, view, owner, collection));
  const archive = await getArchive(user.userId);
  if (!archive.groups.some((group) => group.id === id)) notFound();
  return (
    <GroupOverview
      key={`${id}:${view}:${owner}:${collection}`}
      initial={archive}
      groupId={id}
      initialView={view}
      initialOwner={owner}
      initialCollection={collection}
      configuration={installation.settings}
      profiles={installation.profiles}
    />
  );
}
