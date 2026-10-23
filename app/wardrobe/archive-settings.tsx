'use client';
import { useState } from 'react';
import { Check, EyeOff, Settings, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Preferences } from './model';
import { collections, collectionLabels } from './model';
import type { InstallationSettings, Profile } from '@/app/installation';
import styles from './archive-settings.module.css';

export function ArchiveSettings({
  preferences,
  configuration,
  profiles,
  itemCount,
  busy = false,
  onBlurPrices,
}: {
  preferences: Preferences;
  configuration: InstallationSettings;
  profiles: Profile[];
  itemCount: number;
  busy?: boolean;
  onBlurPrices: (value: boolean) => Promise<void>;
}) {
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingInstallation, setSavingInstallation] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(configuration);
  const [profileDrafts, setProfileDrafts] = useState(profiles);
  const [shopExposureConfirmed, setShopExposureConfirmed] = useState(false);

  async function changePricePrivacy(blurPrices: boolean) {
    setSavingPrivacy(true);
    setError('');
    try {
      await onBlurPrices(blurPrices);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'This setting could not be saved.',
      );
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function saveInstallation() {
    setSavingInstallation(true);
    setError('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          profiles: profileDrafts,
          shopExposureConfirmed,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'Settings could not be saved.');
      window.location.reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Settings could not be saved.',
      );
      setSavingInstallation(false);
    }
  }

  function toggleCollection(
    collection: InstallationSettings['enabledCollections'][number],
  ) {
    setSettings((current) => ({
      ...current,
      enabledCollections: current.enabledCollections.includes(collection)
        ? current.enabledCollections.filter((entry) => entry !== collection)
        : [...current.enabledCollections, collection],
    }));
  }

  return (
    <div className="grid max-w-[780px] gap-6 pt-8">
      <section
        className={styles.panel + ' !mt-0'}
        aria-labelledby="onboarding-heading"
      >
        <div className={styles.heading}>
          <span className={styles.icon}>
            <Check size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 id="onboarding-heading">Getting started</h2>
            <p>A short checklist you can dismiss or bring back later.</p>
          </div>
        </div>
        {!settings.onboarding.dismissed ? (
          <>
            <ul className="grid gap-2 text-sm">
              <li>✓ Administrator and household profiles created</li>
              <li>{itemCount > 0 ? '✓' : '○'} Add your first item</li>
              <li>
                ○ Run <code>mystuff backup /data/backups/my-stuff.tar.gz</code>
              </li>
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  onboarding: { dismissed: true },
                }))
              }
            >
              Dismiss checklist
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                onboarding: { dismissed: false },
              }))
            }
          >
            Restart checklist
          </Button>
        )}
      </section>
      <section
        className={styles.panel + ' !mt-0'}
        aria-labelledby="installation-heading"
      >
        <div className={styles.heading}>
          <span className={styles.icon}>
            <Settings size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 id="installation-heading">Installation</h2>
            <p>
              Branding, region, profiles, collections, and optional features.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Title
            <Input
              value={settings.title}
              maxLength={80}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Subtitle
            <Input
              value={settings.subtitle}
              maxLength={160}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  subtitle: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Locale
            <Input
              value={settings.locale}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  locale: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Time zone
            <Input
              value={settings.timeZone}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  timeZone: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Base currency
            <Input
              value={settings.baseCurrency}
              maxLength={3}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  baseCurrency: event.target.value.toUpperCase(),
                }))
              }
            />
          </label>
        </div>
        <h3 className="mb-3 mt-7 text-sm font-bold">Household profiles</h3>
        <div className="grid gap-3">
          {profileDrafts.map((profile, index) => (
            <div className="flex gap-2" key={profile.id || index}>
              <Input
                value={profile.label}
                maxLength={60}
                aria-label={`Profile ${index + 1}`}
                onChange={(event) =>
                  setProfileDrafts((current) =>
                    current.map((entry, currentIndex) =>
                      currentIndex === index
                        ? { ...entry, label: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove ${profile.label}`}
                disabled={profileDrafts.length === 1}
                onClick={() =>
                  setProfileDrafts((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() =>
              setProfileDrafts((current) => [
                ...current,
                { id: '', label: '', position: current.length },
              ])
            }
          >
            <Plus /> Add profile
          </Button>
        </div>
        <h3 className="mb-3 mt-7 text-sm font-bold">Collections</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {collections
            .filter((collection) => collection !== 'all')
            .map((collection) => (
              <label
                className="flex items-center gap-3 rounded-md border p-3 text-sm"
                key={collection}
              >
                <input
                  type="checkbox"
                  checked={settings.enabledCollections.includes(collection)}
                  onChange={() => toggleCollection(collection)}
                />{' '}
                {collectionLabels[collection]}
              </label>
            ))}
        </div>
        <h3 className="mb-3 mt-7 text-sm font-bold">Features</h3>
        <div className="grid gap-2">
          {(['wishlist', 'outfits', 'shop'] as const).map((feature) => (
            <label
              className="flex items-center justify-between rounded-md border p-3 text-sm"
              key={feature}
            >
              <span className="capitalize">
                {feature === 'shop' ? 'Public shop' : feature}
              </span>
              <input
                type="checkbox"
                checked={settings.features[feature]}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    features: {
                      ...current.features,
                      [feature]: event.target.checked,
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
        {settings.features.shop && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Shop title
              <Input
                value={settings.shop.title}
                maxLength={100}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    shop: { ...current.shop, title: event.target.value },
                  }))
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Default currency
              <Input
                value={settings.shop.defaultCurrency}
                maxLength={3}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    shop: {
                      ...current.shop,
                      defaultCurrency: event.target.value.toUpperCase(),
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Introduction
              <Input
                value={settings.shop.introduction}
                maxLength={300}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    shop: { ...current.shop, introduction: event.target.value },
                  }))
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Contact privacy copy
              <Input
                value={settings.shop.privacyCopy}
                maxLength={300}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    shop: { ...current.shop, privacyCopy: event.target.value },
                  }))
                }
              />
            </label>
          </div>
        )}
        {settings.features.shop && !configuration.features.shop && (
          <label className="mt-3 flex items-start gap-3 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              type="checkbox"
              className="mt-1"
              checked={shopExposureConfirmed}
              onChange={(event) =>
                setShopExposureConfirmed(event.target.checked)
              }
            />
            I understand published listings, selected photos, and the inquiry
            form will be public at the configured HTTPS origin.
          </label>
        )}
        <Button
          className="mt-6"
          disabled={busy || savingInstallation}
          onClick={() => void saveInstallation()}
        >
          {savingInstallation ? 'Saving…' : 'Save installation settings'}
        </Button>
      </section>

      <section
        className={styles.panel + ' !mt-0'}
        aria-labelledby="price-privacy-heading"
      >
        <div className={styles.heading}>
          <span className={styles.icon}>
            <EyeOff size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 id="price-privacy-heading">Price privacy</h2>
            <p>One preference for your whole archive, saved across devices.</p>
          </div>
        </div>
        <div className={styles.control}>
          <input
            type="checkbox"
            id="archive-blur-prices"
            aria-labelledby="archive-blur-prices-label"
            checked={preferences.blurPrices !== false}
            disabled={busy || savingPrivacy}
            onChange={(event) => void changePricePrivacy(event.target.checked)}
          />
          <div>
            <label id="archive-blur-prices-label" htmlFor="archive-blur-prices">
              Blur prices by default
            </label>
            <p>Keep private item values blurred when you open any item.</p>
          </div>
        </div>
      </section>
      {(savingPrivacy || savingInstallation) && (
        <output className={styles.status}>Saving settings…</output>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
