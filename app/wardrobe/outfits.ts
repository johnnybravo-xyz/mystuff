import {
    colourFamily,
    isAvailable,
    stylingAccessoryKind,
    supportsStyling,
} from './model';
import type {
    Category,
    Occasion,
    Owner,
    Temperature,
    WardrobeItem,
} from './model';

export type StyleSource = { title: string; publisher: string; url: string };
export const styleSources = {
    texture: {
        publisher: 'Permanent Style',
        title: 'Jackets with denim',
        url: 'https://www.permanentstyle.com/2015/10/wearing-a-jacket-and-jeans.html',
    },
    summer: {
        publisher: 'Permanent Style',
        title: 'Dressing for summer',
        url: 'https://www.permanentstyle.com/2016/06/how-to-dress-for-summer-reader-question.html',
    },
    green: {
        publisher: 'Permanent Style',
        title: 'Working with olive',
        url: 'https://www.permanentstyle.com/2022/05/introducing-the-olive-overshirt-and-summer-restocks.html',
    },
    balance: {
        publisher: 'Permanent Style',
        title: 'High/low dressing',
        url: 'https://www.permanentstyle.com/2017/12/highlow-dressing.html',
    },
    proportion: {
        publisher: 'Permanent Style',
        title: 'Patience and proportion',
        url: 'https://www.permanentstyle.com/2025/11/patience-and-proportion-how-to-dress-like-illya-sobtchak.html',
    },
    neutrals: {
        publisher: 'Drake’s',
        title: 'Neutral Territory',
        url: 'https://us.drakes.com/blogs/news/neutral-territory-how-to-wear-a-fresh-palette-for-summer',
    },
    pattern: {
        publisher: 'Drake’s',
        title: 'Dressing High and Low',
        url: 'https://us.drakes.com/blogs/news/dressing-high-and-low',
    },
    polish: {
        publisher: 'Drake’s',
        title: 'The Easy Suit',
        url: 'https://us.drakes.com/blogs/news/the-easy-suit',
    },
    polo: {
        publisher: 'Drake’s',
        title: 'A guide to the polo shirt',
        url: 'https://us.drakes.com/blogs/news/pique-performance-a-guide-to-the-polo-shirt',
    },
} satisfies Record<string, StyleSource>;
export type OutfitIdea = {
    key: string;
    name: string;
    items: WardrobeItem[];
    explanation: string;
    weatherNote: string;
    wearNote: string;
    sources: StyleSource[];
    score: number;
    missing: string[];
    occasion: Occasion;
    temperature: Temperature;
};
const tops: Category[] = ['shirt', 'tshirt', 'polo', 'knitwear'];
const bottoms: Category[] = ['jeans', 'trousers', 'shorts', 'skirt'];
const onePiece: Category[] = ['dress', 'set'];
const core = (item: WardrobeItem) =>
    tops.includes(item.category) ||
    bottoms.includes(item.category) ||
    onePiece.includes(item.category);
const visible = (item: WardrobeItem) =>
    core(item) || ['jacket', 'shoes'].includes(item.category);
const describe = (item: WardrobeItem) =>
    `${item.name} ${item.pattern}`.toLowerCase();

export function outfitColour(value: string) {
    const colour = value.trim().toLowerCase();
    const family = colourFamily(colour);
    const known =
        !/unknown|unrecorded|unspecified|to confirm|multi.?colou?r|assorted/.test(
            colour,
        ) && !['unknown', 'other'].includes(family);
    const depth = !known
        ? 'unknown'
        : /black|navy|midnight|charcoal|dark|forest|bottle|burgundy|chocolate/.test(
                colour,
            )
          ? 'dark'
          : /white|ivory|cream|ecru|sand|beige|light|pale|pastel/.test(colour)
            ? 'light'
            : 'mid';
    const neutral =
        known &&
        (['black', 'white', 'grey', 'blue', 'beige', 'brown'].includes(
            family,
        ) ||
            (family === 'green' &&
                /olive|khaki|dark|forest|sage|muted/.test(colour)));
    return { family, depth, known, neutral };
}
function paletteScore(a: WardrobeItem, b: WardrobeItem): number {
    const x = outfitColour(a.colour),
        y = outfitColour(b.colour);
    if (!x.known || !y.known) return -1;
    if (x.neutral && y.neutral)
        return x.depth !== y.depth ? 4 : x.family === y.family ? 0.5 : 2;
    if (x.neutral || y.neutral) return 2;
    return x.family === y.family ? 0 : -3;
}
function pattern(item: WardrobeItem) {
    const text = describe(item);
    const textured = /herringbone|tweed|corduroy|cable|waffle|ribbed/.test(
        text,
    );
    const bold =
        /floral|graphic|print|check|plaid|stripe|colour.?block|color.?block/.test(
            text,
        );
    return {
        textured,
        bold,
        quiet: !bold && (/plain|solid/.test(text) || textured),
    };
}
function formality(item: WardrobeItem) {
    const text = describe(item);
    if (item.category === 'shoes') {
        if (/loafer/.test(text)) return 2;
        if (/oxford|derby|dress shoe/.test(text)) return 3;
        if (/sandal|flip.?flop|slide/.test(text)) return 0;
        return 1;
    }
    if (item.category === 'jacket') {
        if (/puffer|padded|bomber|rain|windbreaker|denim/.test(text))
            return 0.5;
        if (/blazer|tailored|herringbone|tweed|sport.?coat/.test(text))
            return 3;
        return 1;
    }
    if (item.category === 'shirt') return 2.5;
    if (item.category === 'polo') return 2;
    if (item.category === 'trousers') return 3;
    if (['dress', 'skirt', 'set'].includes(item.category)) return 2;
    if (['jeans', 'knitwear'].includes(item.category)) return 1;
    return 0;
}
function thermalScore(item: WardrobeItem, temperature: Temperature) {
    if (temperature === 'warm')
        return item.warmth === 'light'
            ? 2
            : item.warmth === 'medium'
              ? -5
              : -12;
    if (temperature === 'cool') return item.warmth === 'light' ? 0 : 2;
    return item.warmth === 'warm' ? -3 : 1;
}
function garmentScore(
    item: WardrobeItem,
    occasion: Occasion,
    temperature: Temperature,
) {
    const weights: Record<Occasion, Partial<Record<Category, number>>> = {
        everyday: {
            tshirt: 9,
            polo: 6,
            shirt: 4,
            knitwear: 5,
            jeans: 8,
            shorts: 7,
            trousers: 4,
            skirt: 7,
            dress: 8,
            set: 8,
        },
        smart: {
            tshirt: 2,
            polo: 9,
            shirt: 8,
            knitwear: 5,
            jeans: 6,
            shorts: 2,
            trousers: 8,
            skirt: 8,
            dress: 8,
            set: 7,
        },
        dapper: {
            tshirt: 0,
            polo: 5,
            shirt: 11,
            knitwear: 3,
            jeans: 5,
            shorts: 0,
            trousers: 10,
            skirt: 8,
            dress: 9,
            set: 8,
        },
    };
    return (
        (weights[occasion][item.category] || 0) +
        thermalScore(item, temperature) +
        (item.favourite ? 0.5 : 0)
    );
}
function garmentPairs(items: WardrobeItem[]) {
    let score = 0;
    for (let a = 0; a < items.length; a++)
        for (let b = a + 1; b < items.length; b++) {
            const x = items[a],
                y = items[b],
                px = pattern(x),
                py = pattern(y);
            score += paletteScore(x, y);
            if (px.bold && py.bold) score -= 4;
            if ((px.textured && py.quiet) || (py.textured && px.quiet))
                score += 2;
            if (x.category === 'jacket' || y.category === 'jacket') {
                const layer = x.category === 'jacket' ? x : y;
                const other = layer === x ? y : x;
                if (other.category === 'jeans')
                    score +=
                        pattern(layer).textured && formality(layer) >= 2
                            ? 4
                            : formality(layer) >= 3
                              ? -3
                              : 0;
                if (
                    tops.includes(other.category) &&
                    /slim/i.test(layer.fit) &&
                    /oversized/i.test(other.fit)
                )
                    score -= 3;
            }
        }
    return score;
}
function shoeScore(
    shoe: WardrobeItem,
    base: WardrobeItem[],
    occasion: Occasion,
    temperature: Temperature,
) {
    const target = occasion === 'dapper' ? 2.5 : occasion === 'smart' ? 2 : 1;
    const formal = formality(shoe);
    const palette = base.filter(core).map((item) => paletteScore(shoe, item));
    let score =
        5 -
        Math.abs(formal - target) * 3 +
        palette.reduce((a, b) => a + b, 0) / Math.max(1, palette.length);
    if (
        base.some(
            (item) => item.category === 'jacket' && formality(item) >= 3,
        ) &&
        formal === 0
    )
        score -= 5;
    if (temperature === 'warm' && /insulated|winter/.test(describe(shoe)))
        score -= 8;
    return score;
}
function layerScore(
    layer: WardrobeItem,
    base: WardrobeItem[],
    occasion: Occasion,
    temperature: Temperature,
) {
    if (temperature === 'warm') return -20 + thermalScore(layer, temperature);
    const dress = formality(layer);
    return (
        thermalScore(layer, temperature) +
        (temperature === 'cool' ? 6 : -2) +
        (occasion === 'dapper' ? dress * 2 : occasion === 'smart' ? dress : 0) +
        (garmentPairs([...base, layer]) - garmentPairs(base)) / 2
    );
}
function rank(items: WardrobeItem[], score: (item: WardrobeItem) => number) {
    return [...items].sort(
        (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
    );
}
function role(item: WardrobeItem) {
    return tops.includes(item.category)
        ? 'top'
        : bottoms.includes(item.category)
          ? 'bottom'
          : onePiece.includes(item.category)
            ? 'one-piece'
            : item.category === 'accessory'
              ? `accessory:${stylingAccessoryKind(item)}`
              : item.category;
}

export function describeOutfit(
    items: WardrobeItem[],
    occasion: Occasion,
    temperature: Temperature,
): OutfitIdea {
    const garments = items.filter(core),
        clothing = items.filter(
            (item) => core(item) || item.category === 'jacket',
        );
    const top = garments.find((item) => tops.includes(item.category));
    const bottom = garments.find((item) => bottoms.includes(item.category));
    const layer = items.find((item) => item.category === 'jacket');
    const shoe = items.find((item) => item.category === 'shoes');
    const accessory = items.find((item) => item.category === 'accessory');
    const single = garments.some((item) => onePiece.includes(item.category));
    const missing = [
        ...(!single && !top ? ['a top'] : []),
        ...(!single && !bottom ? ['a bottom'] : []),
        ...(!shoe ? ['footwear'] : []),
    ];
    const colours = items
        .filter(visible)
        .map((item) => outfitColour(item.colour));
    const unknown = colours.some((colour) => !colour.known);
    const contrast =
        garments.length > 1 &&
        garments.every((item) => outfitColour(item.colour).known) &&
        new Set(garments.map((item) => outfitColour(item.colour).depth)).size >
            1;
    const mutedGreen = garments.some((item) => {
        const colour = outfitColour(item.colour);
        return colour.family === 'green' && colour.neutral;
    });
    const texture = Boolean(
        layer &&
        pattern(layer).textured &&
        bottom?.category === 'jeans' &&
        formality(layer) >= 2,
    );
    const busyPatterns = clothing.filter((item) => pattern(item).bold).length;
    const sources: StyleSource[] = [];
    const addSource = (key: keyof typeof styleSources) => {
        if (!sources.includes(styleSources[key]))
            sources.push(styleSources[key]);
    };
    const reasons: string[] = [];
    if (contrast) {
        reasons.push(
            `${garments[0].colour} and ${garments[1].colour} give the core pieces a light–dark contrast.`,
        );
        addSource('neutrals');
    } else if (mutedGreen) {
        reasons.push(
            'The recorded muted green works as a quiet neutral alongside the other pieces.',
        );
        addSource('green');
    } else if (garments.length > 1 && !unknown) {
        const accents = garments.filter(
            (item) => !outfitColour(item.colour).neutral,
        ).length;
        reasons.push(
            accents > 1
                ? 'Several strong colours share this combination; compare them together in daylight.'
                : accents === 1
                  ? 'One stronger colour gives the quieter base a focal point.'
                  : 'The recorded neutral colours make a quiet starting point; compare similar shades in daylight.',
        );
        addSource(accents > 1 ? 'pattern' : 'neutrals');
    }
    if (texture) {
        reasons.push(
            'The jacket’s recorded texture connects its tailoring to the denim.',
        );
        addSource('texture');
    } else if (top?.category === 'polo') {
        reasons.push(
            'The polo collar adds a little polish to the casual base.',
        );
        addSource('polo');
    } else if (top?.category === 'shirt' && occasion !== 'everyday') {
        reasons.push('The shirt gives these separates a collared focal point.');
        addSource('balance');
    } else if (!reasons.length)
        reasons.push(
            single
                ? 'A one-piece base keeps the combination simple.'
                : 'An easy base built from the garment types you have recorded.',
        );
    const texturedPiece = clothing.find((item) => pattern(item).textured);
    if (
        texturedPiece &&
        clothing.some(
            (item) => item !== texturedPiece && pattern(item).quiet,
        ) &&
        busyPatterns === 0
    ) {
        reasons.push('Quiet companions leave the texture as the focus.');
        addSource('pattern');
    }
    if (busyPatterns > 1)
        reasons.push(
            'There is more than one strong pattern; check their scale together before wearing.',
        );
    if (shoe)
        reasons.push(
            formality(shoe) >= 2
                ? 'The selected shoes give the casual separates a more polished finish.'
                : 'The selected footwear keeps the finish casual.',
        );
    if (unknown)
        reasons.push(
            'Some colours are still unknown; check them together before wearing.',
        );
    if (missing.length)
        reasons.push(
            `Not yet recorded for this combination: ${missing.join(' and ')}.`,
        );
    if (items.some((item) => item.category === 'fragrance'))
        reasons.push(
            'Your selected fragrance is an optional finishing touch; the pairing is based on the clothes.',
        );
    const weatherNote =
        temperature === 'warm'
            ? layer
                ? 'Keep the selected jacket optional for a cooler indoor setting; leave it off outside in warm weather.'
                : clothing.some((item) => item.warmth !== 'light')
                  ? 'A recorded medium or warm piece may feel too warm outdoors; check comfort before choosing this combination.'
                  : 'Warm day: keep the layers off and check that the actual fabric feels comfortable outdoors.'
            : temperature === 'cool'
              ? layer
                  ? 'Cooler evening: the layer is removable. Check comfort indoors and the forecast before heading out.'
                  : 'Cooler evening: no suitable outer layer is included; check whether the recorded clothes feel warm enough.'
              : layer
                ? 'Mild day: use the jacket as a removable layer for a cooler evening or air conditioning.'
                : 'Mild day: start without an outer layer and adjust to how the room or evening feels.';
    if (temperature === 'warm') addSource('summer');
    const fitKnown = top?.fit && bottom?.fit;
    let wearNote =
        top?.category === 'shirt' || top?.category === 'polo'
            ? 'Try a tuck only if the top length and waistband allow it; compare tucked and untucked in the mirror.'
            : fitKnown
              ? `Recorded fits: ${top!.fit} top and ${bottom!.fit} bottom. Check their balance together and the hem over your shoes.`
              : 'Check the actual fit and hem over your shoes; no cut, rise or body measurements are assumed.';
    if (top && layer && /slim/i.test(layer.fit) && /oversized/i.test(top.fit))
        wearNote +=
            ' The oversized top may bunch under the recorded slim layer.';
    if (accessory)
        wearNote += ` ${accessory.name} is an optional finishing detail.`;
    if (!sources.length)
        addSource(temperature === 'warm' ? 'summer' : 'proportion');
    const names = garments
        .filter((item) => outfitColour(item.colour).known)
        .slice(0, 2)
        .map((item) => item.colour);
    const name =
        names.length === 2 && names.join(' + ').length <= 120
            ? names.join(' + ')
            : texture
              ? 'Texture with denim'
              : top?.category === 'polo'
                ? 'A collared everyday'
                : occasion === 'dapper'
                  ? 'Considered separates'
                  : single
                    ? 'An easy one-piece'
                    : 'A simple rotation';
    const score =
        (garments.reduce(
            (sum, item) => sum + garmentScore(item, occasion, temperature),
            0,
        ) /
            Math.max(1, garments.length)) *
            2 +
        garmentPairs(clothing) -
        missing.length * 7 +
        (shoe ? shoeScore(shoe, garments, occasion, temperature) : 0) +
        (layer ? layerScore(layer, garments, occasion, temperature) : 0);
    const primarySource =
        temperature === 'warm'
            ? styleSources.summer
            : texture
              ? styleSources.texture
              : sources[0];
    const selectedSources = [
        primarySource,
        ...sources.filter((source) => source !== primarySource),
    ].slice(0, 2);
    return {
        key: items
            .map((item) => item.id)
            .sort()
            .join('|'),
        name,
        items,
        explanation: reasons.join(' '),
        weatherNote,
        wearNote,
        sources: selectedSources,
        score,
        missing,
        occasion,
        temperature,
    };
}

export function makeOutfitIdeas(
    items: WardrobeItem[],
    owner: Owner,
    occasion: Occasion,
    temperature: Temperature,
    anchorId = '',
    offset = 0,
): OutfitIdea[] {
    const available = items.filter(
        (item) => isAvailable(item, owner) && supportsStyling(item),
    );
    const anchor = available.find((item) => item.id === anchorId);
    if (anchorId && !anchor) return [];
    const candidates = (categories: Category[], limit = 30) => {
        const result = rank(
            available.filter((item) => categories.includes(item.category)),
            (item) => garmentScore(item, occasion, temperature),
        ).slice(0, limit);
        if (
            anchor &&
            categories.includes(anchor.category) &&
            !result.includes(anchor)
        )
            result.push(anchor);
        return result;
    };
    const topItems = candidates(tops),
        bottomItems = candidates(bottoms),
        singles = candidates(onePiece);
    let bases = [
        ...singles.map((item) => [item]),
        ...topItems.flatMap((top) =>
            bottomItems.map((bottom) => [top, bottom]),
        ),
    ];
    if (!bases.length)
        bases = [...topItems, ...bottomItems].map((item) => [item]);
    if (anchor && core(anchor))
        bases = bases.filter((base) => base.includes(anchor));
    const shoes = available.filter((item) => item.category === 'shoes');
    const layers = available.filter((item) => item.category === 'jacket');
    const belts = available.filter(
        (item) => stylingAccessoryKind(item) === 'belt',
    );
    const ideas = bases
        .map((base) => {
            const outfit = [...base];
            let layer = anchor?.category === 'jacket' ? anchor : undefined;
            if (
                !layer &&
                temperature !== 'warm' &&
                (temperature === 'cool' || occasion === 'dapper')
            ) {
                const options = layers.filter(
                    (item) =>
                        temperature === 'cool' ||
                        (formality(item) >= 2.5 && item.warmth !== 'warm'),
                );
                const best = rank(options, (item) =>
                    layerScore(item, base, occasion, temperature),
                )[0];
                if (best && layerScore(best, base, occasion, temperature) > 0)
                    layer = best;
            }
            if (layer) outfit.push(layer);
            const shoe =
                anchor?.category === 'shoes'
                    ? anchor
                    : rank(shoes, (item) =>
                          shoeScore(item, outfit, occasion, temperature),
                      )[0];
            if (shoe) outfit.push(shoe);
            if (anchor && ['accessory', 'fragrance'].includes(anchor.category))
                outfit.push(anchor);
            else if (
                occasion !== 'everyday' &&
                base.some((item) =>
                    ['jeans', 'trousers'].includes(item.category),
                ) &&
                shoe
            ) {
                const belt = rank(
                    belts.filter(
                        (item) =>
                            outfitColour(item.colour).known &&
                            paletteScore(item, shoe) >= 0,
                    ),
                    (item) =>
                        colourFamily(item.colour) === colourFamily(shoe.colour)
                            ? 3
                            : paletteScore(item, shoe),
                )[0];
                if (belt) outfit.push(belt);
            }
            return describeOutfit(outfit, occasion, temperature);
        })
        .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    const unique = [...new Map(ideas.map((idea) => [idea.key, idea])).values()];
    if (!unique.length) return [];
    const start =
        ((Math.trunc(offset) % unique.length) + unique.length) % unique.length;
    const pool = [...unique.slice(start), ...unique.slice(0, start)];
    const selected = [pool.shift()!];
    while (selected.length < 3 && pool.length) {
        const diversityScore = (idea: OutfitIdea) =>
            idea.score -
            selected.reduce(
                (penalty, chosen) =>
                    penalty +
                    idea.items
                        .filter(core)
                        .filter(
                            (item) =>
                                item.id !== anchorId &&
                                chosen.items.some(
                                    (other) => other.id === item.id,
                                ),
                        ).length *
                        9,
                0,
            );
        pool.sort(
            (a, b) =>
                diversityScore(b) - diversityScore(a) ||
                a.key.localeCompare(b.key),
        );
        selected.push(pool.shift()!);
    }
    return selected;
}

export function swapCandidates(
    items: WardrobeItem[],
    owner: Owner,
    item: WardrobeItem,
    currentIds: string[],
    occasion: Occasion = 'everyday',
    temperature: Temperature = 'mild',
): WardrobeItem[] {
    const companions = items.filter(
        (candidate) =>
            currentIds.includes(candidate.id) &&
            candidate.id !== item.id &&
            isAvailable(candidate, owner) &&
            supportsStyling(candidate),
    );
    return rank(
        items.filter(
            (candidate) =>
                isAvailable(candidate, owner) &&
                supportsStyling(candidate) &&
                role(candidate) === role(item) &&
                !currentIds.includes(candidate.id),
        ),
        (candidate) =>
            describeOutfit([...companions, candidate], occasion, temperature)
                .score,
    );
}
