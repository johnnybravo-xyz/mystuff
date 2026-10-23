import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArchiveUser, requireArchiveUser } from '@/app/auth';
import { getInstallation } from '@/app/installation';
import { getArchive } from '@/app/wardrobe/server';
import { PieceOverview } from '@/app/wardrobe/piece-overview';
import { pieceMetadata } from '@/app/wardrobe/metadata';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getArchiveUser();
  if (!user)
    return {
      title: 'Private item | My Stuff',
      openGraph: { images: [] },
      twitter: { images: [] },
    };
  const { id } = await params;
  const archive = await getArchive(user.userId);
  const installation = await getInstallation();
  const item = archive.items.find((piece) => piece.id === id);
  return item
    ? pieceMetadata(item, installation.settings.title)
    : {
        title: 'Item not found | My Stuff',
        openGraph: { images: [] },
        twitter: { images: [] },
      };
}
export default async function PiecePage({ params }: Props) {
  const { id } = await params;
  return <ProtectedPiece id={id} />;
}
async function ProtectedPiece({ id }: { id: string }) {
  const user = await requireArchiveUser(`/pieces/${id}`);
  const archive = await getArchive(user.userId);
  if (!archive.items.some((item) => item.id === id)) notFound();
  const installation = await getInstallation();
  return (
    <PieceOverview
      initial={archive}
      itemId={id}
      configuration={installation.settings}
      profiles={installation.profiles}
    />
  );
}
