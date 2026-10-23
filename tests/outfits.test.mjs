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
const { makeOutfitIdeas, swapCandidates, outfitColour, describeOutfit } =
    await import('../app/wardrobe/outfits.ts');
hook.deregister();
import {
    occasions,
    normalizeOccasion,
    supportsStyling,
} from '../app/wardrobe/model.ts';

function piece(id, category, overrides = {}) {
    return {
        id,
        category,
        sourceKey: `test:${id}`,
        purchaseId: null,
        owner: 'me',
        status: 'owned',
        name: id,
        brand: '',
        colour: 'Navy',
        size: '',
        quantity: 1,
        fit: '',
        pattern: 'Plain',
        warmth: 'light',
        notes: '',
        favourite: false,
        imageId: null,
        productUrl: null,
        updatedAt: '2026-09-09T00:00:00.000Z',
        ...overrides,
    };
}

function capsule() {
    return [
        piece('tee', 'tshirt', { colour: 'White' }),
        piece('polo', 'polo', { colour: 'White' }),
        piece('shirt', 'shirt', { name: 'Oxford shirt', colour: 'White' }),
        piece('jeans', 'jeans'),
        piece('trousers', 'trousers'),
        piece('blazer', 'jacket', {
            name: 'Herringbone tailored jacket',
            colour: 'Grey',
            pattern: 'Herringbone',
            warmth: 'medium',
        }),
        piece('loafers', 'shoes', { name: 'Chunky loafers', colour: 'Black' }),
        piece('trainers', 'shoes', { name: 'Trainers', colour: 'White' }),
    ];
}

function ids(idea) {
    return idea.items.map((item) => item.id);
}
function byCategory(idea, category) {
    return idea.items.find((item) => item.category === category);
}

test('the three modes prefer different owned garment combinations and preserve legacy mode meaning', () => {
    assert.deepEqual(occasions, ['everyday', 'smart', 'dapper']);
    assert.equal(normalizeOccasion('streetwear'), 'everyday');
    assert.equal(normalizeOccasion('dapper'), 'dapper');
    const wardrobe = capsule();
    const everyday = makeOutfitIdeas(wardrobe, 'me', 'everyday', 'mild')[0];
    const smart = makeOutfitIdeas(wardrobe, 'me', 'smart', 'mild')[0];
    const dapper = makeOutfitIdeas(wardrobe, 'me', 'dapper', 'mild')[0];
    assert.ok(byCategory(everyday, 'tshirt'));
    assert.ok(byCategory(everyday, 'jeans'));
    assert.ok(byCategory(smart, 'polo'));
    assert.ok(byCategory(dapper, 'shirt'));
    assert.ok(byCategory(dapper, 'jacket'));
    assert.equal(new Set([everyday.key, smart.key, dapper.key]).size, 3);
    for (const idea of [everyday, smart, dapper]) {
        assert.deepEqual(idea.missing, []);
        assert.ok(idea.sources.length > 0 && idea.sources.length <= 2);
        for (const source of idea.sources)
            assert.ok(
                [
                    'www.permanentstyle.com',
                    'us.drakes.com',
                    'www.drakes.com',
                ].includes(new URL(source.url).hostname),
            );
    }
});

test('known colour depth, mink and muted green remain distinct from unknown or vivid colours', () => {
    assert.equal(outfitColour('Midnight Navy').depth, 'dark');
    assert.equal(outfitColour('Pale blue').depth, 'light');
    assert.equal(outfitColour('Mink').family, 'brown');
    assert.equal(outfitColour('Mink').neutral, true);
    assert.notEqual(outfitColour('Mink').family, 'white');
    assert.equal(outfitColour(' DARK GREEN ').neutral, true);
    assert.equal(outfitColour('Olive').neutral, true);
    assert.equal(outfitColour('Bright green').neutral, false);
    for (const colour of [
        '',
        'Unknown',
        'Colour to confirm',
        'Assorted',
        'Unrecorded',
    ])
        assert.equal(outfitColour(colour).known, false, colour);

    const top = piece('top', 'tshirt', { colour: 'White' });
    const known = describeOutfit(
        [top, piece('bottom', 'jeans', { colour: 'Dark green' })],
        'everyday',
        'warm',
    );
    const unknown = describeOutfit(
        [top, piece('bottom', 'jeans', { colour: '' })],
        'everyday',
        'warm',
    );
    assert.ok(known.score > unknown.score);
    assert.match(unknown.explanation, /unknown|unrecorded/i);
    assert.doesNotMatch(
        unknown.explanation,
        /light.dark contrast|recorded muted green/i,
    );
    assert.equal(known.items[1].colour, 'Dark green');
});

test('textured tailoring works with denim independently of pattern casing', () => {
    const top = piece('top', 'shirt', { colour: 'White' });
    const bottom = piece('bottom', 'jeans', { colour: 'Navy' });
    const jacket = piece('layer', 'jacket', {
        name: 'Tailored jacket',
        colour: 'Grey',
        pattern: 'herringbone',
        warmth: 'medium',
    });
    const lower = describeOutfit([top, bottom, jacket], 'dapper', 'mild');
    const upper = describeOutfit(
        [top, bottom, { ...jacket, pattern: 'HERRINGBONE' }],
        'dapper',
        'mild',
    );
    const smooth = describeOutfit(
        [top, bottom, { ...jacket, pattern: 'Plain' }],
        'dapper',
        'mild',
    );
    assert.equal(lower.score, upper.score);
    assert.equal(lower.explanation, upper.explanation);
    assert.ok(lower.score > smooth.score);
    assert.match(lower.explanation, /texture.*denim/i);
    assert.doesNotMatch(
        lower.explanation,
        /wool|unlined|breathab|unstructured/i,
    );
});

test('warm smart and dapper looks leave jackets off unless the jacket is explicitly selected', () => {
    const wardrobe = capsule();
    for (const occasion of ['smart', 'dapper']) {
        const ideas = makeOutfitIdeas(wardrobe, 'me', occasion, 'warm');
        assert.ok(ideas.length);
        assert.ok(ideas.every((idea) => !byCategory(idea, 'jacket')));
        const anchored = makeOutfitIdeas(
            wardrobe,
            'me',
            occasion,
            'warm',
            'blazer',
        );
        assert.ok(anchored.length);
        for (const idea of anchored) {
            assert.ok(ids(idea).includes('blazer'));
            assert.match(
                idea.weatherNote,
                /optional|cooler indoor|leave it off/i,
            );
        }
    }
});

test('a selected low-ranked top remains in every idea beyond the thirty-top candidate limit', () => {
    const selected = piece('selected-top', 'tshirt', {
        colour: '',
        warmth: 'warm',
    });
    const wardrobe = [
        ...Array.from({ length: 40 }, (_, index) =>
            piece(`top-${String(index).padStart(2, '0')}`, 'shirt', {
                colour: 'White',
                favourite: true,
            }),
        ),
        selected,
        piece('bottom', 'jeans'),
        piece('footwear', 'shoes', { name: 'Black loafers', colour: 'Black' }),
    ];
    const ideas = makeOutfitIdeas(
        wardrobe,
        'me',
        'dapper',
        'warm',
        selected.id,
    );
    assert.ok(ideas.length);
    assert.ok(ideas.every((idea) => ids(idea).includes(selected.id)));
    assert.equal(
        new Set(ideas.flatMap((idea) => ids(idea))).has('selected-top'),
        true,
    );
});

test('shoe selection follows formality and colour compatibility instead of input position', () => {
    const wardrobe = [
        piece('top', 'polo', { colour: 'White' }),
        piece('bottom', 'jeans', { colour: 'Navy' }),
        piece('a-sandals', 'shoes', {
            name: 'Beach sandals',
            colour: 'Orange',
        }),
        piece('b-trainers', 'shoes', { name: 'Trainers', colour: 'White' }),
        piece('z-loafers', 'shoes', {
            name: 'Chunky loafers',
            colour: 'Black',
        }),
    ];
    for (const items of [wardrobe, [...wardrobe].reverse()]) {
        const smart = makeOutfitIdeas(items, 'me', 'smart', 'mild')[0];
        assert.equal(byCategory(smart, 'shoes').id, 'z-loafers');
        const anchored = makeOutfitIdeas(
            items,
            'me',
            'smart',
            'mild',
            'b-trainers',
        )[0];
        assert.equal(byCategory(anchored, 'shoes').id, 'b-trainers');
    }
});

test('carry items never become outfit fillers, and accessory swaps retain their visible role', () => {
    const wardrobe = [
        ...capsule(),
        piece('wallet', 'accessory', {
            name: 'Leather wallet',
            colour: 'Black',
        }),
        piece('duffel', 'accessory', {
            name: 'Classic duffel',
            colour: 'Navy',
        }),
        piece('keycase', 'accessory', {
            name: 'Leather key organiser',
            colour: 'Brown',
        }),
        piece('belt', 'accessory', { name: 'Braided belt', colour: 'Black' }),
        piece('other-belt', 'accessory', {
            name: 'Leather belt',
            colour: 'Brown',
        }),
        piece('scarf', 'accessory', { name: 'Wool scarf', colour: 'Grey' }),
    ];
    for (const id of ['wallet', 'duffel', 'keycase']) {
        assert.equal(
            supportsStyling(wardrobe.find((item) => item.id === id)),
            false,
        );
        assert.deepEqual(
            makeOutfitIdeas(wardrobe, 'me', 'smart', 'mild', id),
            [],
        );
    }
    for (const idea of makeOutfitIdeas(wardrobe, 'me', 'dapper', 'mild'))
        assert.ok(
            ids(idea).every(
                (id) => !['wallet', 'duffel', 'keycase', 'scarf'].includes(id),
            ),
        );
    const belt = wardrobe.find((item) => item.id === 'belt');
    assert.deepEqual(
        swapCandidates(
            wardrobe,
            'me',
            belt,
            ['shirt', 'jeans', 'loafers', 'belt'],
            'smart',
        ).map((item) => item.id),
        ['other-belt'],
    );
});

test('first-page ideas vary core garments and stay deterministic after input reorder or regeneration', () => {
    const wardrobe = [
        ...['White', 'Sand', 'Light grey'].map((colour, index) =>
            piece(`top-${index}`, 'tshirt', { colour }),
        ),
        ...['Navy', 'Dark green', 'Black'].map((colour, index) =>
            piece(`bottom-${index}`, 'jeans', { colour }),
        ),
        piece('shoes', 'shoes', { name: 'Loafers', colour: 'Black' }),
    ];
    const before = structuredClone(wardrobe);
    const first = makeOutfitIdeas(wardrobe, 'me', 'everyday', 'warm');
    assert.equal(first.length, 3);
    assert.equal(
        new Set(first.map((idea) => byCategory(idea, 'tshirt').id)).size,
        3,
    );
    assert.equal(
        new Set(first.map((idea) => byCategory(idea, 'jeans').id)).size,
        3,
    );
    assert.deepEqual(
        makeOutfitIdeas([...wardrobe].reverse(), 'me', 'everyday', 'warm'),
        first,
    );
    assert.deepEqual(
        makeOutfitIdeas(wardrobe, 'me', 'everyday', 'warm'),
        first,
    );
    assert.deepEqual(wardrobe, before);
    const more = makeOutfitIdeas(wardrobe, 'me', 'everyday', 'warm', '', 3);
    assert.notEqual(more[0].key, first[0].key);
    assert.equal(new Set(more.map((idea) => idea.key)).size, more.length);
});

test('generation and swaps enforce owner, status and purchase-fulfilment boundaries for every role', () => {
    const safe = capsule();
    const blocked = [
        piece('wife-top', 'shirt', { owner: 'wife', favourite: true }),
        piece('kid-shoes', 'shoes', { owner: 'kid', name: 'Loafers' }),
        piece('unassigned-top', 'shirt', { owner: 'unassigned' }),
        ...[
            'wishlist',
            'returned',
            'retired',
            'outgrown',
            'review',
            'awaiting_delivery',
            'trashed',
        ].map((status) =>
            piece(`status-${status}`, 'shirt', { status, favourite: true }),
        ),
        ...['returned', 'cancelled', 'in_transit'].flatMap((fulfillment) => [
            piece(`${fulfillment}-jacket`, 'jacket', {
                name: 'Tailored blazer',
                facts: { fulfillment },
            }),
            piece(`${fulfillment}-shoes`, 'shoes', {
                name: 'Loafers',
                facts: { fulfillment },
            }),
            piece(`${fulfillment}-belt`, 'accessory', {
                name: 'Belt',
                facts: { fulfillment },
            }),
        ]),
    ];
    const wardrobe = [...blocked, ...safe];
    const safeIds = new Set(safe.map((item) => item.id));
    for (const occasion of occasions) {
        for (const idea of makeOutfitIdeas(wardrobe, 'me', occasion, 'cool'))
            assert.ok(idea.items.every((item) => safeIds.has(item.id)));
        for (const item of safe) {
            const swaps = swapCandidates(
                wardrobe,
                'me',
                item,
                [item.id],
                occasion,
                'cool',
            );
            assert.ok(swaps.every((candidate) => safeIds.has(candidate.id)));
        }
    }
    for (const item of blocked)
        assert.deepEqual(
            makeOutfitIdeas(wardrobe, 'me', 'dapper', 'cool', item.id),
            [],
        );
    assert.deepEqual(
        makeOutfitIdeas(wardrobe, 'unassigned', 'everyday', 'mild'),
        [],
    );
});

test('sparse wardrobes state missing roles without inventing clothes or personal fit details', () => {
    const top = piece('top', 'tshirt', { colour: '', fit: '' });
    const bottom = piece('bottom', 'jeans', { colour: '', fit: '' });
    const dress = piece('dress', 'dress', { colour: 'Navy' });
    const topOnly = makeOutfitIdeas([top], 'me', 'everyday', 'warm')[0];
    assert.deepEqual(ids(topOnly), ['top']);
    assert.deepEqual(topOnly.missing, ['a bottom', 'footwear']);
    const bottomOnly = makeOutfitIdeas([bottom], 'me', 'smart', 'mild')[0];
    assert.deepEqual(bottomOnly.missing, ['a top', 'footwear']);
    const onePiece = makeOutfitIdeas([dress], 'me', 'dapper', 'mild')[0];
    assert.deepEqual(onePiece.missing, ['footwear']);
    const outfit = makeOutfitIdeas([top, bottom], 'me', 'everyday', 'warm')[0];
    assert.match(outfit.explanation, /unknown|unrecorded/i);
    assert.doesNotMatch(
        outfit.explanation + outfit.wearNote,
        /oversized|dark wash|breathable|slim.fit/i,
    );
    assert.deepEqual(makeOutfitIdeas([], 'me', 'everyday', 'mild'), []);
    assert.deepEqual(
        makeOutfitIdeas([piece('shoes', 'shoes')], 'me', 'dapper', 'cool'),
        [],
    );
});

test('explanations describe vivid combinations without calling them restrained neutrals', () => {
    const idea = describeOutfit(
        [
            piece('top', 'tshirt', { colour: 'Orange' }),
            piece('bottom', 'jeans', { colour: 'Purple' }),
        ],
        'everyday',
        'mild',
    );
    assert.match(idea.explanation, /strong colours/i);
    assert.doesNotMatch(
        idea.explanation,
        /restrained|quiet starting point|neutral colours/i,
    );
});

test('a textured jacket needs a separate known quiet companion before claiming one', () => {
    const top = piece('top', 'shirt', { pattern: '' });
    const bottom = piece('bottom', 'jeans', { pattern: '' });
    const jacket = piece('jacket', 'jacket', {
        name: 'Tailored jacket',
        pattern: 'Herringbone',
    });
    const unknown = describeOutfit([top, bottom, jacket], 'dapper', 'mild');
    assert.doesNotMatch(unknown.explanation, /quiet companions/i);
    const known = describeOutfit(
        [{ ...top, pattern: 'Plain' }, bottom, jacket],
        'dapper',
        'mild',
    );
    assert.match(known.explanation, /quiet companions/i);
});

test('describing an empty saved outfit reports missing roles safely', () => {
    const idea = describeOutfit([], 'everyday', 'mild');
    assert.deepEqual(idea.items, []);
    assert.deepEqual(idea.missing, ['a top', 'a bottom', 'footwear']);
    assert.ok(Number.isFinite(idea.score));
    assert.ok(idea.explanation.length > 0);
});

test('the selected editorial sources retain the relevant summer or denim-texture guidance', () => {
    const wardrobe = capsule();
    const warm = makeOutfitIdeas(wardrobe, 'me', 'dapper', 'warm', 'blazer');
    assert.ok(warm.length);
    for (const idea of warm)
        assert.ok(
            idea.sources.some(
                (source) =>
                    source.url ===
                    'https://www.permanentstyle.com/2016/06/how-to-dress-for-summer-reader-question.html',
            ),
        );
    const denim = makeOutfitIdeas(wardrobe, 'me', 'dapper', 'mild', 'jeans');
    assert.ok(denim.length);
    for (const idea of denim)
        assert.ok(
            idea.sources.some(
                (source) =>
                    source.url ===
                    'https://www.permanentstyle.com/2015/10/wearing-a-jacket-and-jeans.html',
            ),
        );
});

test('maximum-length recorded metadata produces saveable outfit titles and notes', () => {
    const fill = (prefix, length) =>
        prefix + 'x'.repeat(length - prefix.length);
    const wardrobe = [
        piece('top', 'shirt', {
            name: fill('Oxford shirt ', 200),
            colour: fill('White ', 160),
            fit: fill('Oversized ', 160),
            pattern: 'Plain',
        }),
        piece('bottom', 'jeans', {
            name: fill('Slim jeans ', 200),
            colour: fill('Dark green ', 160),
            fit: fill('Slim ', 160),
        }),
        piece('jacket', 'jacket', {
            name: fill('Tailored blazer ', 200),
            colour: fill('Grey ', 160),
            fit: fill('Slim ', 160),
            pattern: 'Herringbone',
            warmth: 'medium',
        }),
        piece('shoes', 'shoes', {
            name: fill('Chunky loafers ', 200),
            colour: fill('Black ', 160),
        }),
        piece('belt', 'accessory', {
            name: fill('Braided belt ', 200),
            colour: fill('Black ', 160),
        }),
        piece('fragrance', 'fragrance', {
            name: fill('Personal fragrance ', 200),
            colour: '',
        }),
    ];
    const direct = describeOutfit(wardrobe, 'dapper', 'warm');
    const generated = makeOutfitIdeas(
        wardrobe,
        'me',
        'dapper',
        'mild',
        'fragrance',
    );
    assert.ok(generated.length);
    assert.ok(generated.every((idea) => ids(idea).includes('fragrance')));
    for (const idea of [direct, ...generated]) {
        assert.ok(idea.name.trim().length > 0 && idea.name.length <= 120);
        const notes = [idea.explanation, idea.weatherNote, idea.wearNote].join(
            ' ',
        );
        assert.ok(
            notes.length < 3000,
            `Generated notes have ${notes.length} characters`,
        );
    }
});
