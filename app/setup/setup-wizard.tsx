'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  Download,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { collections, collectionLabels } from '@/app/wardrobe/model';
import type { Collection } from '@/app/wardrobe/model';

const steps = [
  'Welcome',
  'Administrator',
  'Region',
  'Profiles',
  'Collections',
  'Features',
  'First item',
  'Protect data',
];
const defaultCollections: Exclude<Collection, 'all'>[] = [
  'fashion',
  'home',
  'tech',
  'pantry',
  'pets',
  'other',
];

export function SetupWizard({ initialToken }: { initialToken: string }) {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState(initialToken);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('My Stuff');
  const [subtitle, setSubtitle] = useState('Everything you own, remembered.');
  const [locale, setLocale] = useState(() => navigator.language || 'en-GB');
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [profiles, setProfiles] = useState(['Me', 'Household']);
  const [newProfile, setNewProfile] = useState('');
  const [enabledCollections, setEnabledCollections] =
    useState(defaultCollections);
  const [features, setFeatures] = useState({
    wishlist: true,
    outfits: true,
    shop: false,
  });
  const [shopExposureConfirmed, setShopExposureConfirmed] = useState(false);
  const [demoData, setDemoData] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const progress = useMemo(
    () => `${Math.round(((step + 1) / steps.length) * 100)}%`,
    [step],
  );

  function toggleCollection(collection: Exclude<Collection, 'all'>) {
    setEnabledCollections((current) =>
      current.includes(collection)
        ? current.filter((entry) => entry !== collection)
        : [...current, collection],
    );
  }

  function addProfile() {
    const label = newProfile.trim();
    if (
      !label ||
      profiles.some((profile) => profile.toLowerCase() === label.toLowerCase())
    )
      return;
    setProfiles((current) => [...current, label]);
    setNewProfile('');
  }

  async function finish() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          setup: {
            displayName,
            password,
            title,
            subtitle,
            locale,
            timeZone,
            baseCurrency: baseCurrency.toUpperCase(),
            profiles,
            enabledCollections,
            features,
            shopExposureConfirmed,
            demoData,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'Setup could not be completed.');
      setComplete(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Setup could not be completed.',
      );
    } finally {
      setPending(false);
    }
  }

  function downloadRecoveryGuide() {
    const guide = `${title} recovery guide\n\nData directory: /data\nBackup: docker compose exec app mystuff backup /data/backups/mystuff-backup.tar.gz\nVerify: docker compose exec app mystuff restore --verify /data/backups/mystuff-backup.tar.gz\nPassword reset: docker compose exec app mystuff password reset\n\nThis document contains no password or access token.\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([guide], { type: 'text/plain' }));
    link.download = 'my-stuff-recovery.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (complete)
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 px-5 py-12">
        <section className="w-full max-w-xl rounded-2xl border bg-card p-8 shadow-sm sm:p-12">
          <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check />
          </div>
          <p className="eyebrow mb-3">SETUP COMPLETE</p>
          <h1 className="mb-4 font-heading text-4xl font-semibold">
            Your collection is ready.
          </h1>
          <p className="mb-8 leading-relaxed text-muted-foreground">
            Sign in with the administrator password you just created, then add
            your first item manually or from a product URL.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={downloadRecoveryGuide} variant="outline">
              <Download /> Recovery guide
            </Button>
            <Button onClick={() => window.location.assign('/signin')}>
              <ShieldCheck /> Sign in
            </Button>
          </div>
        </section>
      </main>
    );

  return (
    <main className="min-h-screen bg-muted/30 px-5 py-8 sm:py-12">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="border-b px-6 py-5 sm:px-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Boxes className="text-primary" /> MY STUFF
            </span>
            <span className="text-sm text-muted-foreground">
              {step + 1} of {steps.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: progress }}
            />
          </div>
        </header>
        <div className="min-h-[460px] px-6 py-8 sm:px-10 sm:py-10">
          {step === 0 && <Welcome token={token} setToken={setToken} />}
          {step === 1 && (
            <Administrator
              displayName={displayName}
              setDisplayName={setDisplayName}
              password={password}
              setPassword={setPassword}
              title={title}
              setTitle={setTitle}
              subtitle={subtitle}
              setSubtitle={setSubtitle}
            />
          )}
          {step === 2 && (
            <Region
              locale={locale}
              setLocale={setLocale}
              timeZone={timeZone}
              setTimeZone={setTimeZone}
              baseCurrency={baseCurrency}
              setBaseCurrency={setBaseCurrency}
            />
          )}
          {step === 3 && (
            <Profiles
              profiles={profiles}
              setProfiles={setProfiles}
              newProfile={newProfile}
              setNewProfile={setNewProfile}
              addProfile={addProfile}
            />
          )}
          {step === 4 && (
            <Collections
              enabled={enabledCollections}
              toggle={toggleCollection}
            />
          )}
          {step === 5 && (
            <Features
              features={features}
              setFeatures={setFeatures}
              shopExposureConfirmed={shopExposureConfirmed}
              setShopExposureConfirmed={setShopExposureConfirmed}
            />
          )}
          {step === 6 && (
            <FirstItem demoData={demoData} setDemoData={setDemoData} />
          )}
          {step === 7 && <Protect />}
          {error && (
            <p
              className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-between border-t px-6 py-5 sm:px-10">
          <Button
            variant="ghost"
            disabled={step === 0 || pending}
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft /> Back
          </Button>
          {step < steps.length - 1 ? (
            <Button
              disabled={pending}
              onClick={() => {
                setError('');
                setStep((current) => current + 1);
              }}
            >
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button disabled={pending} onClick={() => void finish()}>
              {pending ? 'Creating your archive…' : 'Finish setup'} <Check />
            </Button>
          )}
        </footer>
      </section>
    </main>
  );
}

function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="mb-4 font-heading text-4xl font-semibold">{title}</h1>
      <p className="mb-8 max-w-2xl leading-relaxed text-muted-foreground">
        {children}
      </p>
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Welcome({
  token,
  setToken,
}: {
  token: string;
  setToken: (value: string) => void;
}) {
  return (
    <>
      <Heading eyebrow="WELCOME" title="Make this collection yours.">
        My Stuff keeps one household’s records and photos in your own{' '}
        <code>/data</code> volume. This one-time token proves you can access the
        container logs.
      </Heading>
      <Field label="Setup token">
        <Input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste the token from docker compose logs app"
          autoComplete="off"
        />
      </Field>
    </>
  );
}
function Administrator(props: {
  displayName: string;
  setDisplayName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  subtitle: string;
  setSubtitle: (v: string) => void;
}) {
  return (
    <>
      <Heading eyebrow="ADMINISTRATOR" title="Protect your private archive.">
        Create the single administrator login and choose the name shown
        throughout this installation.
      </Heading>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name">
          <Input
            value={props.displayName}
            onChange={(e) => props.setDisplayName(e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Password (12+ characters)">
          <Input
            type="password"
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Installation title">
          <Input
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
          />
        </Field>
        <Field label="Short subtitle">
          <Input
            value={props.subtitle}
            onChange={(e) => props.setSubtitle(e.target.value)}
          />
        </Field>
      </div>
    </>
  );
}
function Region(props: {
  locale: string;
  setLocale: (v: string) => void;
  timeZone: string;
  setTimeZone: (v: string) => void;
  baseCurrency: string;
  setBaseCurrency: (v: string) => void;
}) {
  return (
    <>
      <Heading
        eyebrow="REGIONAL SETTINGS"
        title="Dates and money that feel familiar."
      >
        These browser-detected suggestions control display only. Changing
        currency later never converts stored amounts.
      </Heading>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Locale">
          <Input
            value={props.locale}
            onChange={(e) => props.setLocale(e.target.value)}
          />
        </Field>
        <Field label="Time zone">
          <Input
            value={props.timeZone}
            onChange={(e) => props.setTimeZone(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <Input
            value={props.baseCurrency}
            onChange={(e) =>
              props.setBaseCurrency(e.target.value.toUpperCase())
            }
            maxLength={3}
          />
        </Field>
      </div>
    </>
  );
}
function Profiles(props: {
  profiles: string[];
  setProfiles: React.Dispatch<React.SetStateAction<string[]>>;
  newProfile: string;
  setNewProfile: (v: string) => void;
  addProfile: () => void;
}) {
  return (
    <>
      <Heading
        eyebrow="HOUSEHOLD PROFILES"
        title="Who does each thing belong to?"
      >
        Profiles are labels for filtering items, not separate logins. Their
        stable IDs remain intact if you rename them later.
      </Heading>
      <div className="mb-5 flex flex-wrap gap-2">
        {props.profiles.map((profile, index) => (
          <button
            key={`${profile}-${index}`}
            type="button"
            className="rounded-full border bg-background px-4 py-2 text-sm"
            onClick={() =>
              props.setProfiles((current) =>
                current.filter((_, currentIndex) => currentIndex !== index),
              )
            }
          >
            {profile} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={props.newProfile}
          onChange={(e) => props.setNewProfile(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.addProfile();
            }
          }}
          placeholder="Partner, Child, Studio…"
          maxLength={60}
        />
        <Button type="button" variant="outline" onClick={props.addProfile}>
          <Plus /> Add
        </Button>
      </div>
    </>
  );
}
function Collections({
  enabled,
  toggle,
}: {
  enabled: Exclude<Collection, 'all'>[];
  toggle: (collection: Exclude<Collection, 'all'>) => void;
}) {
  const available = collections.filter(
    (entry): entry is Exclude<Collection, 'all'> => entry !== 'all',
  );
  return (
    <>
      <Heading eyebrow="COLLECTIONS" title="Choose what belongs here.">
        Start with the areas you use now. Disabling a collection later hides it
        without deleting its items.
      </Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        {available.map((collection) => (
          <label
            key={collection}
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-4"
          >
            <input
              type="checkbox"
              checked={enabled.includes(collection)}
              onChange={() => toggle(collection)}
              className="size-4 accent-primary"
            />
            <span className="font-medium">{collectionLabels[collection]}</span>
          </label>
        ))}
      </div>
    </>
  );
}
function Features({
  features,
  setFeatures,
  shopExposureConfirmed,
  setShopExposureConfirmed,
}: {
  features: { wishlist: boolean; outfits: boolean; shop: boolean };
  setFeatures: React.Dispatch<
    React.SetStateAction<{ wishlist: boolean; outfits: boolean; shop: boolean }>
  >;
  shopExposureConfirmed: boolean;
  setShopExposureConfirmed: (confirmed: boolean) => void;
}) {
  const options = [
    {
      id: 'wishlist' as const,
      label: 'Wishlist',
      copy: 'Track things you may buy.',
    },
    {
      id: 'outfits' as const,
      label: 'Outfit ideas',
      copy: 'Build combinations from Fashion items.',
    },
    {
      id: 'shop' as const,
      label: 'Public shop',
      copy: 'Expose only listings and photos you explicitly publish.',
    },
  ];
  return (
    <>
      <Heading eyebrow="OPTIONAL FEATURES" title="Keep the useful parts close.">
        The public shop starts off unless you deliberately enable it. You can
        change every choice from Settings.
      </Heading>
      <div className="grid gap-3">
        {options.map((option) => (
          <div
            key={option.id}
            className="flex items-center justify-between gap-6 rounded-lg border p-4"
          >
            <div>
              <p className="font-semibold">{option.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {option.copy}
              </p>
            </div>
            <Switch
              checked={features[option.id]}
              onCheckedChange={(checked) =>
                setFeatures((current) => ({ ...current, [option.id]: checked }))
              }
            />
          </div>
        ))}
      </div>
      {features.shop && (
        <label className="mt-4 flex items-start gap-3 rounded-lg border p-4 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={shopExposureConfirmed}
            onChange={(event) => setShopExposureConfirmed(event.target.checked)}
          />
          <span>
            I understand that published listings and selected photos will be
            available without signing in. A public HTTPS URL must also be set
            with <code>MYSTUFF_PUBLIC_URL</code>.
          </span>
        </label>
      )}
    </>
  );
}
function FirstItem({
  demoData,
  setDemoData,
}: {
  demoData: boolean;
  setDemoData: (value: boolean) => void;
}) {
  return (
    <>
      <Heading
        eyebrow="YOUR FIRST ITEM"
        title="Start in the way that suits you."
      >
        After setup, add an item manually, start from a public product URL, or
        explore the empty collections first. Every empty collection links back
        to the same add-item flow.
      </Heading>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          'Add it yourself',
          'Start with a product link',
          'Explore empty collections',
        ].map((choice) => (
          <div
            key={choice}
            className="rounded-lg border p-4 text-sm font-semibold"
          >
            {choice}
          </div>
        ))}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border p-4 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={demoData}
          onChange={(event) => setDemoData(event.target.checked)}
        />
        <span>
          <strong>Add a synthetic demo set</strong>
          <br />
          Three clearly labelled Home, Pantry, and Pets examples help you
          explore. Move them to Trash whenever you are done.
        </span>
      </label>
    </>
  );
}
function Protect() {
  return (
    <>
      <Heading eyebrow="PROTECT THE DATA" title="Back up one directory.">
        Your database, photos, session key, and backup files live under{' '}
        <code>/data</code>. After setup, download the recovery guide and run
        this command regularly.
      </Heading>
      <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
        <code>
          docker compose exec app mystuff backup
          /data/backups/mystuff-backup.tar.gz
        </code>
      </pre>
      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
        <ShieldCheck className="mb-2 text-primary" />
        The recovery document contains commands and paths only. It never
        includes your password or setup token.
      </div>
    </>
  );
}
