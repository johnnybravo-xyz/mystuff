'use client';

import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignInForm({
    returnTo,
    configurationError,
}: {
    returnTo: string;
    configurationError: string | null;
}) {
    const [error, setError] = useState<string | null>(configurationError);
    const [pending, setPending] = useState(false);

    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending || configurationError) return;
        const value = new FormData(event.currentTarget).get('password');
        const password = typeof value === 'string' ? value : '';
        setPending(true);
        setError(null);
        try {
            const result = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password }),
            });
            const body = await result.json();
            if (!result.ok)
                throw new Error(
                    body.error || 'Unable to sign in. Please try again.',
                );
            window.location.assign(returnTo);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Unable to sign in. Please try again.',
            );
            setPending(false);
        }
    }

    return (
        <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
                <Label htmlFor="archive-password">My Stuff password</Label>
                <Input
                    id="archive-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    disabled={pending || !!configurationError}
                    aria-invalid={!!error && !configurationError}
                    aria-describedby={error ? 'signin-error' : undefined}
                    className="h-11"
                />
            </div>
            {error && (
                <p
                    id="signin-error"
                    role="alert"
                    className="text-sm leading-relaxed text-destructive"
                >
                    {error}
                </p>
            )}
            <Button
                type="submit"
                disabled={pending || !!configurationError}
                className="mt-2 h-11 w-full"
            >
                {pending ? 'Opening your archive…' : 'Open My Stuff'}
                <ArrowRight size={16} />
            </Button>
        </form>
    );
}
