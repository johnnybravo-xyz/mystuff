import {
    categoryLabels,
    collectionFor,
    collectionLabels,
    isAvailable,
    itemPhotos,
    ownerLabels,
    photoKindLabels,
} from './model';
import type { Category, Collection, OwnerFilter, WardrobeItem } from './model';

export type ExportOptions = {
    owner: OwnerFilter;
    collection: Collection;
    categories: 'all' | Category[];
    profileLabels?: Record<string, string>;
    title?: string;
};
export type ExportFormat = 'markdown' | 'html';

export function selectExportItems(
    items: WardrobeItem[],
    options: ExportOptions,
) {
    return items
        .filter(
            (item) =>
                isAvailable(item, item.owner) &&
                (options.owner === 'all' || item.owner === options.owner) &&
                (options.collection === 'all' ||
                    collectionFor(item.category) === options.collection) &&
                (options.categories === 'all' ||
                    options.categories.includes(item.category)),
        )
        .sort((a, b) => {
            const key = (item: WardrobeItem) =>
                `${collectionLabels[collectionFor(item.category)]}\0${categoryLabels[item.category]}\0${item.brand}\0${item.name}\0${item.id}`;
            return key(a).localeCompare(key(b), 'en');
        });
}

function cleanText(value: string): string {
    return Array.from(value)
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
        })
        .join('')
        .trim();
}

function html(value: string): string {
    return cleanText(value).replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[character]!,
    );
}

function markdown(value: string): string {
    return cleanText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');
}

function publicUrl(value?: string | null): string | null {
    if (
        !value ||
        Array.from(value).some(
            (character) =>
                character.charCodeAt(0) <= 32 ||
                character.charCodeAt(0) === 127,
        )
    )
        return null;
    try {
        const url = new URL(value);
        if (
            !['https:', 'http:'].includes(url.protocol) ||
            url.username ||
            url.password
        )
            return null;
        // Downloads must not contain session-dependent archive image endpoints.
        if (/^\/api(?:\/|$)/i.test(decodeURIComponent(url.pathname)))
            return null;
        return url.href;
    } catch {
        return null;
    }
}

function itemLinks(item: WardrobeItem) {
    const links: Array<{ label: string; url: string }> = [];
    function add(label: string, value?: string | null) {
        const url = publicUrl(value);
        if (url && !links.some((link) => link.url === url))
            links.push({ label, url });
    }
    add('Product page', item.productUrl);
    add('Original product page', item.facts?.productUrl);
    for (const photo of itemPhotos(item)) {
        const label =
            photo.referenceConfirmed === false
                ? 'Reference photo — exact variant unconfirmed'
                : `${photoKindLabels[photo.kind]} photo source`;
        add(photo.alt ? `${label}: ${photo.alt}` : label, photo.sourceUrl);
    }
    add('Original image source', item.facts?.sourceImageUrl);
    return links;
}

function itemDetails(item: WardrobeItem, options: ExportOptions) {
    const details: Array<{ label: string; value: string }> = [];
    function add(label: string, value?: string | number | null) {
        if (value !== undefined && value !== null && String(value).trim())
            details.push({ label, value: String(value) });
    }
    add('Brand', item.brand);
    add('Owner', options.profileLabels?.[item.owner] || ownerLabels[item.owner] || 'Unassigned');
    add('Status', 'Owned');
    add('Colour', item.colour);
    add('Size', item.size);
    add('Quantity', item.quantity);
    add('Fit', item.fit);
    add('Pattern', item.pattern);
    add('Location', item.location);
    if (item.favourite) add('Favourite', 'Yes');
    for (const detail of item.details || []) add(detail.label, detail.value);
    if (item.fragrance) {
        add('Concentration', item.fragrance.concentration);
        add('Fragrance family', item.fragrance.family);
        add('Fragrance notes', item.fragrance.notes);
        add(
            'Fragrance variant',
            item.fragrance.variantConfirmed ? 'Confirmed' : 'Unconfirmed',
        );
    }
    add('Vendor / shop', item.purchaseVendor);
    add('Purchase location', item.purchaseLocation);
    add('Retailer', item.facts?.retailer);
    add('Article / model', item.facts?.article);
    add('Purchase date', item.purchaseDate || item.facts?.orderDate);
    add('Notes', item.notes);
    return details;
}

function markdownLink(label: string, url: string): string {
    const destination = url
        .replace(/\\/g, '\\\\')
        .replace(/&/g, '&amp;')
        .replace(/[<>]/g, (character) => encodeURIComponent(character));
    return `[${markdown(label.replace(/\s+/g, ' '))}](<${destination}>)`;
}

export function buildArchiveExport(
    items: WardrobeItem[],
    options: ExportOptions,
    format: ExportFormat,
    date = new Date(),
) {
    const selected = selectExportItems(items, options);
    const day = date.toISOString().slice(0, 10);
    const owner =
        options.owner === 'all'
            ? 'Everyone'
            : options.profileLabels?.[options.owner] ||
              ownerLabels[options.owner] ||
              'Unassigned';
    const scope = `${collectionLabels[options.collection]} · ${owner}`;
    const categoryScope =
        options.categories === 'all'
            ? 'All categories'
            : options.categories
                  .map((category) => categoryLabels[category])
                  .join(', ') || 'No categories';
    const groups = new Map<string, WardrobeItem[]>();
    for (const item of selected) {
        const label = `${collectionLabels[collectionFor(item.category)]} · ${categoryLabels[item.category]}`;
        const group = groups.get(label) || [];
        group.push(item);
        groups.set(label, group);
    }
    const summary = `${selected.length} owned ${selected.length === 1 ? 'entry' : 'entries'} · Exported ${day}`;
    const explanation =
        'A snapshot of the items you own. Review, awaiting delivery, returned, retired, and outgrown items are excluded. Photos are linked to their available original sources; private archive images are not included.';
    let content: string;
    if (format === 'markdown') {
        const lines = [
            '# My Stuff',
            '',
            markdown(scope),
            '',
            markdown(categoryScope),
            '',
            markdown(summary),
            '',
            explanation,
            '',
        ];
        for (const [label, group] of groups) {
            lines.push(`## ${markdown(label)}`, '');
            for (const item of group) {
                lines.push(
                    `### ${markdown(item.name.replace(/\s+/g, ' '))}`,
                    '',
                );
                for (const detail of itemDetails(item, options)) {
                    const url = publicUrl(detail.value);
                    const value = url
                        ? markdownLink(detail.value, url)
                        : markdown(detail.value).replace(/\r?\n/g, '  \n  ');
                    lines.push(
                        `- **${markdown(detail.label.replace(/\s+/g, ' '))}:** ${value}`,
                    );
                }
                const links = itemLinks(item);
                if (links.length)
                    lines.push(
                        '',
                        ...links.map(
                            (link) => `- ${markdownLink(link.label, link.url)}`,
                        ),
                    );
                lines.push('');
            }
        }
        if (!selected.length)
            lines.push('No owned items match this selection.', '');
        content = lines.join('\n');
    } else {
        const navigation = [...groups.keys()]
            .map(
                (label, index) =>
                    `<a href="#category-${index}">${html(label)}</a>`,
            )
            .join('');
        const sections = [...groups]
            .map(
                ([label, group], index) =>
                    `<section id="category-${index}"><h2>${html(label)} <span>${group.length}</span></h2><div class="items">${group
                        .map((item) => {
                            const links = itemLinks(item);
                            return `<article><h3>${html(item.name)}</h3><dl>${itemDetails(
                                item,
                                options,
                            )
                                .map((detail) => {
                                    const url = publicUrl(detail.value);
                                    const value = url
                                        ? `<a href="${html(url)}" rel="noreferrer noopener">${html(detail.value)}</a>`
                                        : html(detail.value);
                                    return `<div><dt>${html(detail.label)}</dt><dd>${value}</dd></div>`;
                                })
                                .join(
                                    '',
                                )}</dl>${links.length ? `<ul class="sources">${links.map((link) => `<li><a href="${html(link.url)}" rel="noreferrer noopener">${html(link.label)}</a></li>`).join('')}</ul>` : ''}</article>`;
                        })
                        .join('')}</div></section>`,
            )
            .join('');
        content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>My Stuff — ${html(scope)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#202630;font:15px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:48px 24px}header{border-bottom:2px solid #45668f;padding-bottom:28px;margin-bottom:28px}.eyebrow{color:#45668f;font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}h1{font-size:48px;line-height:1.1;margin:12px 0}h2{font-size:24px;margin:32px 0 16px}h2 span{font-size:14px;color:#6d7785;font-weight:400}h3{font-size:20px;margin:0 0 18px}p{margin:10px 0}.muted,dt{color:#586575}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{background:#e7edf4;border-radius:6px;padding:7px 12px;font-size:13px;text-decoration:none}a{color:#34577f;overflow-wrap:anywhere}.items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}article{min-width:0;background:white;border:1px solid #dce2e9;border-radius:10px;padding:24px;break-inside:avoid}dl{margin:0}dl div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;margin:7px 0}dt{font-size:13px}dd{margin:0;white-space:pre-line;overflow-wrap:anywhere}.sources{border-top:1px solid #dce2e9;padding:14px 0 0 18px;margin:18px 0 0;font-size:13px}.sources li{margin:6px 0}footer{margin-top:36px;color:#586575;font-size:13px}h1,h2,h3,dt{overflow-wrap:anywhere}@media(max-width:620px){main{padding:28px 16px}h1{font-size:36px}.items{grid-template-columns:1fr}article{padding:20px}dl div{grid-template-columns:90px minmax(0,1fr)}}@media print{body{background:white}main{padding:0}nav{display:none}.items{display:block}article{margin-bottom:16px}a{color:inherit}h2{break-after:avoid}}
</style></head><body><main><header><div class="eyebrow">A personal inventory</div><h1>My Stuff.</h1><p>${html(scope)}</p><p class="muted">${html(categoryScope)}</p><p class="muted">${html(summary)}</p></header><nav aria-label="Exported categories">${navigation}</nav>${sections || '<p>No owned items match this selection.</p>'}<footer>${html(explanation)}</footer></main></body></html>`;
    }
    return {
        content,
        filename: `my-stuff-${options.collection}-${options.owner}-${day}.${format === 'html' ? 'html' : 'md'}`,
        mimeType:
            format === 'html'
                ? 'text/html;charset=utf-8'
                : 'text/markdown;charset=utf-8',
        count: selected.length,
    };
}
