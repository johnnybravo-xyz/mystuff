import {
    accountForRequest,
    errorResponse,
    ArchiveError,
    recordKey,
} from '@/app/wardrobe/server';
import { getDb, getImageStore } from '@/db';
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const account = await accountForRequest(request);
        const { id } = await params;
        const record = await getDb()
            .prepare(
                'SELECT object_key,content_type FROM images WHERE id=? AND account_id=?',
            )
            .bind(recordKey(account, id), account)
            .first<{ object_key: string; content_type: string }>();
        if (!record) throw new ArchiveError('This photo is unavailable.', 404);
        const object = await getImageStore().get(record.object_key);
        if (!object) throw new ArchiveError('This photo is unavailable.', 404);
        return new Response(object.body, {
            headers: {
                'Content-Type': record.content_type,
                'Cache-Control': 'private, max-age=31536000',
                Vary: 'Cookie, Authorization',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        return errorResponse(error, 'read_photo');
    }
}
