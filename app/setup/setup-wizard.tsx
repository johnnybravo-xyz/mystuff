'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CircleAlert,
  Download,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { collections, collectionLabels } from '@/app/wardrobe/model';
import type { Collection } from '@/app/wardrobe/model';
import {
  administratorErrors,
  collectionErrors,
  featureErrors,
  profileErrors,
  regionErrors,
} from './validation';
import type { FieldErrors } from './validation';

type SetupCollection = Exclude<Collection, 'all'>;
type Features = { wishlist: boolean; outfits: boolean; shop: boolean };
type TokenStatus = 'unchecked' | 'checking' | 'valid' | 'invalid';

const steps = [
  'Welcome',
  'Administrator',
  'Region',
  'Profiles',
  'Collections',
  'Features',
  'Review',
];
const reviewStep = steps.length - 1;
const defaultCollections: SetupCollection[] = [
  'fashion',
  'home',
  'tech',
  'pantry',
  'pets',
  'other',
];
const backupCommand =
  'docker compose exec app mystuff backup /data/backups/mystuff-backup.tar.gz';

// Throws when the server cannot be reached.
async function requestTokenCheck(token: string) {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim(), verifyOnly: true }),
  });
  if (response.status === 409) return 'complete' as const;
  return response.ok ? ('valid' as const) : ('invalid' as const);
}

export function SetupWizard({
  initialToken,
  shopOrigin,
}: {
  initialToken: string;
  shopOrigin: string | null;
}) {
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(
    initialToken ? 'checking' : 'unchecked',
  );
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
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
  const [features, setFeatures] = useState<Features>({
    wishlist: true,
    outfits: true,
    shop: false,
  });
  const [shopExposureConfirmed, setShopExposureConfirmed] = useState(false);
  const [demoData, setDemoData] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const progress = `${Math.round(((step + 1) / steps.length) * 100)}%`;

  function errorsFor(index: number): FieldErrors {
    if (index === 0)
      return token.trim() ? {} : { token: 'Paste the code from your setup link.' };
    if (index === 1) {
      const errors = administratorErrors({
        displayName,
        password,
        title,
        subtitle,
      });
      if (!errors.password && password !== passwordConfirmation)
        errors.passwordConfirmation = 'The passwords do not match.';
      return errors;
    }
    if (index === 2) return regionErrors({ locale, timeZone, baseCurrency });
    if (index === 3) return profileErrors(profiles);
    if (index === 4) return collectionErrors(enabledCollections);
    if (index === 5)
      return featureErrors({
        shop: features.shop,
        shopExposureConfirmed,
        shopOrigin,
      });
    return {};
  }
  const fieldErrors = showErrors ? errorsFor(step) : {};

  function applyTokenCheck(result: 'valid' | 'invalid' | 'complete') {
    if (result === 'complete') window.location.assign('/signin');
    else setTokenStatus(result);
    return result === 'valid';
  }

  function tokenCheckFailed() {
    setTokenStatus('unchecked');
    setError(
      'My Stuff could not be reached. Check your connection and try again.',
    );
    return false;
  }

  async function checkToken(value: string) {
    setTokenStatus('checking');
    return requestTokenCheck(value).then(applyTokenCheck, tokenCheckFailed);
  }

  useEffect(() => {
    if (initialToken)
      void requestTokenCheck(initialToken).then(
        applyTokenCheck,
        tokenCheckFailed,
      );
  }, [initialToken]);

  function goTo(index: number) {
    setError('');
    setShowErrors(false);
    setStep(index);
  }

  async function next() {
    setError('');
    if (Object.keys(errorsFor(step)).length) {
      setShowErrors(true);
      return;
    }
    if (step === 0 && tokenStatus !== 'valid') {
      setPending(true);
      const valid = await checkToken(token);
      setPending(false);
      if (!valid) return;
    }
    if (step === reviewStep) {
      await finish();
      return;
    }
    goTo(step + 1);
  }

  async function finish() {
    setPending(true);
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          setup: {
            displayName,
            password,
            title,
            subtitle,
            locale,
            timeZone,
            baseCurrency,
            profiles,
            enabledCollections,
            features,
            shopExposureConfirmed,
            demoData,
          },
        }),
      });
      const body = await response.json();
      if (response.status === 401) {
        setTokenStatus('invalid');
        goTo(0);
        return;
      }
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

  function toggleCollection(collection: SetupCollection) {
    setEnabledCollections((current) =>
      current.includes(collection)
        ? current.filter((entry) => entry !== collection)
        : [...current, collection],
    );
  }

  function downloadRecoveryGuide() {
    const guide = `${title} recovery guide\n\nData directory: /data\nBackup: ${backupCommand}\nVerify: docker compose exec app mystuff restore --verify /data/backups/mystuff-backup.tar.gz\nPassword reset: docker compose exec app mystuff password reset\n\nThis document contains no password or access token.\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([guide], { type: 'text/plain' }));
    link.download = 'my-stuff-recovery.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (complete)
    return (
      <Complete
        onDownload={downloadRecoveryGuide}
        onSignIn={() => window.location.assign('/signin')}
      />
    );

  return (
    <main className="min-h-screen bg-muted/30 px-5 py-8 sm:py-12">
      <form
        className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) void next();
        }}
      >
        <header className="border-b px-6 py-5 sm:px-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Boxes className="text-primary" /> MY STUFF
            </span>
            <span className="text-sm text-muted-foreground">
              {steps[step]} · {step + 1} of {steps.length}
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
          {step === 0 && (
            <Welcome
              token={token}
              setToken={(value) => {
                setToken(value);
                setTokenStatus('unchecked');
              }}
              status={tokenStatus}
              error={fieldErrors.token}
            />
          )}
          {step === 1 && (
            <Administrator
              errors={fieldErrors}
              displayName={displayName}
              setDisplayName={setDisplayName}
              password={password}
              setPassword={setPassword}
              passwordConfirmation={passwordConfirmation}
              setPasswordConfirmation={setPasswordConfirmation}
              title={title}
              setTitle={setTitle}
              subtitle={subtitle}
              setSubtitle={setSubtitle}
            />
          )}
          {step === 2 && (
            <Region
              errors={fieldErrors}
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
              error={fieldErrors.profiles}
              profiles={profiles}
              setProfiles={setProfiles}
              newProfile={newProfile}
              setNewProfile={setNewProfile}
            />
          )}
          {step === 4 && (
            <Collections
              error={fieldErrors.collections}
              enabled={enabledCollections}
              toggle={toggleCollection}
            />
          )}
          {step === 5 && (
            <FeaturesStep
              errors={fieldErrors}
              shopOrigin={shopOrigin}
              features={features}
              setFeatures={setFeatures}
              shopExposureConfirmed={shopExposureConfirmed}
              setShopExposureConfirmed={setShopExposureConfirmed}
              demoData={demoData}
              setDemoData={setDemoData}
            />
          )}
          {step === reviewStep && (
            <Review
              edit={goTo}
              rows={[
                [1, 'Administrator', displayName.trim()],
                [1, 'Installation', `${title.trim()} — ${subtitle.trim()}`],
                [2, 'Region', `${locale} · ${timeZone} · ${baseCurrency}`],
                [3, 'Profiles', profiles.join(', ')],
                [
                  4,
                  'Collections',
                  enabledCollections
                    .map((collection) => collectionLabels[collection])
                    .join(', '),
                ],
                [
                  5,
                  'Features',
                  [
                    features.wishlist && 'Wishlist',
                    features.outfits && 'Outfit ideas',
                    features.shop && 'Public shop',
                    demoData && 'Demo items',
                  ]
                    .filter(Boolean)
                    .join(', ') || 'None',
                ],
              ]}
            />
          )}
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
            type="button"
            variant="ghost"
            disabled={step === 0 || pending}
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeft /> Back
          </Button>
          <Button type="submit" disabled={pending}>
            {step === reviewStep ? (
              <>
                {pending ? 'Creating your archive…' : 'Finish setup'} <Check />
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </Button>
        </footer>
      </form>
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
    <div className="mb-8 grid gap-3">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-heading text-4xl font-semibold">{title}</h1>
      <p className="max-w-2xl leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}
function TextField({
  id,
  label,
  value,
  onChange,
  error,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'id'>) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
    </Field>
  );
}
function Welcome({
  token,
  setToken,
  status,
  error,
}: {
  token: string;
  setToken: (value: string) => void;
  status: TokenStatus;
  error?: string;
}) {
  return (
    <>
      <Heading eyebrow="WELCOME" title="Make this collection yours.">
        My Stuff keeps one household’s things, photos, and notes together,
        privately, on your own server. Your setup link carries a one-time code
        that proves this installation is yours.
      </Heading>
      <TextField
        id="setup-token"
        label="Setup code"
        value={token}
        onChange={setToken}
        error={error}
        placeholder="Paste the code from your setup link"
        autoComplete="off"
        spellCheck={false}
      />
      {status === 'checking' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Checking your link…
        </p>
      )}
      {status === 'valid' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-primary">
          <Check className="size-4" /> Link verified. Continue to create your
          login.
        </p>
      )}
      {status === 'invalid' && (
        <SetupLinkHelp title="This setup link has expired">
          <p>
            This page was opened from an older link. Restarting My Stuff keeps
            the same link, but reinstalling it or renewing the link replaces
            it, so earlier tabs and bookmarks stop working.
          </p>
          <p>
            Ask the person who installed My Stuff for the latest link. They can
            find it in the server logs, where it appears each time My Stuff
            starts. Opening it starts setup from the beginning.
          </p>
        </SetupLinkHelp>
      )}
      {status === 'unchecked' && !token.trim() && (
        <SetupLinkHelp title="You need a setup link to continue">
          <p>
            Setup starts from a private link created when My Stuff was
            installed. Ask the person who installed it to check the server logs
            for the setup link, then open it here.
          </p>
        </SetupLinkHelp>
      )}
    </>
  );
}
function SetupLinkHelp({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-4 grid gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed"
      role="alert"
    >
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <CircleAlert className="size-4" /> {title}
      </p>
      <div className="grid gap-2 text-muted-foreground">{children}</div>
    </div>
  );
}
function Administrator(props: {
  errors: FieldErrors;
  displayName: string;
  setDisplayName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  passwordConfirmation: string;
  setPasswordConfirmation: (v: string) => void;
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
        <TextField
          id="display-name"
          label="Your name"
          value={props.displayName}
          onChange={props.setDisplayName}
          error={props.errors.displayName}
          autoComplete="name"
        />
        <div className="hidden sm:block" />
        <TextField
          id="password"
          label="Password (12+ characters)"
          type="password"
          value={props.password}
          onChange={props.setPassword}
          error={props.errors.password}
          autoComplete="new-password"
        />
        <TextField
          id="password-confirmation"
          label="Repeat password"
          type="password"
          value={props.passwordConfirmation}
          onChange={props.setPasswordConfirmation}
          error={props.errors.passwordConfirmation}
          autoComplete="new-password"
        />
        <TextField
          id="title"
          label="Installation title"
          value={props.title}
          onChange={props.setTitle}
          error={props.errors.title}
          maxLength={80}
        />
        <TextField
          id="subtitle"
          label="Short subtitle"
          value={props.subtitle}
          onChange={props.setSubtitle}
          error={props.errors.subtitle}
          maxLength={160}
        />
      </div>
    </>
  );
}
function regionPreview(locale: string, timeZone: string, currency: string) {
  try {
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date());
    const amount = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(1234.5);
    return `${date} · ${amount}`;
  } catch {
    return null;
  }
}
function Region(props: {
  errors: FieldErrors;
  locale: string;
  setLocale: (v: string) => void;
  timeZone: string;
  setTimeZone: (v: string) => void;
  baseCurrency: string;
  setBaseCurrency: (v: string) => void;
}) {
  const timeZones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const currencies = useMemo(() => Intl.supportedValuesOf('currency'), []);
  const valid = !Object.keys(
    regionErrors({
      locale: props.locale,
      timeZone: props.timeZone,
      baseCurrency: props.baseCurrency,
    }),
  ).length;
  const preview = valid
    ? regionPreview(props.locale, props.timeZone, props.baseCurrency)
    : null;
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
        <TextField
          id="locale"
          label="Locale"
          value={props.locale}
          onChange={props.setLocale}
          error={props.errors.locale}
          placeholder="en-GB"
        />
        <TextField
          id="time-zone"
          label="Time zone"
          value={props.timeZone}
          onChange={props.setTimeZone}
          error={props.errors.timeZone}
          list="time-zones"
        />
        <TextField
          id="currency"
          label="Currency"
          value={props.baseCurrency}
          onChange={(value) => props.setBaseCurrency(value.toUpperCase())}
          error={props.errors.baseCurrency}
          list="currencies"
          maxLength={3}
        />
      </div>
      <datalist id="time-zones">
        {timeZones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </datalist>
      <datalist id="currencies">
        {currencies.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </datalist>
      {preview && (
        <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
          <span className="text-muted-foreground">Preview: </span>
          {preview}
        </p>
      )}
    </>
  );
}
function Profiles(props: {
  error?: string;
  profiles: string[];
  setProfiles: React.Dispatch<React.SetStateAction<string[]>>;
  newProfile: string;
  setNewProfile: (v: string) => void;
}) {
  const label = props.newProfile.trim();
  const duplicate = props.profiles.some(
    (profile) => profile.toLocaleLowerCase() === label.toLocaleLowerCase(),
  );
  const full = props.profiles.length >= 20;
  const addError = duplicate
    ? `${label} is already a profile.`
    : full
      ? 'You can add up to 20 profiles.'
      : undefined;

  function addProfile() {
    if (!label || addError) return;
    props.setProfiles((current) => [...current, label]);
    props.setNewProfile('');
  }

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
            aria-label={`Remove ${profile}`}
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
          aria-label="New profile"
          value={props.newProfile}
          onChange={(e) => props.setNewProfile(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && label) {
              e.preventDefault();
              addProfile();
            }
          }}
          placeholder="Partner, Child, Studio…"
          maxLength={60}
          aria-invalid={label && addError ? true : undefined}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!label || Boolean(addError)}
          onClick={addProfile}
        >
          <Plus /> Add
        </Button>
      </div>
      <div className="mt-3">
        <FieldError message={(label && addError) || props.error} />
      </div>
    </>
  );
}
function Collections({
  error,
  enabled,
  toggle,
}: {
  error?: string;
  enabled: SetupCollection[];
  toggle: (collection: SetupCollection) => void;
}) {
  const available = collections.filter(
    (entry): entry is SetupCollection => entry !== 'all',
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
      <div className="mt-4">
        <FieldError message={error} />
      </div>
    </>
  );
}
function FeaturesStep({
  errors,
  shopOrigin,
  features,
  setFeatures,
  shopExposureConfirmed,
  setShopExposureConfirmed,
  demoData,
  setDemoData,
}: {
  errors: FieldErrors;
  shopOrigin: string | null;
  features: Features;
  setFeatures: React.Dispatch<React.SetStateAction<Features>>;
  shopExposureConfirmed: boolean;
  setShopExposureConfirmed: (confirmed: boolean) => void;
  demoData: boolean;
  setDemoData: (value: boolean) => void;
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
      copy: shopOrigin
        ? `Publish chosen listings and photos at ${shopOrigin}.`
        : 'Available once My Stuff has a public web address. You can turn it on later from Settings.',
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
              aria-label={option.label}
              checked={features[option.id]}
              disabled={
                option.id === 'shop' && !shopOrigin && !features.shop
              }
              onCheckedChange={(checked) =>
                setFeatures((current) => ({ ...current, [option.id]: checked }))
              }
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-6 rounded-lg border p-4">
          <div>
            <p className="font-semibold">Demo items</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Three clearly labelled Home, Pantry, and Pets examples to explore.
              Move them to Trash whenever you are done.
            </p>
          </div>
          <Switch
            aria-label="Demo items"
            checked={demoData}
            onCheckedChange={setDemoData}
          />
        </div>
      </div>
      <FieldError message={errors.shop} />
      {features.shop && shopOrigin && (
        <label className="mt-4 flex items-start gap-3 rounded-lg border p-4 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={shopExposureConfirmed}
            onChange={(event) => setShopExposureConfirmed(event.target.checked)}
            aria-invalid={errors.shopExposureConfirmed ? true : undefined}
          />
          <span>
            I understand that published listings and selected photos will be
            available at {shopOrigin} without signing in.
          </span>
        </label>
      )}
      <div className="mt-3">
        <FieldError message={errors.shopExposureConfirmed} />
      </div>
    </>
  );
}
function Review({
  rows,
  edit,
}: {
  rows: [number, string, string][];
  edit: (step: number) => void;
}) {
  return (
    <>
      <Heading eyebrow="REVIEW" title="Ready when you are.">
        Nothing is saved until you finish. Everything except the password can
        be changed later from Settings.
      </Heading>
      <dl className="divide-y rounded-lg border">
        {rows.map(([step, label, value]) => (
          <div key={label} className="flex items-start gap-4 p-4">
            <dt className="w-32 shrink-0 text-sm text-muted-foreground">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm break-words">{value}</dd>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => edit(step)}
            >
              Edit
            </Button>
          </div>
        ))}
      </dl>
    </>
  );
}
function Complete({
  onDownload,
  onSignIn,
}: {
  onDownload: () => void;
  onSignIn: () => void;
}) {
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
        <div className="mb-8 grid gap-4 leading-relaxed text-muted-foreground">
          <p>
            Sign in with the password you just created, then add your first
            item yourself or start from a product link.
          </p>
          <p>
            Keep a copy of the recovery guide somewhere safe. It explains how
            to back up and restore your collection and never contains your
            password.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={onDownload} variant="outline">
            <Download /> Recovery guide
          </Button>
          <Button onClick={onSignIn}>
            <ShieldCheck /> Sign in
          </Button>
        </div>
      </section>
    </main>
  );
}
