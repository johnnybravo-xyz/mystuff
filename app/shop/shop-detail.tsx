'use client';
import { useState } from 'react';
import type { SubmitEvent } from 'react';
import Image from 'next/image';
import { shopPhotoUrl } from '../wardrobe/shop-model';
import type { ShopListing } from '../wardrobe/shop-model';

export function ShopGallery({ item }: { item: ShopListing }) {
  const [active, setActive] = useState(item.photoIds[0]);
  return (
    <div className="shop-gallery">
      <div className="shop-main-photo">
        <Image
          unoptimized
          width={1000}
          height={1000}
          src={shopPhotoUrl(item.id, active)}
          alt={item.name}
        />
      </div>
      {item.photoIds.length > 1 && (
        <div className="shop-thumbnails">
          {item.photoIds.map((id, index) => (
            <button
              key={id}
              type="button"
              className={active === id ? 'selected' : ''}
              aria-label={`View photo ${index + 1}`}
              aria-pressed={active === id}
              onClick={() => setActive(id)}
            >
              <Image
                unoptimized
                width={76}
                height={90}
                src={shopPhotoUrl(item.id, id)}
                alt=""
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function ShopContactForm({ itemId }: { itemId: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/shop/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          name: data.get('name'),
          contact: data.get('contact'),
          comment: data.get('comment'),
          website: data.get('website'),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Your inquiry could not be sent. Please try again.',
        );
      setSent(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Your inquiry could not be sent. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <output className="shop-inquiry-success">
        <strong>Thanks for your interest.</strong>
        <span>
          Your inquiry is with the owner. They can reply using the contact
          details you shared.
        </span>
      </output>
    );
  return (
    <form className="shop-contact" onSubmit={submit}>
      <h2>Leave a comment</h2>
      <p>Ask a question or tell me you’re interested. Your message is private.</p>
      <label>
        Your name
        <input name="name" autoComplete="name" maxLength={100} required />
      </label>
      <label>
        Email or phone
        <input name="contact" autoComplete="email" maxLength={200} required />
      </label>
      <label>
        Your comment <span>(optional)</span>
        <textarea name="comment" maxLength={1000} rows={3} />
      </label>
      <label className="shop-honey" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {error && (
        <p className="shop-error" role="alert">
          {error}
        </p>
      )}
      <button className="shop-button" disabled={busy}>
        {busy ? 'Sending…' : 'Send inquiry'}
      </button>
      <small>
        Your contact details are shared privately with the owner. Sending an
        inquiry does not reserve or purchase the item.
      </small>
    </form>
  );
}
