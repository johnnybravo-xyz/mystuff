import { redirect } from 'next/navigation';
import {
  ensureSetupClaim,
  publicShopOrigin,
  setupRequired,
} from '@/app/installation';
import { SetupWizard } from './setup-wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up My Stuff' };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await setupRequired())) redirect('/');
  await ensureSetupClaim();
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : '';
  return <SetupWizard initialToken={token} shopOrigin={publicShopOrigin()} />;
}
