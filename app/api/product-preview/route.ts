import {
    accountForRequest,
    storeImage,
    errorResponse,
    ArchiveError,
} from '@/app/wardrobe/server';
import {
    previewProduct,
    readPreviewInput,
    ProductPreviewError,
} from '@/app/import/product-preview';

export async function POST(request: Request) {
    try {
        const account = await accountForRequest(request);
        const url = await readPreviewInput(request);
        const result = await previewProduct(url, (id, bytes, type) =>
            storeImage(account, id, bytes, type),
        );
        console.info(
            JSON.stringify({
                event: 'archive.product_preview',
                photos: result.item.photos?.length || 0,
                warnings: result.warnings.length,
            }),
        );
        return Response.json(result, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        // Never expose source URLs, including their query parameters, in error logs.
        const safeError =
            error instanceof ProductPreviewError
                ? new ArchiveError(error.message, error.status)
                : error instanceof ArchiveError
                  ? error
                  : new ArchiveError(
                        'The product preview could not be completed. You can add the item manually.',
                        502,
                    );
        return errorResponse(safeError, 'product_preview');
    }
}
