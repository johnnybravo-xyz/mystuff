'use client';
import { useState } from 'react';
import { Check, Download, FileCode2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectField } from './components';
import {
    categories,
    categoryLabels,
    collectionLabels,
    collections,
    profileLabel,
} from './model';
import type { Category, Collection, OwnerFilter, WardrobeItem } from './model';
import type { Profile } from '@/app/installation';
import { buildArchiveExport, selectExportItems } from './export';
import type { ExportFormat } from './export';

export function ExportCollection({
    items,
    owner,
    collection,
    profiles,
    archiveTitle,
    onCollection,
}: {
    items: WardrobeItem[];
    owner: OwnerFilter;
    collection: Collection;
    profiles: Profile[];
    archiveTitle: string;
    onCollection: (collection: Collection) => void;
}) {
    const [selectedCategories, setSelectedCategories] = useState<
        'all' | Category[]
    >('all');
    const [format, setFormat] = useState<ExportFormat>('markdown');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const available = selectExportItems(items, {
        owner,
        collection,
        categories: 'all',
    });
    const choices = categories.filter((category) =>
        available.some((item) => item.category === category),
    );
    const options = {
        owner,
        collection,
        categories: selectedCategories,
        title: archiveTitle,
        profileLabels: Object.fromEntries(
            profiles.map((profile) => [profile.id, profile.label]),
        ),
    };
    const selected = selectExportItems(items, options);
    const allChecked =
        choices.length > 0 &&
        (selectedCategories === 'all' ||
            choices.every((category) => selectedCategories.includes(category)));
    function toggleCategory(category: Category) {
        const previous =
            selectedCategories === 'all' ? choices : selectedCategories;
        setSelectedCategories(
            previous.includes(category)
                ? previous.filter((value) => value !== category)
                : [...previous, category],
        );
        setNotice('');
    }
    function download() {
        setError('');
        try {
            const document = buildArchiveExport(items, options, format);
            const url = URL.createObjectURL(
                new Blob([document.content], { type: document.mimeType }),
            );
            const link = window.document.createElement('a');
            link.href = url;
            link.download = document.filename;
            window.document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setNotice(`Download prepared: ${document.filename}`);
        } catch {
            setError('The export could not be prepared. Please try again.');
        }
    }
    return (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
            <section
                className="min-w-0 rounded-xl border bg-card p-5 sm:p-7"
                aria-labelledby="export-selection-heading"
            >
                <h2
                    id="export-selection-heading"
                    className="mb-2 font-heading text-3xl font-semibold"
                >
                    Choose what to take.
                </h2>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                    Choose a collection and any combination of categories. Use
                    the owner switch above to narrow it to one person.
                </p>
                <SelectField
                    label="Collection to export"
                    value={collection}
                    onChange={(value) => onCollection(value as Collection)}
                    options={collections.map((value) => ({
                        value,
                        label: collectionLabels[value],
                    }))}
                />
                <fieldset className="mt-6 min-w-0">
                    <legend className="mb-3 text-sm font-semibold">
                        Categories
                    </legend>
                    <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-secondary px-3 py-2">
                        <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={allChecked}
                            disabled={!choices.length}
                            onChange={() => {
                                setSelectedCategories(allChecked ? [] : 'all');
                                setNotice('');
                            }}
                        />
                        <span className="flex-1 font-medium">
                            All categories
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {available.length}
                        </span>
                    </label>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        {choices.map((category) => (
                            <label
                                key={category}
                                className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-secondary"
                            >
                                <input
                                    type="checkbox"
                                    className="size-4 shrink-0 accent-primary"
                                    checked={
                                        selectedCategories === 'all' ||
                                        selectedCategories.includes(category)
                                    }
                                    onChange={() => toggleCategory(category)}
                                />
                                <span className="min-w-0 flex-1">
                                    {categoryLabels[category]}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {
                                        available.filter(
                                            (item) =>
                                                item.category === category,
                                        ).length
                                    }
                                </span>
                            </label>
                        ))}
                    </div>
                    {!choices.length && (
                        <p className="py-4 text-muted-foreground">
                            There are no owned items in this collection for this
                            owner.
                        </p>
                    )}
                </fieldset>
            </section>
            <aside
                className="min-w-0 self-start rounded-xl border bg-card p-5 sm:p-7"
                aria-labelledby="export-download-heading"
            >
                <h2
                    id="export-download-heading"
                    className="font-heading text-3xl font-semibold"
                >
                    Your collection, to go.
                </h2>
                <p className="mt-3 text-sm font-medium">
                    {owner === 'all' ? 'Everyone' : profileLabel(owner, profiles)} ·{' '}
                    {collectionLabels[collection]}
                </p>
                <p
                    className="mt-3 text-sm text-muted-foreground"
                    aria-live="polite"
                >
                    {selected.length} owned{' '}
                    {selected.length === 1 ? 'entry' : 'entries'} selected
                </p>
                <fieldset className="my-6 grid gap-3">
                    <legend className="mb-3 text-sm font-semibold">
                        Download format
                    </legend>
                    {(
                        [
                            {
                                value: 'markdown',
                                label: 'Markdown',
                                description:
                                    'Easy to edit, keep in notes, or share as text.',
                                Icon: FileText,
                            },
                            {
                                value: 'html',
                                label: 'HTML',
                                description:
                                    'A styled page you can open offline or print.',
                                Icon: FileCode2,
                            },
                        ] as const
                    ).map(({ value, label, description, Icon }) => (
                        <label
                            key={value}
                            aria-label={`${label} export format`}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${format === value ? 'border-primary bg-secondary' : ''}`}
                        >
                            <input
                                type="radio"
                                className="mt-1 size-4 shrink-0 accent-primary"
                                name="export-format"
                                value={value}
                                checked={format === value}
                                onChange={() => {
                                    setFormat(value);
                                    setNotice('');
                                }}
                            />
                            <span className="min-w-0">
                                <span className="mb-1 flex items-center gap-2 font-semibold">
                                    <Icon size={16} aria-hidden="true" />
                                    {label}
                                </span>
                                <span className="text-xs leading-relaxed text-muted-foreground">
                                    {description}
                                </span>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <Button
                    className="min-h-11 w-full"
                    disabled={!selected.length}
                    onClick={download}
                >
                    <Download /> Download{' '}
                    {format === 'html' ? 'HTML' : 'Markdown'}
                </Button>
                {notice && (
                    <output className="mt-4 flex items-start gap-2 break-all text-xs text-primary">
                        <Check size={16} className="shrink-0" />
                        {notice}
                    </output>
                )}
                {error && (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                        {error}
                    </p>
                )}
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                    Includes item details, notes, product links, and available
                    photo source links. Photos stay in My Stuff. Review,
                    returned, awaiting delivery, and previously owned items are
                    excluded.
                </p>
            </aside>
        </div>
    );
}
