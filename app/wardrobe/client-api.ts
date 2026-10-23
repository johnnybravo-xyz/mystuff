import type { Archive } from './model';
export async function archiveAction(
    body: Record<string, unknown>,
): Promise<{ archive: Archive; result: unknown }> {
    const response = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const result = (await response.json()) as {
        error?: string;
        archive: Archive;
        result: unknown;
    };
    if (!response.ok)
        throw new Error(result.error || 'This change could not be saved.');
    return result;
}
export async function uploadPhoto(file: File): Promise<string> {
    const form = new FormData();
    form.append('photo', file);
    const response = await fetch('/api/images', { method: 'POST', body: form });
    const result = (await response.json()) as { error?: string; id: string };
    if (!response.ok)
        throw new Error(result.error || 'The photo could not be uploaded.');
    return result.id;
}
