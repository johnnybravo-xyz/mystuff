import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (
            specifier === './model' &&
            context.parentURL?.endsWith('/app/wardrobe/editor-photos.ts')
        )
            return nextResolve(
                new URL('../app/wardrobe/model.ts', import.meta.url).href,
                context,
            );
        return nextResolve(specifier, context);
    },
});
const { prepareEditorPhotos } =
    await import('../app/wardrobe/editor-photos.ts');
hook.deregister();

const product = {
    imageId: 'existing-product',
    kind: 'product',
    alt: 'Product',
};
const personal = {
    imageId: 'mustard-photo',
    kind: 'personal',
    alt: 'Golden mustard',
    referenceConfirmed: true,
};
const pending = (id, kind = 'product') => ({
    id,
    file: new File(['photo'], `${id}.png`),
    kind,
});

function prepare(overrides = {}) {
    return prepareEditorPhotos({
        photos: [product, personal],
        uploads: [],
        primaryPhotoId: product.imageId,
        clothing: false,
        name: 'Stroller',
        uploadPhoto: async (file) => `uploaded-${file.name}`,
        onUploaded: () => {},
        ...overrides,
    });
}

test('saving a different existing primary preserves photo kinds and metadata', async () => {
    const saved = await prepare({ primaryPhotoId: personal.imageId });
    assert.equal(saved.imageId, personal.imageId);
    assert.deepEqual(saved.photos, [product, personal]);
});

test('additional product uploads keep an explicitly selected existing primary', async () => {
    for (const primaryPhotoId of [product.imageId, personal.imageId]) {
        const saved = await prepare({
            primaryPhotoId,
            uploads: [pending('new')],
        });
        assert.equal(saved.imageId, primaryPhotoId);
        assert.equal(saved.photos.length, 3);
        assert.equal(saved.photos[2].imageId, 'uploaded-new.png');
    }
});

test('a pending primary resolves to its uploaded image ID ahead of other products', async () => {
    const saved = await prepare({
        primaryPhotoId: 'selected',
        uploads: [
            pending('first'),
            pending('selected', 'personal'),
            pending('last'),
        ],
    });
    assert.equal(saved.imageId, 'uploaded-selected.png');
    assert.deepEqual(saved.photos[3], {
        imageId: saved.imageId,
        kind: 'personal',
        alt: 'Stroller',
    });
});

test('removing a selected existing or pending photo restores the automatic product fallback', async () => {
    for (const primaryPhotoId of [personal.imageId, 'removed-upload', '']) {
        const saved = await prepare({
            photos: [product],
            primaryPhotoId,
            uploads: [pending('new')],
        });
        assert.equal(saved.imageId, product.imageId);
        assert.deepEqual(
            saved.photos.map((photo) => photo.imageId),
            [product.imageId, 'uploaded-new.png'],
        );
    }
});

test('empty and unselected galleries retain product-first and clothing-only worn fallback', async () => {
    const worn = { imageId: 'worn', kind: 'model', alt: 'Worn' };
    assert.equal(
        (await prepare({ photos: [], primaryPhotoId: '' })).imageId,
        null,
    );
    assert.equal(
        (await prepare({ photos: [personal], primaryPhotoId: '' })).imageId,
        null,
    );
    assert.equal(
        (await prepare({ photos: [worn], primaryPhotoId: '', clothing: false }))
            .imageId,
        null,
    );
    assert.equal(
        (await prepare({ photos: [worn], primaryPhotoId: '', clothing: true }))
            .imageId,
        'worn',
    );
    assert.equal(
        (
            await prepare({
                photos: [worn],
                primaryPhotoId: '',
                clothing: true,
                uploads: [pending('product')],
            })
        ).imageId,
        'uploaded-product.png',
    );
});

test('retry after a later upload fails reuses successful files and keeps the pending primary', async () => {
    let uploads = [pending('selected', 'personal'), pending('second')];
    const calls = [];
    let fail = true;
    const options = {
        primaryPhotoId: 'selected',
        uploadPhoto: async (file) => {
            calls.push(file.name);
            if (file.name === 'second.png' && fail)
                throw new Error('Upload unavailable');
            return `uploaded-${file.name}`;
        },
        onUploaded: (id, imageId) => {
            uploads = uploads.map((upload) =>
                upload.id === id ? { ...upload, imageId } : upload,
            );
        },
    };
    await assert.rejects(
        prepare({ ...options, uploads }),
        /Upload unavailable/,
    );
    assert.equal(uploads[0].imageId, 'uploaded-selected.png');
    fail = false;
    const saved = await prepare({ ...options, uploads });
    assert.equal(saved.imageId, 'uploaded-selected.png');
    assert.deepEqual(calls, ['selected.png', 'second.png', 'second.png']);
    // A save failure retries the same completed uploads without uploading again.
    assert.deepEqual(await prepare({ ...options, uploads }), saved);
    assert.equal(calls.length, 3);
});
