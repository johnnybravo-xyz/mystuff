'use client';
import { useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import {
  Link as LinkIcon,
  PencilLine,
  ArrowRight,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { PieceEditor } from './piece-editor';
import type { Collection, Owner, WardrobeItem } from './model';
import type { Profile } from '@/app/installation';

export function AddItem({
  owner,
  collection,
  profiles,
  baseCurrency,
  shopCurrency,
  initialStatus = 'owned',
  onClose,
  onSave,
}: {
  owner: Owner;
  collection: Collection;
  profiles: Profile[];
  baseCurrency: string;
  shopCurrency: string;
  initialStatus?: 'owned' | 'wishlist';
  onClose: () => void;
  onSave: (item: Partial<WardrobeItem>) => Promise<void>;
}) {
  const [mode, setMode] = useState<'choose' | 'url' | 'manual'>('choose');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<WardrobeItem>>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const pending = useRef<AbortController | null>(null);
  function close() {
    pending.current?.abort();
    onClose();
  }
  async function lookup(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    pending.current = new AbortController();
    try {
      const response = await fetch('/api/product-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: pending.current.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'This product page could not be read.');
      setDraft(result.item);
      setWarnings(result.warnings || []);
      setMode('manual');
    } catch (failure) {
      if (failure instanceof Error && failure.name !== 'AbortError')
        setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  if (mode === 'manual')
    return (
      <PieceEditor
        owner={owner}
        initialCollection={collection}
        profiles={profiles}
        baseCurrency={baseCurrency}
        shopCurrency={shopCurrency}
        initialValues={{ ...draft, status: initialStatus }}
        sourceWarnings={warnings}
        onClose={close}
        onSave={onSave}
      />
    );
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="editor-sheet">
        <SheetHeader>
          <SheetTitle>
            {initialStatus === 'wishlist'
              ? 'Add to Wishlist'
              : 'Add to My Stuff'}
          </SheetTitle>
          <SheetDescription>
            {initialStatus === 'wishlist'
              ? 'Something you would like to own, with its details ready.'
              : 'Something you own, with its story and details.'}
          </SheetDescription>
        </SheetHeader>
        {mode === 'choose' ? (
          <div className="add-methods">
            <button className="add-method" onClick={() => setMode('manual')}>
              <PencilLine />
              <strong>Add it yourself</strong>
              <span>
                Enter a name, choose a collection, and add details and photos.
              </span>
              <ArrowRight />
            </button>
            <button className="add-method" onClick={() => setMode('url')}>
              <LinkIcon />
              <strong>Start with a product link</strong>
              <span>
                Find the name, details, and images from a retailer page, then
                review and save.
              </span>
              <ArrowRight />
            </button>
          </div>
        ) : (
          <form className="editor-form" onSubmit={lookup}>
            <label className="field" htmlFor="product-link">
              <span>Product page URL</span>
              <Input
                id="product-link"
                type="url"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://store.com/product"
                disabled={loading}
              />
            </label>
            <p className="muted">
              We’ll prepare an editable draft. You can confirm the version,
              collection, and who it belongs to before adding it.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error} You can also enter the item yourself.
              </p>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle className="spin" /> Finding product details…
                </>
              ) : (
                <>
                  Find product details <ArrowRight />
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setDraft({ productUrl: url || null });
                setMode('manual');
              }}
            >
              Enter details myself
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
