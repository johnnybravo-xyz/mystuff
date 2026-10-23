import {
    accountForRequest,
    getArchive,
    importArchive,
    updateItems,
    addItem,
    createGroup,
    updateGroup,
    deleteGroup,
    setItemGroup,
    changeTrash,
    saveOutfit,
    savePreferences,
    errorResponse,
    ArchiveError,
    recordKey,
    requireValue,
    withArchiveWrite,
} from '@/app/wardrobe/server';
import type { ArchiveAction } from '@/app/wardrobe/model';
import { getDb } from '@/db';
export async function GET(request: Request) {
    try {
        const account = await accountForRequest(request);
        return Response.json(await getArchive(account), {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        return errorResponse(error, 'read');
    }
}
export async function POST(request: Request) {
    let action = 'write';
    try {
        const account = await accountForRequest(request);
        if (
            Number(request.headers.get('content-length') || 0) >
            58 * 1024 * 1024
        )
            throw new ArchiveError(
                'The import is too large. Split it into smaller batches.',
                413,
            );
        const input: unknown = await request.json();
        requireValue(
            input && typeof input === 'object' && 'action' in input,
            'Choose a supported archive action.',
        );
        const body = input as ArchiveAction;
        if (
            request.headers.has('authorization') &&
            ![
                'add',
                'update',
                'trash',
                'restore',
                'create_group',
                'update_group',
                'delete_group',
                'set_item_group',
            ].includes(body.action)
        )
            throw new ArchiveError(
                'This action is outside the inventory integration scope.',
                403,
            );
        action = body.action;
        return await withArchiveWrite(async () => {
            let result: unknown;
            switch (body.action) {
                case 'import':
                    result = await importArchive(account, body.payload);
                    break;
                case 'update':
                    result = await updateItems(
                        account,
                        body.ids,
                        body.patch,
                        body.expectedUpdatedAt,
                    );
                    break;
                case 'add':
                    result = await addItem(account, body.item, body.requestId);
                    break;
                case 'create_group':
                    result = await createGroup(
                        account,
                        body.group,
                        body.requestId,
                    );
                    break;
                case 'update_group':
                    result = await updateGroup(
                        account,
                        body.id,
                        body.patch,
                        body.expectedUpdatedAt,
                    );
                    break;
                case 'delete_group':
                    result = await deleteGroup(
                        account,
                        body.id,
                        body.expectedUpdatedAt,
                    );
                    break;
                case 'set_item_group':
                    result = await setItemGroup(
                        account,
                        body.itemId,
                        body.groupId,
                        body.expectedGroupId,
                    );
                    break;
                case 'trash':
                case 'restore':
                    result = await changeTrash(
                        account,
                        body.ids,
                        body.action,
                        body.expectedUpdatedAt,
                    );
                    break;
                case 'save_outfit':
                    result = await saveOutfit(account, body.outfit);
                    break;
                case 'delete_outfit':
                    await getDb()
                        .prepare(
                            'DELETE FROM outfits WHERE id=? AND account_id=?',
                        )
                        .bind(recordKey(account, String(body.id)), account)
                        .run();
                    break;
                case 'preferences':
                    await savePreferences(account, body.preferences);
                    break;
                default:
                    throw new ArchiveError(
                        'This archive action is not supported.',
                    );
            }
            console.info(JSON.stringify({ event: 'archive.write', action }));
            return Response.json(
                { ok: true, result, archive: await getArchive(account) },
                { headers: { 'Cache-Control': 'private, no-store' } },
            );
        });
    } catch (error) {
        return errorResponse(error, action);
    }
}
