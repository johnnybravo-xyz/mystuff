import {
    accountForRequest,
    storeImage,
    errorResponse,
    ArchiveError,
} from '@/app/wardrobe/server';
export async function POST(request: Request) {
    try {
        const account = await accountForRequest(request);
        if (
            Number(request.headers.get('content-length') || 0) >
            9 * 1024 * 1024
        )
            throw new ArchiveError('Choose a photo smaller than 8 MB.', 413);
        const form = await request.formData();
        const photo = form.get('photo');
        if (!photo || typeof photo === 'string')
            throw new ArchiveError('Choose a photo to upload.');
        const id = crypto.randomUUID();
        await storeImage(
            account,
            id,
            new Uint8Array(await photo.arrayBuffer()),
            photo.type,
        );
        return Response.json(
            { id, url: `/api/images/${id}` },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (error) {
        return errorResponse(error, 'upload_photo');
    }
}
