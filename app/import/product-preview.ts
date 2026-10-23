import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { createHash } from 'node:crypto';
import { inferCategory } from '../wardrobe/model';
import type { ProductPhoto, WardrobeItem } from '../wardrobe/model';

const HTML_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const IMAGE_COUNT = 6;
type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
type FetchDependencies = { resolve?: Resolver; request?: typeof httpsRequest };
type Resource = { bytes: Buffer; contentType: string; url: string };
type Metadata = {
    item: Partial<WardrobeItem>;
    images: string[];
    warnings: string[];
};
type JsonObject = Record<string, unknown>;

export class ProductPreviewError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

const blockedV4 = new BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
] as const)
    blockedV4.addSubnet(address, prefix, 'ipv4');
const publicV6 = new BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [address, prefix] of [
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
] as const)
    blockedV6.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blockedV4.check(address, 'ipv4');
    // Native global unicast excludes mapped IPv4, NAT64, and local scopes.
    return (
        family === 6 &&
        publicV6.check(address, 'ipv6') &&
        !blockedV6.check(address, 'ipv6')
    );
}

export function publicProductUrl(input: unknown, base?: string): URL {
    if (
        typeof input !== 'string' ||
        input.length > 1999 ||
        /[\p{Cc}\s\\]/u.test(input)
    )
        throw new ProductPreviewError('Use a public HTTPS product link.');
    let url: URL;
    try {
        url = new URL(input, base);
    } catch {
        throw new ProductPreviewError('Use a valid HTTPS product link.');
    }
    const host = url.hostname
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '')
        .toLowerCase();
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !host ||
        /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(
            host,
        ) ||
        (!isIP(host) && (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host))) ||
        (isIP(host) && !isPublicAddress(host))
    )
        throw new ProductPreviewError(
            'Only public HTTPS websites on the standard port can be imported.',
        );
    url.hash = '';
    if (url.href.length > 1999)
        throw new ProductPreviewError('This product link is too long.');
    return url;
}

async function withinDeadline<T>(
    operation: Promise<T>,
    deadline: number,
): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
        throw new ProductPreviewError(
            'The product website took too long to respond.',
            504,
        );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new ProductPreviewError(
                                'The product website took too long to respond.',
                                504,
                            ),
                        ),
                    remaining,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export async function resolvePublicAddress(
    url: URL,
    resolve: Resolver = (host) =>
        lookup(host, { all: true, order: 'verbatim' }),
): Promise<Address> {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(host);
    let addresses: Address[];
    try {
        addresses = family ? [{ address: host, family }] : await resolve(host);
    } catch {
        throw new ProductPreviewError(
            'The product website could not be reached.',
            502,
        );
    }
    if (
        !addresses.length ||
        addresses.some(
            (entry) =>
                !isPublicAddress(entry.address) ||
                isIP(entry.address) !== entry.family,
        )
    )
        throw new ProductPreviewError(
            'This website resolves to a private or unsupported network address.',
        );
    return addresses.find((entry) => entry.family === 4) || addresses[0];
}

export async function fetchPublicResource(
    input: string,
    kind: 'html' | 'image',
    dependencies: FetchDependencies = {},
): Promise<Resource> {
    const deadline = Date.now() + TIMEOUT_MS;
    const maxBytes = kind === 'html' ? HTML_LIMIT : IMAGE_LIMIT;
    let url = publicProductUrl(input);
    for (let redirects = 0; redirects <= 4; redirects++) {
        const address = await withinDeadline(
            resolvePublicAddress(url, dependencies.resolve),
            deadline,
        );
        const response = await new Promise<Resource | { redirect: string }>(
            (resolve, reject) => {
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    reject(
                        new ProductPreviewError(
                            'The product website took too long to respond.',
                            504,
                        ),
                    );
                    return;
                }
                const pinnedLookup: LookupFunction = (
                    _hostname,
                    options,
                    callback,
                ) => {
                    if (options.all) callback(null, [address]);
                    else callback(null, address.address, address.family);
                };
                const request = (dependencies.request || httpsRequest)(
                    url,
                    {
                        method: 'GET',
                        agent: false,
                        lookup: pinnedLookup,
                        family: address.family,
                        maxHeaderSize: 32 * 1024,
                        headers: {
                            'User-Agent':
                                'MyStuff/1.0 (personal product preview)',
                            Accept:
                                kind === 'html'
                                    ? 'text/html,application/xhtml+xml'
                                    : 'image/avif,image/webp,image/png,image/jpeg,image/gif',
                            'Accept-Encoding': 'identity',
                        },
                    },
                    (incoming) => {
                        const status = incoming.statusCode || 0;
                        if ([301, 302, 303, 307, 308].includes(status)) {
                            const location = incoming.headers.location;
                            incoming.destroy();
                            if (!location)
                                reject(
                                    new ProductPreviewError(
                                        'The product website returned an invalid redirect.',
                                        502,
                                    ),
                                );
                            else resolve({ redirect: location });
                            return;
                        }
                        if (status < 200 || status >= 300) {
                            incoming.destroy();
                            reject(
                                new ProductPreviewError(
                                    'This website did not allow a public preview. You can add the item manually.',
                                    422,
                                ),
                            );
                            return;
                        }
                        const contentType = String(
                            incoming.headers['content-type'] || '',
                        )
                            .split(';')[0]
                            .trim()
                            .toLowerCase();
                        const encoding = incoming.headers['content-encoding'];
                        if (
                            (encoding && encoding !== 'identity') ||
                            (kind === 'html' &&
                                ![
                                    'text/html',
                                    'application/xhtml+xml',
                                ].includes(contentType))
                        ) {
                            incoming.destroy();
                            reject(
                                new ProductPreviewError(
                                    'This link did not return a supported public product page.',
                                    422,
                                ),
                            );
                            return;
                        }
                        if (
                            Number(incoming.headers['content-length'] || 0) >
                            maxBytes
                        ) {
                            incoming.destroy();
                            reject(
                                new ProductPreviewError(
                                    'The website response is larger than the import limit.',
                                    413,
                                ),
                            );
                            return;
                        }
                        let size = 0;
                        const chunks: Buffer[] = [];
                        incoming.on('data', (chunk: Buffer) => {
                            size += chunk.length;
                            if (size > maxBytes) {
                                reject(
                                    new ProductPreviewError(
                                        'The website response is larger than the import limit.',
                                        413,
                                    ),
                                );
                                incoming.destroy();
                                return;
                            }
                            chunks.push(chunk);
                        });
                        incoming.on('end', () =>
                            resolve({
                                bytes: Buffer.concat(chunks),
                                contentType,
                                url: url.href,
                            }),
                        );
                        incoming.on('error', () =>
                            reject(
                                new ProductPreviewError(
                                    'The website response could not be read.',
                                    502,
                                ),
                            ),
                        );
                        incoming.on('aborted', () =>
                            reject(
                                new ProductPreviewError(
                                    'The website response was interrupted.',
                                    502,
                                ),
                            ),
                        );
                    },
                );
                const timer = setTimeout(
                    () =>
                        request.destroy(
                            new ProductPreviewError(
                                'The product website took too long to respond.',
                                504,
                            ),
                        ),
                    remaining,
                );
                request.on('close', () => clearTimeout(timer));
                request.on('error', (error) =>
                    reject(
                        error instanceof ProductPreviewError
                            ? error
                            : new ProductPreviewError(
                                  'The product website could not be reached securely.',
                                  502,
                              ),
                    ),
                );
                request.end();
            },
        );
        if ('bytes' in response) return response;
        if (redirects === 4)
            throw new ProductPreviewError(
                'The product website redirected too many times.',
                422,
            );
        url = publicProductUrl(response.redirect, url.href);
    }
    throw new ProductPreviewError(
        'The product website could not be reached.',
        502,
    );
}

function decodeText(input: string): string {
    return input.replace(
        /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
        (whole, entity: string) => {
            const named: Record<string, string> = {
                amp: '&',
                quot: '"',
                apos: "'",
                lt: '<',
                gt: '>',
                nbsp: ' ',
            };
            if (entity[0] !== '#') return named[entity.toLowerCase()] || whole;
            const code =
                entity[1].toLowerCase() === 'x'
                    ? parseInt(entity.slice(2), 16)
                    : Number(entity.slice(1));
            return code > 0 &&
                code <= 0x10ffff &&
                !(code >= 0xd800 && code <= 0xdfff)
                ? String.fromCodePoint(code)
                : '';
        },
    );
}

function plainText(input: unknown, max: number): string {
    if (typeof input !== 'string' && typeof input !== 'number') return '';
    return decodeText(String(input).replace(/<[^>]*>/g, ' '))
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function object(input: unknown): JsonObject | null {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
        ? (input as JsonObject)
        : null;
}

function structuredText(input: unknown, max = 160): string {
    const record = object(input);
    return plainText(record ? (record.name ?? record.value) : input, max);
}

function attributes(tag: string): Record<string, string> {
    const result: Record<string, string> = Object.create(null);
    const matcher = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    for (const match of tag.matchAll(matcher))
        result[match[1].toLowerCase()] = decodeText(
            match[2] ?? match[3] ?? match[4],
        );
    return result;
}

function pageMetadata(html: string) {
    const meta: Record<string, string[]> = Object.create(null);
    const documents: unknown[] = [];
    let title = '';
    const tags =
        /<!--[\s\S]*?(?:-->|$)|<(script|style|title|meta)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = tags.exec(html))) {
        if (!match[1]) continue;
        const tag = match[1].toLowerCase();
        const attrs = attributes(match[2]);
        if (tag === 'meta') {
            const key = (attrs.property || attrs.name || '').toLowerCase();
            if (key && attrs.content) (meta[key] ||= []).push(attrs.content);
            continue;
        }
        const closing = new RegExp(`</${tag}\\s*>`, 'gi');
        closing.lastIndex = tags.lastIndex;
        const end = closing.exec(html);
        if (!end) break;
        const content = html.slice(tags.lastIndex, end.index);
        tags.lastIndex = closing.lastIndex;
        if (tag === 'title' && !title) title = plainText(content, 200);
        if (
            tag === 'script' &&
            attrs.type?.toLowerCase().split(';')[0].trim() ===
                'application/ld+json' &&
            documents.length < 40
        ) {
            try {
                documents.push(JSON.parse(content));
            } catch {
                /* Ignore broken metadata blocks. */
            }
        }
    }
    return { meta, documents, title };
}

function productRecords(documents: unknown[]): JsonObject[] {
    const products: JsonObject[] = [];
    const pending = documents.map((value) => ({ value, depth: 0 }));
    let visited = 0;
    while (pending.length && visited++ < 2000) {
        const current = pending.shift()!;
        if (current.depth > 8) continue;
        if (Array.isArray(current.value)) {
            for (const value of current.value.slice(0, 100))
                pending.push({ value, depth: current.depth + 1 });
            continue;
        }
        const record = object(current.value);
        if (!record) continue;
        const types = Array.isArray(record['@type'])
            ? record['@type']
            : [record['@type']];
        if (
            types.some(
                (type) =>
                    typeof type === 'string' && /(?:^|[/#])Product$/.test(type),
            )
        )
            products.push(record);
        for (const key of [
            '@graph',
            'mainEntity',
            'itemListElement',
            'item',
            'hasVariant',
        ]) {
            if (record[key])
                pending.push({ value: record[key], depth: current.depth + 1 });
        }
    }
    return products;
}

export function parseProductMetadata(html: string, pageUrl: string): Metadata {
    const url = publicProductUrl(pageUrl).href;
    const { meta, documents, title } = pageMetadata(html.slice(0, HTML_LIMIT));
    const products = productRecords(documents);
    const product =
        products.find((record) => {
            try {
                return (
                    publicProductUrl(record.url ?? record['@id'], url).href ===
                    url
                );
            } catch {
                return false;
            }
        }) || products[0];
    const name =
        structuredText(product?.name, 200) ||
        plainText(meta['og:title']?.[0] || title, 200);
    if (!name)
        throw new ProductPreviewError(
            'No product information was found. You can add this item manually.',
            422,
        );
    const description = plainText(
        product?.description ||
            meta['og:description']?.[0] ||
            meta.description?.[0] ||
            '',
        3000,
    );
    const item: Partial<WardrobeItem> = {
        name,
        productUrl: url,
        notes: description,
        category:
            inferCategory(`${name} ${structuredText(product?.category)}`) ===
            'other'
                ? inferCategory(description)
                : inferCategory(`${name} ${structuredText(product?.category)}`),
    };
    const brand = structuredText(product?.brand);
    if (brand) item.brand = brand;
    const colour = structuredText(product?.color);
    const size = structuredText(product?.size);
    if (colour) item.colour = colour;
    if (size) item.size = size;
    const details: Array<{ label: string; value: string }> = [];
    for (const [key, label] of [
        ['sku', 'Product reference'],
        ['model', 'Model'],
        ['material', 'Material'],
    ] as const) {
        const value = structuredText(product?.[key], 1000);
        if (value) details.push({ label, value });
    }
    const properties = product?.additionalProperty;
    for (const raw of (Array.isArray(properties)
        ? properties
        : [properties]
    ).slice(0, 24)) {
        const property = object(raw);
        if (!property) continue;
        const label = structuredText(property.name, 100);
        const value = structuredText(property.value, 1000);
        if (
            label &&
            value &&
            !details.some(
                (detail) => detail.label.toLowerCase() === label.toLowerCase(),
            )
        )
            details.push({ label, value });
    }
    if (details.length) item.details = details;
    const candidates: unknown[] = Array.isArray(product?.image)
        ? [...product.image]
        : [product?.image];
    candidates.push(
        ...(meta['og:image'] || []),
        ...(meta['og:image:url'] || []),
    );
    const images: string[] = [];
    for (const candidate of candidates.slice(0, 40)) {
        const record = object(candidate);
        try {
            const image = publicProductUrl(
                record ? record.contentUrl || record.url : candidate,
                url,
            ).href;
            if (!images.includes(image)) images.push(image);
        } catch {
            /* Invalid or local image links are never fetched. */
        }
        if (images.length === IMAGE_COUNT) break;
    }
    const warnings = [
        'Review the product version, colour and size before saving. Photos are page references until you confirm a match.',
    ];
    if (!product)
        warnings.push(
            'This page has limited product metadata; its title and description may need editing.',
        );
    if (products.length > 1)
        warnings.push(
            'This page describes multiple products or variants. Check the selected details carefully.',
        );
    return { item, images, warnings };
}

export function imageContentType(bytes: Uint8Array): string | null {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (
        Buffer.from(bytes.subarray(0, 8)).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
    )
        return 'image/png';
    const start = Buffer.from(bytes.subarray(0, 32)).toString('latin1');
    if (/^GIF8[79]a/.test(start)) return 'image/gif';
    if (start.startsWith('RIFF') && start.slice(8, 12) === 'WEBP')
        return 'image/webp';
    if (start.slice(4, 8) === 'ftyp' && /avif|avis/.test(start.slice(8)))
        return 'image/avif';
    return null;
}

export async function previewProduct(
    input: string,
    saveImage: (id: string, bytes: Uint8Array, type: string) => Promise<void>,
    fetchResource = fetchPublicResource,
): Promise<{ item: Partial<WardrobeItem>; warnings: string[] }> {
    const page = await fetchResource(input, 'html');
    const preview = parseProductMetadata(page.bytes.toString('utf8'), page.url);
    const photos: ProductPhoto[] = [];
    const resources = await Promise.allSettled(
        preview.images.map((image) => fetchResource(image, 'image')),
    );
    let failed = 0;
    for (const result of resources) {
        try {
            if (result.status === 'rejected') throw result.reason;
            const resource = result.value;
            const type = imageContentType(resource.bytes);
            if (!type || resource.bytes.length > IMAGE_LIMIT)
                throw new ProductPreviewError('Unsupported product photo.');
            const id = `product-${createHash('sha256').update(resource.bytes).digest('hex').slice(0, 40)}`;
            if (photos.some((photo) => photo.imageId === id)) continue;
            await saveImage(id, resource.bytes, type);
            photos.push({
                imageId: id,
                kind: 'product',
                alt: `${preview.item.name?.slice(0, 190)} — product page reference; owned version not yet confirmed.`,
                sourceUrl: resource.url,
                referenceConfirmed: false,
            });
        } catch {
            failed++;
        }
    }
    preview.item.photos = photos;
    preview.item.imageId = photos[0]?.imageId || null;
    if (!photos.length)
        preview.warnings.push(
            'No supported product photos could be imported. You can upload your own photo.',
        );
    else if (failed)
        preview.warnings.push(
            `${failed} product photo${failed === 1 ? '' : 's'} could not be imported.`,
        );
    return { item: preview.item, warnings: preview.warnings };
}

export async function readPreviewInput(request: Request): Promise<string> {
    if (Number(request.headers.get('content-length') || 0) > 8192)
        throw new ProductPreviewError('The preview request is too large.', 413);
    const reader = request.body?.getReader();
    if (!reader)
        throw new ProductPreviewError('Paste a product link to preview.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8192) {
                await reader.cancel();
                throw new ProductPreviewError(
                    'The preview request is too large.',
                    413,
                );
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    let body: unknown;
    try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new ProductPreviewError('Send a product link as a JSON object.');
    }
    return publicProductUrl(object(body)?.url).href;
}
