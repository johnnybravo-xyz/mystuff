// Shared by the setup wizard (browser) and completeSetup (server). Keep this
// module free of Node, database, and path-alias imports so both can load it.

export type FieldErrors = Record<string, string>;

export function validLocale(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 35) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validCurrency(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: value }).format(
      1,
    );
    return true;
  } catch {
    return false;
  }
}

export function administratorErrors(input: {
  displayName: string;
  password: string;
  title: string;
  subtitle: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const displayName = input.displayName.trim();
  const title = input.title.trim();
  const subtitle = input.subtitle.trim();
  if (!displayName) errors.displayName = 'Enter an administrator name.';
  else if (displayName.length > 80)
    errors.displayName = 'Keep the name to 80 characters.';
  if (input.password.length < 12 || input.password.length > 1024)
    errors.password = 'Use a password between 12 and 1,024 characters.';
  if (!title) errors.title = 'Enter an installation title.';
  else if (title.length > 80) errors.title = 'Keep the title to 80 characters.';
  if (!subtitle) errors.subtitle = 'Enter a subtitle.';
  else if (subtitle.length > 160)
    errors.subtitle = 'Keep the subtitle to 160 characters.';
  return errors;
}

export function regionErrors(input: {
  locale: string;
  timeZone: string;
  baseCurrency: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!validLocale(input.locale))
    errors.locale = 'Choose a valid locale, such as en-GB.';
  if (!validTimeZone(input.timeZone))
    errors.timeZone = 'Choose a valid time zone, such as Europe/London.';
  if (!validCurrency(input.baseCurrency))
    errors.baseCurrency = 'Choose a valid currency code, such as GBP.';
  return errors;
}

export function profileErrors(labels: string[]): FieldErrors {
  const trimmed = labels.map((label) => label.trim()).filter(Boolean);
  if (!trimmed.length || trimmed.length > 20)
    return { profiles: 'Add between one and 20 household profiles.' };
  if (trimmed.some((label) => label.length > 60))
    return { profiles: 'Keep each profile label to 60 characters.' };
  const unique = new Set(trimmed.map((label) => label.toLocaleLowerCase()));
  if (unique.size !== trimmed.length)
    return { profiles: 'Profile labels must be different.' };
  return {};
}

export function collectionErrors(enabled: string[]): FieldErrors {
  return enabled.length
    ? {}
    : { collections: 'Enable at least one collection.' };
}

export function featureErrors(input: {
  shop: boolean;
  shopExposureConfirmed: boolean;
  shopOrigin: string | null;
}): FieldErrors {
  if (!input.shop) return {};
  if (!input.shopOrigin)
    return {
      shop: 'Set MYSTUFF_PUBLIC_URL to the public HTTPS origin and restart before enabling the shop.',
    };
  if (!input.shopExposureConfirmed)
    return {
      shopExposureConfirmed:
        'Confirm that published listings and photos will be public.',
    };
  return {};
}
