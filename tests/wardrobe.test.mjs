import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (
            specifier === './model' &&
            context.parentURL?.endsWith('/app/wardrobe/outfits.ts')
        )
            return nextResolve(
                new URL('../app/wardrobe/model.ts', import.meta.url).href,
                context,
            );
        return nextResolve(specifier, context);
    },
});
const { makeOutfitIdeas, swapCandidates } =
    await import('../app/wardrobe/outfits.ts');
hook.deregister();
import {
    purchaseItems,
    reconcileItem,
    itemPhotos,
    productCover,
    coverPhotos,
    orderedCoverPhotos,
    collectionFor,
    supportsStyling,
    inferCategory,
    isAvailable,
} from '../app/wardrobe/model.ts';

test('phone and vehicle names enter their collections without outfit styling', () => {
    for (const name of [
        'iPhone 15 Pro Max',
        'Apple iPhone',
        'Android smartphone',
        'Mobile phone',
    ]) {
        const category = inferCategory(name);
        assert.equal(category, 'phone');
        assert.equal(collectionFor(category), 'tech');
        assert.equal(supportsStyling({ category }), false);
    }
    for (const name of [
        'Škoda Rapid 1.6 Ambition Plus',
        'Skoda Rapid',
        'Mercedes-AMG GLC 43 Coupé',
        'Honda CB350RS',
        'CB350RS motorcycle',
    ]) {
        assert.equal(inferCategory(name), 'vehicle');
    }
    assert.notEqual(inferCategory('Headphones'), 'phone');
    assert.notEqual(inferCategory('Rapid-dry T-shirt'), 'vehicle');
});

test('pets and their supplies have a dedicated non-styling collection', () => {
    for (const category of ['pet', 'pet_supply', 'pet_care']) {
        assert.equal(collectionFor(category), 'pets');
        assert.equal(supportsStyling({ category }), false);
    }
});

test('product previews classify equipment, kitchenware and carry accessories', () => {
    for (const [name, category, collection] of [
        ['Fujifilm X-H2', 'camera', 'tech'],
        ['FUJINON XF16-80mmF4 R OIS WR lens', 'lens', 'tech'],
        ['XF16-80mmF4 R OIS WR', 'lens', 'tech'],
        ['Ducky One 2 SF RGB mechanical keyboard', 'keyboard', 'tech'],
        ['AirPods Pro 3', 'headphones', 'tech'],
        ['Wireless headphones', 'headphones', 'tech'],
        ['Santoku White Steel #2 155mm', 'kitchenware', 'home'],
        ['Coffee & More espresso cups 4-pack', 'kitchenware', 'home'],
        ['Coffee & More espresso mug, 4-pcs', 'kitchenware', 'home'],
        ['Lelit Bianca espresso machine', 'appliance', 'home'],
        ['Yamaha F310 acoustic guitar', 'musical_instrument', 'other'],
        ['Orbitkey Multi-Tool v2', 'tool', 'other'],
        ['Hide & Seek Wallet', 'accessory', 'fashion'],
        ['Classic Duffel', 'accessory', 'fashion'],
        ['Rambler Backpack Pannier', 'accessory', 'fashion'],
        ['Urban Explore 25 Camera Backpack', 'accessory', 'fashion'],
        ['Key Organiser Active', 'accessory', 'fashion'],
    ]) {
        assert.equal(inferCategory(name), category, name);
        assert.equal(collectionFor(category), collection, name);
        assert.equal(supportsStyling({ category, name }), false);
    }
});

function piece(id, category, overrides = {}) {
    return {
        id,
        sourceKey: `manual:${id}`,
        purchaseId: null,
        owner: 'me',
        status: 'owned',
        name: id,
        brand: 'Test',
        category,
        colour: 'Navy',
        size: 'M',
        quantity: 1,
        fit: '',
        pattern: '',
        warmth: 'light',
        notes: '',
        favourite: false,
        imageId: null,
        productUrl: null,
        updatedAt: '2026-09-08T00:00:00Z',
        ...overrides,
    };
}
function purchase(overrides = {}) {
    return {
        id: 'purchase-1',
        sourceKey: 'retailer:order:article',
        retailer: 'Test',
        orderId: 'order',
        orderDate: '2026-09-08',
        parcel: 'Parcel 1',
        fulfillment: 'delivered',
        sourceStatus: 'Delivered',
        article: 'article',
        name: 'T-shirt',
        colour: 'Black',
        size: 'M',
        quantity: 1,
        price: 100,
        paid: 90,
        productUrl: null,
        sourceImageUrl: null,
        imageId: 'product-1',
        ...overrides,
    };
}

test('two purchased units have separate stable records and need owner confirmation', () => {
    const first = purchaseItems(purchase({ quantity: 2 }));
    const repeat = purchaseItems(purchase({ quantity: 2 }));
    assert.equal(first.length, 2);
    assert.notEqual(first[0].id, first[1].id);
    assert.deepEqual(
        first.map((item) => item.id),
        repeat.map((item) => item.id),
    );
    assert(
        first.every(
            (item) =>
                item.owner === 'unassigned' &&
                item.status === 'review' &&
                item.quantity === 1,
        ),
    );
});
test('parcel returns remain outside wardrobe until confirmed; definitive returns stay excluded', () => {
    const uncertain = purchaseItems(
        purchase({ fulfillment: 'return_unknown' }),
    )[0];
    assert.equal(isAvailable(uncertain, 'me'), false);
    assert.equal(
        isAvailable(
            {
                ...uncertain,
                owner: 'me',
                status: 'owned',
                facts: purchase({ fulfillment: 'return_unknown' }),
            },
            'me',
        ),
        true,
    );
    for (const fulfillment of ['returned', 'cancelled', 'in_transit'])
        assert.equal(
            isAvailable(
                piece('blocked', 'shirt', { facts: purchase({ fulfillment }) }),
                'me',
            ),
            false,
        );
});
test('reimport preserves corrections and selected personal photos, but applies definitive returns', () => {
    const source = purchase();
    const existing = piece('purchase-1-1', 'shirt', {
        purchaseId: source.id,
        facts: source,
        sourceKey: `${source.sourceKey}:unit:1`,
        name: 'My black shirt',
        owner: 'wife',
        favourite: true,
        imageId: 'personal-1',
        notes: 'Keep tucked',
        photos: [{ imageId: 'personal-1', kind: 'personal', alt: 'My photo' }],
    });
    const refreshed = reconcileItem(existing, purchaseItems(source)[0], source);
    assert.equal(refreshed.name, existing.name);
    assert.equal(refreshed.owner, 'wife');
    assert.equal(refreshed.notes, 'Keep tucked');
    assert.equal(refreshed.imageId, 'personal-1');
    assert.equal(refreshed.favourite, true);
    assert.equal(
        reconcileItem(existing, purchaseItems(source)[0], {
            ...source,
            fulfillment: 'returned',
        }).status,
        'returned',
    );
});
test('new parcel-return uncertainty reopens review, while a confirmed retained piece stays owned', () => {
    const changed = purchase({ fulfillment: 'return_unknown' });
    const incoming = purchaseItems(changed)[0];
    assert.equal(
        reconcileItem(
            piece('p', 'shirt', { facts: purchase() }),
            incoming,
            changed,
        ).status,
        'review',
    );
    assert.equal(
        reconcileItem(
            piece('p', 'shirt', { facts: changed }),
            incoming,
            changed,
        ).status,
        'owned',
    );
    assert.equal(
        reconcileItem(
            piece('p', 'shirt', { facts: purchase() }),
            incoming,
            purchase({ fulfillment: 'in_transit' }),
        ).status,
        'awaiting_delivery',
    );
});
test('every occasion uses only available pieces from the selected family wardrobe and retains its anchor', () => {
    const items = [
        piece('top', 'polo'),
        piece('bottom', 'jeans'),
        piece('jacket', 'jacket'),
        piece('shoe', 'shoes'),
        piece('wife-top', 'shirt', { owner: 'wife' }),
        piece('child-set', 'set', { owner: 'child' }),
        piece('returned', 'trousers', { status: 'returned' }),
        piece('uncertain', 'jeans', { status: 'review' }),
        piece('underwear', 'underwear'),
    ];
    for (const occasion of ['everyday', 'smart', 'dapper']) {
        const ideas = makeOutfitIdeas(items, 'me', occasion, 'mild', 'jacket');
        assert(ideas.length);
        for (const idea of ideas) {
            assert(idea.items.some((item) => item.id === 'jacket'));
            assert(
                idea.items.every(
                    (item) =>
                        item.owner === 'me' &&
                        item.status === 'owned' &&
                        item.category !== 'underwear',
                ),
            );
        }
    }
    assert(
        makeOutfitIdeas(items, 'child', 'smart', 'mild').every((idea) =>
            idea.items.every((item) => item.owner === 'child'),
        ),
    );
    assert.deepEqual(
        makeOutfitIdeas(items, 'me', 'everyday', 'warm', 'returned'),
        [],
    );
});
test('partial outfits state missing pieces and unknown colours without inventing garments', () => {
    const ideas = makeOutfitIdeas(
        [piece('top', 'polo', { colour: 'unknown' })],
        'me',
        'everyday',
        'warm',
    );
    assert.equal(ideas.length, 1);
    assert.deepEqual(
        ideas[0].items.map((item) => item.id),
        ['top'],
    );
    assert(ideas[0].missing.includes('a bottom'));
    assert(ideas[0].missing.includes('footwear'));
    assert.match(ideas[0].explanation, /colours are still unknown/);
});
test('swaps keep the role and family, excluding already used or unavailable items', () => {
    const top = piece('top', 'shirt');
    const items = [
        top,
        piece('other-top', 'polo'),
        piece('bottom', 'jeans'),
        piece('wife-top', 'shirt', { owner: 'wife' }),
        piece('retired-top', 'tshirt', { status: 'retired' }),
    ];
    assert.deepEqual(
        swapCandidates(items, 'me', top, ['top', 'bottom']).map(
            (item) => item.id,
        ),
        ['other-top'],
    );
});
test('gallery retains retailer worn views and user photos without duplicate image IDs', () => {
    const item = piece('top', 'shirt', {
        imageId: 'model-1',
        photos: [{ imageId: 'personal-1', kind: 'personal', alt: 'Own photo' }],
        facts: purchase({
            photos: [
                { imageId: 'model-1', kind: 'model', alt: 'Worn' },
                { imageId: 'personal-1', kind: 'personal', alt: 'Own' },
            ],
        }),
    });
    assert.equal(itemPhotos(item).length, 2);
    assert(itemPhotos(item).some((photo) => photo.kind === 'model'));
});

test('covers honor the selected photo of any kind without relabelling the gallery', () => {
    const item = piece('top', 'shirt', {
        imageId: 'worn',
        photos: [
            { imageId: 'worn', kind: 'model', alt: 'Worn' },
            { imageId: 'reference', kind: 'detail', alt: 'Reference' },
            { imageId: 'product-one', kind: 'product', alt: 'Front' },
            { imageId: 'product-two', kind: 'product', alt: 'Back' },
        ],
    });
    for (const imageId of ['worn', 'reference', 'product-two']) {
        const selected = { ...item, imageId };
        assert.equal(productCover(selected), imageId);
        const candidates = coverPhotos(selected).map((photo) => photo.imageId);
        assert.equal(candidates[0], imageId);
        assert.equal(candidates.filter((id) => id === imageId).length, 1);
    }
    assert.equal(item.photos[0].kind, 'model');
    assert.equal(item.photos[1].kind, 'detail');
    assert.equal(itemPhotos(item).length, 4);
});

test('automatic primary prefers confirmed products and ignores missing selections', () => {
    const photos = [
        { imageId: 'personal', kind: 'personal', alt: 'My photo' },
        { imageId: 'worn', kind: 'model', alt: 'Worn' },
        {
            imageId: 'family',
            kind: 'product',
            alt: 'Other colour',
            referenceConfirmed: false,
        },
        { imageId: 'matching', kind: 'product', alt: 'Matching colour' },
    ];
    for (const selection of [null, 'missing'])
        assert.deepEqual(
            orderedCoverPhotos(photos, selection, true).map(
                (photo) => photo.imageId,
            ),
            ['matching', 'family', 'worn'],
        );
    assert.equal(
        productCover(piece('stroller', 'baby_gear', { photos })),
        'matching',
    );
    assert.equal(
        productCover(piece('legacy', 'baby_gear', { imageId: 'legacy-photo' })),
        'legacy-photo',
    );
});

test('reimport keeps a primary selected from the original purchase gallery', () => {
    const source = purchase({
        imageId: 'original',
        photos: [{ imageId: 'original', kind: 'product', alt: 'Original' }],
    });
    const changed = purchase({
        imageId: 'new-reference',
        photos: [{ imageId: 'new-reference', kind: 'product', alt: 'New' }],
    });
    const existing = piece('p', 'shirt', {
        imageId: source.imageId,
        facts: source,
    });
    const incoming = purchaseItems(changed)[0];
    assert.equal(
        reconcileItem(existing, incoming, changed).imageId,
        'original',
    );
    assert.equal(
        reconcileItem({ ...existing, imageId: null }, incoming, changed)
            .imageId,
        'new-reference',
    );
});

test('fragrances are optional anchors, never substitute for clothes or cross family wardrobes', () => {
    const items = [
        piece('polo', 'polo'),
        piece('jeans', 'jeans'),
        piece('scent', 'fragrance', { colour: '', size: '' }),
        piece('wife-scent', 'fragrance', { owner: 'wife' }),
    ];
    for (const occasion of ['everyday', 'smart', 'dapper']) {
        const everyday = makeOutfitIdeas(items, 'me', occasion, 'mild');
        assert(
            everyday.every((idea) =>
                idea.items.every((item) => item.category !== 'fragrance'),
            ),
        );
        const anchored = makeOutfitIdeas(
            items,
            'me',
            occasion,
            'mild',
            'scent',
        );
        assert(anchored.length);
        for (const idea of anchored) {
            assert(idea.items.some((item) => item.id === 'scent'));
            assert(idea.items.every((item) => item.owner === 'me'));
            assert.match(idea.explanation, /optional finishing touch/);
        }
    }
    assert.deepEqual(
        makeOutfitIdeas(items, 'me', 'everyday', 'mild', 'wife-scent'),
        [],
    );
});

test('non-fashion possessions belong to their own collections and never enter outfits', () => {
    const objects = [
        piece('sofa', 'furniture'),
        piece('lamp', 'lighting'),
        piece('mac', 'laptop'),
        piece('seat', 'baby_gear', { owner: 'child' }),
        piece('whisky', 'spirit'),
        piece('car', 'vehicle'),
    ];
    assert.equal(collectionFor('furniture'), 'home');
    assert.equal(collectionFor('laptop'), 'tech');
    assert.equal(collectionFor('watch'), 'watches');
    assert.equal(collectionFor('spirit'), 'spirits');
    assert(objects.every((item) => !supportsStyling(item)));
    const ideas = makeOutfitIdeas(
        [...objects, piece('tee', 'tshirt'), piece('jeans', 'jeans')],
        'me',
        'everyday',
        'mild',
    );
    assert(ideas.length);
    assert(ideas.every((idea) => idea.items.every(supportsStyling)));
    assert.deepEqual(
        makeOutfitIdeas(objects, 'me', 'everyday', 'mild', 'sofa'),
        [],
    );
});

test('clothing uses worn photos as fallback while other collections use product photos', () => {
    const photos = [
        {
            imageId: 'model',
            kind: 'model',
            alt: 'Worn reference',
            referenceConfirmed: false,
        },
        { imageId: 'product', kind: 'product', alt: 'Product' },
    ];
    assert.deepEqual(
        coverPhotos(piece('tee', 'tshirt', { photos })).map((p) => p.imageId),
        ['product', 'model'],
    );
    assert.equal(
        coverPhotos(piece('tee', 'tshirt', { photos: photos.slice(0, 1) }))[0]
            .imageId,
        'model',
    );
    assert.equal(
        coverPhotos(
            piece('bottle', 'fragrance', { photos: photos.slice(0, 1) }),
        ).length,
        0,
    );
    assert.equal(
        coverPhotos(piece('sofa', 'furniture', { photos: photos.slice(0, 1) }))
            .length,
        0,
    );
});

test('personal photo classification takes precedence over imported source metadata', () => {
    const own = {
        imageId: 'same',
        kind: 'model',
        alt: 'My worn view',
        referenceConfirmed: true,
    };
    const original = {
        imageId: 'same',
        kind: 'product',
        alt: 'Source view',
        referenceConfirmed: false,
    };
    const current = piece('shirt', 'shirt', {
        photos: [own],
        facts: purchase({ photos: [original] }),
    });
    assert.equal(itemPhotos(current)[0].kind, 'model');
    assert.equal(itemPhotos(current)[0].referenceConfirmed, true);
    const refreshed = reconcileItem(
        current,
        { ...current, photos: [original] },
        current.facts,
    );
    assert.equal(itemPhotos(refreshed)[0].kind, 'model');
});

test('wishlist clothing never enters owned outfit ideas or swap candidates', () => {
    const desired = piece('desired-top', 'shirt', { status: 'wishlist' });
    const jeans = piece('owned-jeans', 'jeans');
    const top = piece('owned-top', 'shirt');
    assert.equal(isAvailable(desired, 'me'), false);
    const ideas = makeOutfitIdeas(
        [desired, jeans, top],
        'me',
        'everyday',
        'mild',
    );
    assert.ok(ideas.length > 0);
    assert.ok(
        ideas.every((idea) =>
            idea.items.every((item) => item.id !== desired.id),
        ),
    );
    assert.ok(
        !swapCandidates([desired, jeans, top], 'me', top, ['owned-top']).some(
            (item) => item.id === desired.id,
        ),
    );
});

test('source returns turn off public sale publication and reimport never republishes', () => {
    const original = piece('listed', 'shirt', {
        sale: {
            published: true,
            askingPrice: 50,
            description: 'Public',
            photoIds: [],
        },
    });
    const returned = reconcileItem(
        original,
        original,
        purchase({ fulfillment: 'returned' }),
    );
    assert.equal(returned.status, 'returned');
    assert.equal(returned.sale.published, false);
    assert.equal(
        reconcileItem(
            returned,
            original,
            purchase({ fulfillment: 'delivered' }),
        ).sale.published,
        false,
    );
});

test('consumables form a separate collection and never enter outfit styling', () => {
    for (const category of [
        'coffee',
        'tea',
        'cooking_oil',
        'seasoning',
        'other_consumable',
    ]) {
        assert.equal(collectionFor(category), 'pantry');
        assert.equal(supportsStyling({ category }), false);
    }
    assert.equal(collectionFor('kitchenware'), 'home');
    assert.equal(collectionFor('spirit'), 'spirits');
});
