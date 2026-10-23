'use client';
import { useState } from 'react';
import { BookmarkPlus, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GarmentPhoto } from './components';
import { describeOutfit, swapCandidates } from './outfits';
import type { OutfitIdea } from './outfits';
import type { WardrobeItem, Owner } from './model';

export function OutfitBoard({
    idea,
    allItems,
    owner,
    onSave,
    busy = false,
    lockedItemId = '',
}: {
    idea: OutfitIdea;
    allItems: WardrobeItem[];
    owner: Owner;
    onSave: (
        items: WardrobeItem[],
        name: string,
        notes: string,
    ) => Promise<void>;
    busy?: boolean;
    lockedItemId?: string;
}) {
    const [pieces, setPieces] = useState(idea.items);
    const [name, setName] = useState(idea.name);
    const [changed, setChanged] = useState(false);
    const [saved, setSaved] = useState(false);
    const guidance = changed
        ? describeOutfit(pieces, idea.occasion, idea.temperature)
        : idea;
    const explanation = guidance.explanation;
    function swap(item: WardrobeItem) {
        const candidates = swapCandidates(
            allItems,
            owner,
            item,
            pieces.map((piece) => piece.id),
            idea.occasion,
            idea.temperature,
        );
        if (!candidates.length) return;
        setPieces((previous) =>
            previous.map((piece) =>
                piece.id === item.id ? candidates[0] : piece,
            ),
        );
        setChanged(true);
        setSaved(false);
    }
    return (
        <article className="outfit-board">
            <div className="outfit-collage">
                {pieces.map((item) => (
                    <div className="outfit-piece" key={item.id}>
                        <a href={`/pieces/${item.id}`}>
                            <GarmentPhoto item={item} />
                        </a>
                        <div className="outfit-piece-caption">
                            <a href={`/pieces/${item.id}`}>{item.name}</a>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={
                                    item.id === lockedItemId ||
                                    !swapCandidates(
                                        allItems,
                                        owner,
                                        item,
                                        pieces.map((piece) => piece.id),
                                        idea.occasion,
                                        idea.temperature,
                                    ).length
                                }
                                aria-label={`Swap ${item.name}`}
                                onClick={() => swap(item)}
                            >
                                <Repeat2 size={12} />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="outfit-board-body">
                <Input
                    aria-label="Outfit name"
                    maxLength={120}
                    className="outfit-name"
                    value={name}
                    onChange={(event) => {
                        setName(event.target.value);
                        setSaved(false);
                    }}
                />
                <p>{explanation}</p>
                <div className="outfit-guidance">
                    <p>
                        <strong>For the weather</strong> {guidance.weatherNote}
                    </p>
                    <p>
                        <strong>Try it on</strong> {guidance.wearNote}
                    </p>
                    <div
                        className="outfit-sources"
                        aria-label="Editorial inspiration"
                    >
                        <span>Inspired by</span>
                        {guidance.sources.map((source) => (
                            <a
                                key={source.url}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {source.publisher} · {source.title}
                            </a>
                        ))}
                    </div>
                </div>
                <Button
                    variant="outline"
                    className="save-outfit"
                    disabled={busy || saved || !name.trim()}
                    onClick={async () => {
                        try {
                            await onSave(
                                pieces,
                                name,
                                [
                                    explanation,
                                    guidance.weatherNote,
                                    guidance.wearNote,
                                ].join(' '),
                            );
                            setSaved(true);
                        } catch {}
                    }}
                >
                    <BookmarkPlus />
                    {saved ? 'Saved to your outfits' : 'Save outfit'}
                </Button>
            </div>
        </article>
    );
}
