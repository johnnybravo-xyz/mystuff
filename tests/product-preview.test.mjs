import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const source = await readFile(
    new URL('../app/import/product-preview.ts', import.meta.url),
    'utf8',
);
const compiled = stripTypeScriptTypes(source).replaceAll(
    "'../wardrobe/model'",
    JSON.stringify(new URL('../app/wardrobe/model.ts', import.meta.url).href),
);
const {
    publicProductUrl,
    isPublicAddress,
    resolvePublicAddress,
    fetchPublicResource,
    parseProductMetadata,
    imageContentType,
    previewProduct,
    readPreviewInput,
} = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const pageUrl = 'https://shop.example/products/polo';
const address = { address: '93.184.216.34', family: 4 };
const resolvePublic = async () => [address];
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf6kAAAAASUVORK5CYII=',
    'base64',
);
const ld = (value) =>
    `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

function transport(responses, calls = []) {
    return (url, options, callback) => {
        calls.push({ url: url.href, options });
        const request = new EventEmitter();
        request.destroy = (error) => {
            if (error) request.emit('error', error);
            request.emit('close');
        };
        request.end = () =>
            queueMicrotask(() => {
                const response = responses.shift();
                assert.ok(response, 'unexpected network request');
                const incoming = new Readable({ read() {} });
                incoming.statusCode = response.status || 200;
                incoming.headers = response.headers || {
                    'content-type': 'text/html',
                };
                incoming.on('close', () => request.emit('close'));
                incoming.on('end', () => request.emit('close'));
                callback(incoming);
                if (!incoming.destroyed) {
                    for (const chunk of response.chunks || [
                        Buffer.from('<title>Product</title>'),
                    ])
                        incoming.push(chunk);
                    incoming.push(null);
                }
            });
        return request;
    };
}

test('public URL validation rejects local, alternate port, credential and encoded IP targets', () => {
    for (const url of [
        'http://shop.example/item',
        'file:///etc/passwd',
        'ftp://shop.example/item',
        'https://localhost/item',
        'https://service.local/',
        'https://server/',
        'https://127.0.0.1/',
        'https://127.1/',
        'https://2130706433/',
        'https://0x7f000001/',
        'https://0177.0.0.1/',
        'https://%31%32%37.0.0.1/',
        'https://10.2.3.4/',
        'https://169.254.169.254/latest/meta-data',
        'https://[::1]/',
        'https://[::ffff:127.0.0.1]/',
        'https://[64:ff9b::7f00:1]/',
        'https://shop.example:8443/',
        'https://user:password@shop.example/',
        'https://shop.example\\@127.0.0.1/',
        'https://shop.example/\nsecret',
        null,
        {},
        '//shop.example/item',
    ])
        assert.throws(
            () => publicProductUrl(url),
            undefined,
            JSON.stringify(url),
        );
    assert.equal(publicProductUrl(`${pageUrl}#photos`).href, pageUrl);
    assert.equal(
        publicProductUrl('/photo.jpg', pageUrl).href,
        'https://shop.example/photo.jpg',
    );
    assert.equal(
        publicProductUrl('https://[2606:4700:4700::1111]/').protocol,
        'https:',
    );
});

test('address checks exclude private, reserved and IPv6 transition networks', () => {
    for (const ip of [
        '0.1.2.3',
        '100.64.1.2',
        '172.16.0.1',
        '192.168.1.2',
        '192.0.2.4',
        '198.18.0.1',
        '198.51.100.2',
        '203.0.113.2',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        'fe80::1',
        'fc00::1',
        'ff02::1',
        '2001:db8::1',
        '2001::1',
        '2002:7f00:1::',
        '3fff::1',
        'invalid',
    ]) {
        assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of [
        '1.1.1.1',
        address.address,
        '2606:4700:4700::1111',
        '2001:4860:4860::8888',
    ])
        assert.equal(isPublicAddress(ip), true, ip);
});

test('DNS requires every returned address to be public and valid', async () => {
    await assert.rejects(
        resolvePublicAddress(new URL(pageUrl), async () => [
            address,
            { address: '127.0.0.1', family: 4 },
        ]),
        /private/,
    );
    await assert.rejects(
        resolvePublicAddress(new URL(pageUrl), async () => [
            address,
            { address: '::ffff:127.0.0.1', family: 6 },
        ]),
        /private/,
    );
    await assert.rejects(
        resolvePublicAddress(new URL(pageUrl), async () => []),
        /private/,
    );
    await assert.rejects(
        resolvePublicAddress(new URL(pageUrl), async () => [
            { ...address, family: 6 },
        ]),
        /private/,
    );
    assert.deepEqual(
        await resolvePublicAddress(new URL(pageUrl), resolvePublic),
        address,
    );
});

test('HTTPS requests pin validated DNS and do not forward credentials or reuse connections', async () => {
    const calls = [];
    let resolutions = 0;
    const response = await fetchPublicResource(pageUrl, 'html', {
        resolve: async () => {
            resolutions++;
            return resolutions === 1
                ? [address]
                : [{ address: '127.0.0.1', family: 4 }];
        },
        request: transport([{}], calls),
    });
    assert.equal(response.url, pageUrl);
    assert.equal(resolutions, 1);
    const options = calls[0].options;
    assert.equal(options.agent, false);
    assert.equal(options.family, 4);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    options.lookup('shop.example', {}, (error, ip, family) => {
        assert.equal(error, null);
        assert.equal(ip, address.address);
        assert.equal(family, 4);
    });
    options.lookup('shop.example', { all: true }, (error, addresses) => {
        assert.equal(error, null);
        assert.deepEqual(addresses, [address]);
    });
    assert.equal(resolutions, 1);
});

test('each redirect is revalidated and cannot reach a private DNS answer', async () => {
    const calls = [];
    await assert.rejects(
        fetchPublicResource(pageUrl, 'html', {
            resolve: async (host) =>
                host === 'shop.example'
                    ? [address]
                    : [{ address: '10.0.0.5', family: 4 }],
            request: transport(
                [
                    {
                        status: 302,
                        headers: {
                            location: 'https://redirect.example/secret',
                        },
                    },
                ],
                calls,
            ),
        }),
        /private/,
    );
    assert.equal(calls.length, 1);
    await assert.rejects(
        fetchPublicResource(pageUrl, 'html', {
            resolve: resolvePublic,
            request: transport([
                {
                    status: 302,
                    headers: { location: 'http://shop.example/insecure' },
                },
            ]),
        }),
        /HTTPS/,
    );
    const repeated = Array.from({ length: 5 }, () => ({
        status: 302,
        headers: { location: '/again' },
    }));
    await assert.rejects(
        fetchPublicResource(pageUrl, 'html', {
            resolve: resolvePublic,
            request: transport(repeated),
        }),
        /too many/,
    );
});

test('response limits apply to declared and streamed HTML/image sizes', async () => {
    for (const [kind, limit] of [
        ['html', 2 * 1024 * 1024],
        ['image', 8 * 1024 * 1024],
    ]) {
        await assert.rejects(
            fetchPublicResource(pageUrl, kind, {
                resolve: resolvePublic,
                request: transport([
                    {
                        headers: {
                            'content-type': 'text/html',
                            'content-length': String(limit + 1),
                        },
                    },
                ]),
            }),
            (error) => error.status === 413,
        );
        await assert.rejects(
            fetchPublicResource(pageUrl, kind, {
                resolve: resolvePublic,
                request: transport([
                    { chunks: [Buffer.alloc(limit), Buffer.alloc(1)] },
                ]),
            }),
            (error) => error.status === 413,
        );
    }
    await assert.rejects(
        fetchPublicResource(pageUrl, 'html', {
            resolve: resolvePublic,
            request: transport([
                {
                    headers: {
                        'content-type': 'text/html',
                        'content-encoding': 'gzip',
                    },
                },
            ]),
        }),
        /supported/,
    );
    await assert.rejects(
        fetchPublicResource(pageUrl, 'html', {
            resolve: resolvePublic,
            request: transport([
                { headers: { 'content-type': 'application/json' } },
            ]),
        }),
        /supported/,
    );
});

test('DNS timeout is bounded without opening an HTTP connection', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const operation = fetchPublicResource(pageUrl, 'html', {
        resolve: () => new Promise(() => {}),
        request: () => {
            throw new Error('must not connect');
        },
    });
    const rejected = assert.rejects(operation, (error) => error.status === 504);
    t.mock.timers.tick(10_001);
    await rejected;
});

test('JSON-LD graph supplies explicit product facts and safe bounded image candidates', () => {
    const product = {
        '@type': 'Product',
        name: 'Slim-fit polo',
        brand: { '@type': 'Brand', name: 'Mango' },
        description: '<p>Cotton &amp; linen.</p>',
        color: 'Black',
        size: { name: 'L' },
        sku: '27076711',
        additionalProperty: [
            { name: 'Fit', value: 'Slim' },
            { name: 'Ignore', value: { invalid: 'object' } },
        ],
        image: [
            { contentUrl: '/product.jpg' },
            'https://127.0.0.1/a.jpg',
            '/product.jpg',
            ...Array.from({ length: 8 }, (_, i) => `/image-${i}.jpg`),
        ],
    };
    const parsed = parseProductMetadata(
        `<!-- <meta property="og:title" content="Wrong"> --><script type="application/ld+json">broken</script>${ld({ '@graph': [{ '@type': 'Organization', name: 'Wrong' }, product] })}`,
        pageUrl,
    );
    assert.equal(parsed.item.name, 'Slim-fit polo');
    assert.equal(parsed.item.brand, 'Mango');
    assert.equal(parsed.item.category, 'polo');
    assert.equal(parsed.item.colour, 'Black');
    assert.equal(parsed.item.size, 'L');
    assert.equal(parsed.item.notes, 'Cotton & linen.');
    assert.deepEqual(parsed.item.details, [
        { label: 'Product reference', value: '27076711' },
        { label: 'Fit', value: 'Slim' },
    ]);
    assert.equal(parsed.images.length, 6);
    assert.equal(parsed.images[0], 'https://shop.example/product.jpg');
    assert.equal(parsed.item.owner, undefined);
    assert.equal(parsed.item.quantity, undefined);
});

test('OG fallback preserves unknown size/colour and parses quoted tag delimiters', () => {
    const parsed = parseProductMetadata(
        '<title>Fallback</title><meta content="Blue polo > size L &amp; cotton" property="og:title"><meta name="description" content="A product description"><meta property="og:image" content="/image.jpg">',
        pageUrl,
    );
    assert.equal(parsed.item.name, 'Blue polo > size L & cotton');
    assert.equal(parsed.item.colour, undefined);
    assert.equal(parsed.item.size, undefined);
    assert.equal(parsed.item.brand, undefined);
    assert.equal(
        parsed.warnings.some((warning) => warning.includes('limited')),
        true,
    );
    assert.throws(
        () => parseProductMetadata('<html>Nothing</html>', pageUrl),
        /No product information/,
    );
});

test('matching product URL wins over unrelated products and warns about variants', () => {
    const parsed = parseProductMetadata(
        ld([
            { '@type': 'Product', name: 'Unrelated chair', url: '/other' },
            {
                '@type': ['Thing', 'https://schema.org/Product'],
                name: 'Correct polo',
                url: pageUrl,
            },
        ]),
        pageUrl,
    );
    assert.equal(parsed.item.name, 'Correct polo');
    assert.equal(
        parsed.warnings.some((warning) => warning.includes('multiple')),
        true,
    );
});

test('preview stores real private photos, deduplicates bytes, and rejects HTML disguised as an image', async () => {
    const html = ld({
        '@type': 'Product',
        name: 'Polo',
        image: ['/photo.jpg', '/duplicate.jpg', '/blocked.jpg', '/fake.jpg'],
    });
    const stored = [];
    const result = await previewProduct(
        pageUrl,
        async (...args) => stored.push(args),
        async (url, kind) => {
            if (kind === 'html')
                return {
                    bytes: Buffer.from(html),
                    url,
                    contentType: 'text/html',
                };
            if (url.includes('blocked')) throw new Error('blocked');
            return {
                bytes: url.includes('fake')
                    ? Buffer.from('<svg><script>bad</script></svg>')
                    : png,
                url,
                contentType: 'image/jpeg',
            };
        },
    );
    assert.equal(stored.length, 1);
    assert.equal(stored[0][2], 'image/png');
    assert.equal(result.item.photos.length, 1);
    assert.equal(result.item.imageId, stored[0][0]);
    assert.equal(result.item.photos[0].referenceConfirmed, false);
    assert.equal(
        result.item.photos[0].sourceUrl,
        'https://shop.example/photo.jpg',
    );
    assert.equal(result.item.photos[0].url, undefined);
    assert.equal(
        result.warnings.some((warning) => warning.includes('2 product photos')),
        true,
    );
    assert.equal(
        imageContentType(Buffer.from('<html>not an image</html>')),
        null,
    );
    assert.equal(
        imageContentType(Buffer.from('0000ftypavif0000')),
        'image/avif',
    );
});

test('preview input enforces the byte cap without trusting Content-Length', async () => {
    const request = (body, headers = {}) =>
        new Request('https://archive.example/api/product-preview', {
            method: 'POST',
            headers,
            body,
        });
    assert.equal(
        await readPreviewInput(request(JSON.stringify({ url: pageUrl }))),
        pageUrl,
    );
    await assert.rejects(
        readPreviewInput(
            request(JSON.stringify({ url: pageUrl, junk: 'x'.repeat(8192) })),
        ),
        (error) => error.status === 413,
    );
    await assert.rejects(
        readPreviewInput(request('{}', { 'content-length': '8193' })),
        (error) => error.status === 413,
    );
    await assert.rejects(readPreviewInput(request('invalid')), /JSON/);
    await assert.rejects(
        readPreviewInput(
            request(JSON.stringify({ url: 'https://127.0.0.1/' })),
        ),
        /public/,
    );
});
