import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const helper = new URL('../app/wardrobe/export.ts', import.meta.url).href;
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === helper && specifier === './model')
            return nextResolve(
                new URL('../app/wardrobe/model.ts', import.meta.url).href,
                context,
            );
        return nextResolve(specifier, context);
    },
});
const { buildArchiveExport, selectExportItems } = await import(helper);
hook.deregister();

const all = { owner: 'all', collection: 'all', categories: 'all' };
const date = new Date('2026-09-09T00:00:00Z');
function item(id, overrides = {}) {
    return {
        id,
        sourceKey: `manual:${id}`,
        purchaseId: null,
        owner: 'me',
        status: 'owned',
        name: id,
        brand: 'Test',
        category: 'tshirt',
        colour: '',
        size: '',
        quantity: 1,
        fit: '',
        pattern: '',
        warmth: 'light',
        notes: '',
        favourite: false,
        imageId: null,
        productUrl: null,
        updatedAt: '2026-09-09T00:00:00Z',
        ...overrides,
    };
}

test('all export includes every owner and excludes review, returns and unconfirmed ownership', () => {
    const available = ['me', 'wife', 'child', 'household'].map((owner) =>
        item(owner, { owner }),
    );
    const unavailable = [
        'wishlist',
        'review',
        'returned',
        'awaiting_delivery',
        'retired',
        'outgrown',
        'trashed',
    ].map((status) => item(status, { status }));
    unavailable.push(item('unassigned', { owner: 'unassigned' }));
    for (const fulfillment of ['returned', 'cancelled', 'in_transit'])
        unavailable.push(item(fulfillment, { facts: { fulfillment } }));
    assert.deepEqual(
        selectExportItems([...available, ...unavailable], all)
            .map((entry) => entry.id)
            .sort(),
        ['child', 'household', 'me', 'wife'],
    );
    const output = buildArchiveExport(
        [...available, ...unavailable],
        all,
        'markdown',
        date,
    );
    assert.equal(output.count, 4);
    assert.match(output.content, /All my stuff · Everyone/);
    assert.match(output.content, /4 owned entries/);
});

test('collection, multiple category and owner selections compose, with no selection exporting zero', () => {
    const entries = [
        item('phone', { category: 'phone' }),
        item('speaker', { category: 'speaker', owner: 'household' }),
        item('table', { category: 'furniture', owner: 'household' }),
        item('tee'),
    ];
    assert.deepEqual(
        selectExportItems(entries, { ...all, collection: 'tech' }).map(
            (entry) => entry.id,
        ),
        ['phone', 'speaker'],
    );
    assert.deepEqual(
        selectExportItems(entries, {
            ...all,
            categories: ['phone', 'furniture'],
        }).map((entry) => entry.id),
        ['table', 'phone'],
    );
    assert.deepEqual(
        selectExportItems(entries, {
            ...all,
            owner: 'household',
            collection: 'tech',
        }).map((entry) => entry.id),
        ['speaker'],
    );
    assert.equal(
        buildArchiveExport(entries, { ...all, categories: [] }, 'html', date)
            .count,
        0,
    );
    assert.equal(entries[0].id, 'phone');
});

test('both formats preserve product links, nested gallery references and URL-valued details', () => {
    const entries = [
        item('Watch', {
            category: 'watch',
            size: '42 mm',
            productUrl: 'https://example.com/watch',
            details: [
                {
                    label: 'Strap product URL',
                    value: 'https://example.com/strap?size=0&colour=navy',
                },
            ],
            facts: {
                productUrl: 'https://example.com/original',
                sourceImageUrl: 'https://images.example.com/original.jpg',
                photos: [
                    {
                        imageId: 'reference',
                        kind: 'detail',
                        alt: 'Blue strap',
                        sourceUrl: 'https://images.example.com/blue.jpg',
                        referenceConfirmed: false,
                    },
                ],
            },
            photos: [
                {
                    imageId: 'product',
                    kind: 'product',
                    alt: 'Watch front',
                    sourceUrl: 'https://images.example.com/front.jpg',
                },
            ],
        }),
    ];
    for (const format of ['markdown', 'html']) {
        const output = buildArchiveExport(entries, all, format, date);
        for (const url of [
            'https://example.com/watch',
            'https://example.com/original',
            'https://images.example.com/original.jpg',
            'https://images.example.com/blue.jpg',
            'https://images.example.com/front.jpg',
        ])
            assert(output.content.includes(url));
        assert.match(output.content, /exact variant unconfirmed/);
        assert.match(output.content, /42 mm/);
        assert(output.filename.endsWith(format === 'html' ? '.html' : '.md'));
    }
    const md = buildArchiveExport(entries, all, 'markdown', date).content;
    assert.match(
        md,
        /\]\(<https:\/\/example.com\/strap\?size=0&amp;colour=navy>\)/,
    );
    const html = buildArchiveExport(entries, all, 'html', date).content;
    assert.match(
        html,
        /href="https:\/\/example.com\/strap\?size=0&amp;colour=navy"/,
    );
});

test('HTML escapes custom text and rejects active or private source URLs without external assets', () => {
    const output = buildArchiveExport(
        [
            item('<script>alert(1)</script>', {
                notes: '<img src=x onerror=alert(1)>',
                productUrl: 'javascript:alert(1)',
                details: [
                    {
                        label: '"><script>bad</script>',
                        value: '<iframe src="evil"></iframe>',
                    },
                ],
                photos: [
                    {
                        imageId: 'private',
                        kind: 'product',
                        alt: 'Private',
                        sourceUrl: 'https://mystuff.example/api/images/private',
                    },
                    {
                        imageId: 'relative',
                        kind: 'product',
                        alt: 'Relative',
                        sourceUrl: '/api/images/relative',
                    },
                    {
                        imageId: 'data',
                        kind: 'product',
                        alt: 'Data',
                        sourceUrl: 'data:text/html,evil',
                    },
                    {
                        imageId: 'credentials',
                        kind: 'product',
                        alt: 'Credentials',
                        sourceUrl: 'https://user:password@example.com/private',
                    },
                ],
            }),
        ],
        all,
        'html',
        date,
    );
    assert.match(output.content, /^<!doctype html>/);
    assert.match(output.content, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(
        output.content,
        /<script|<img|<iframe|javascript:|data:text|\/api\/images|user:password/,
    );
    assert.match(output.content, /<meta name="viewport"/);
    assert.match(output.content, /<style>/);
    assert.doesNotMatch(output.content, /<link|<script|<img/);
});

test('Markdown neutralizes markup, inserted headings and dangerous links in item fields', () => {
    const output = buildArchiveExport(
        [
            item('A\n# injected [click](javascript:alert(1))', {
                notes: '<script>bad</script>\n# fake heading\n![image](https://evil.example/image)',
                brand: 'Brand *bold*',
                productUrl: 'https://example.com/path?q=<bad>',
            }),
        ],
        all,
        'markdown',
        date,
    );
    assert.doesNotMatch(
        output.content,
        /\n# injected|\n# fake|<script>|!\[image\]|\[click\]\(javascript:/,
    );
    assert.match(output.content, /Brand \\\*bold\\\*/);
    assert.match(output.content, /&lt;script&gt;/);
    assert.match(output.content, /https:\/\/example.com\/path\?q=%3Cbad%3E/);
});

test('Markdown links preserve entity-like query values and literal backslashes', () => {
    const url = 'https://example.com/?token=&copy;&path=one\\two&entity=&amp;';
    const markdown = buildArchiveExport(
        [item('Query reference', { productUrl: url })],
        all,
        'markdown',
        date,
    ).content;
    assert(
        markdown.includes(
            '[Product page](<https://example.com/?token=&amp;copy;&amp;path=one\\\\two&amp;entity=&amp;amp;>)',
        ),
    );
    assert(!markdown.includes('token=&copy;'));
    const html = buildArchiveExport(
        [item('Query reference', { productUrl: url })],
        all,
        'html',
        date,
    ).content;
    assert(
        html.includes(
            'href="https://example.com/?token=&amp;copy;&amp;path=one\\two&amp;entity=&amp;amp;"',
        ),
    );
});

test('readable exports exclude private price metadata', () => {
    const priced = item('priced-item', {
        price: {
            amount: 87123.45,
            currency: 'USD',
            basis: 'retail',
            checkedAt: '2026-09-09',
            sourceUrl: 'https://example.com/private-price-reference',
            notes: 'Private price note',
        },
    });
    for (const format of ['markdown', 'html']) {
        const output = buildArchiveExport([priced], all, format, date);
        assert.doesNotMatch(
            output.content,
            /87123|87,123|private-price-reference|Private price note/,
        );
    }
});

test('consumables export includes purchase context and tasting notes', () => {
    const coffee = item('coffee', {
        category: 'coffee',
        purchaseDate: '2026-10-10',
        purchaseVendor: 'Travel roaster',
        purchaseLocation: 'Lisbon',
        notes: 'Would buy again.',
    });
    for (const format of ['markdown', 'html']) {
        const exported = buildArchiveExport(
            [coffee, item('shirt')],
            { ...all, collection: 'pantry' },
            format,
            date,
        );
        assert.equal(exported.count, 1);
        for (const value of [
            '2026-10-10',
            'Travel roaster',
            'Lisbon',
            'Would buy again.',
        ])
            assert.ok(
                exported.content.replaceAll('\\', '').includes(value),
                value,
            );
    }
});
