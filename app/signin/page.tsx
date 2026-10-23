import { LockKeyhole } from 'lucide-react';
import {
    authConfiguration,
    authMode,
    getArchiveUser,
    oidcConfiguration,
    safeReturnPath,
    signInDestination,
} from '@/app/auth';
import { redirect } from 'next/navigation';
import { getInstallation } from '@/app/installation';
import { ArchiveBrand } from '@/app/wardrobe/archive-brand';
import { SignInForm } from './signin-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in | My Stuff' };

export default async function SignInPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const query = await searchParams;
    return <SignInContent returnTo={safeReturnPath(query.return_to)} />;
}

async function SignInContent({ returnTo }: { returnTo: string }) {
    if (await getArchiveUser()) redirect(returnTo);
    const mode = authMode();
    const { settings } = await getInstallation();
    if (mode === 'password' && !authConfiguration().config) {
        const { setupRequired } = await import('@/app/installation');
        if (await setupRequired()) redirect('/setup');
    }
    const configuration =
        mode === 'oidc' ? oidcConfiguration() : authConfiguration();
    if (mode === 'oidc' && configuration.config)
        redirect(signInDestination(returnTo));
    const error =
        mode === 'invalid'
            ? 'Sign-in is not configured. Set ARCHIVE_AUTH_MODE to password or oidc on the server.'
            : mode === 'password' && !configuration.config
              ? null
              : configuration.error;
    return (
        <main className="signin-page grid min-h-screen place-items-center px-5 py-8 sm:px-6 sm:py-12">
            <section className="min-w-0 w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-10">
                <ArchiveBrand className="mb-12" title={settings.title} subtitle={settings.subtitle} />
                <div className="mb-5 flex items-center gap-2 text-primary">
                    <LockKeyhole size={16} />
                    <span className="eyebrow">YOUR PRIVATE COLLECTION</span>
                </div>
                <h1 className="mb-3 font-heading text-4xl font-semibold">
                    Welcome to {settings.title}.
                </h1>
                <p className="mb-8 leading-relaxed text-muted-foreground">
                    {settings.subtitle}
                </p>
                {mode === 'password' ? (
                    <SignInForm
                        returnTo={returnTo}
                        configurationError={error}
                    />
                ) : (
                    <p
                        role="alert"
                        className="text-sm leading-relaxed text-destructive"
                    >
                        {error}
                    </p>
                )}
            </section>
        </main>
    );
}
