export const owners = [
  'me',
  'wife',
  'child',
  'household',
  'unassigned',
] as const;
export type Owner = string;
export const statuses = [
  'owned',
  'wishlist',
  'review',
  'awaiting_delivery',
  'returned',
  'retired',
  'outgrown',
  'trashed',
] as const;
export type Status = (typeof statuses)[number];
export const categories = [
  'shirt',
  'tshirt',
  'polo',
  'jeans',
  'trousers',
  'shorts',
  'dress',
  'skirt',
  'set',
  'jacket',
  'knitwear',
  'shoes',
  'accessory',
  'fragrance',
  'underwear',
  'sleepwear',
  'furniture',
  'lighting',
  'appliance',
  'kitchenware',
  'phone',
  'laptop',
  'tablet',
  'smartwatch',
  'watch',
  'speaker',
  'headphones',
  'camera',
  'lens',
  'keyboard',
  'gaming',
  'vehicle',
  'spirit',
  'coffee',
  'tea',
  'cooking_oil',
  'seasoning',
  'other_consumable',
  'pet',
  'pet_supply',
  'pet_care',
  'baby_gear',
  'musical_instrument',
  'tool',
  'other',
] as const;
export type Category = (typeof categories)[number];
export type OwnerFilter = Owner | 'all';
export const occasions = ['everyday', 'smart', 'dapper'] as const;
export type Occasion = (typeof occasions)[number];
export const occasionOptions = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'smart', label: 'Smart' },
  { value: 'dapper', label: 'Dapper' },
];
export function normalizeOccasion(value: unknown): Occasion {
  return occasions.includes(value as Occasion)
    ? (value as Occasion)
    : 'everyday';
}
export type Temperature = 'warm' | 'mild' | 'cool';
export type Fulfillment =
  | 'delivered'
  | 'in_transit'
  | 'return_unknown'
  | 'returned'
  | 'cancelled';
export type ProductPhoto = {
  imageId: string;
  kind: 'model' | 'product' | 'detail' | 'personal';
  alt: string;
  sourceUrl?: string;
  referenceConfirmed?: boolean;
};
export const photoKindLabels = {
  product: 'Product only',
  model: 'Worn view',
  detail: 'Detail / reference',
  personal: 'Other personal photo',
};
export type SourceFacts = {
  id: string;
  sourceKey: string;
  retailer: string;
  orderId: string;
  orderDate: string;
  parcel: string;
  fulfillment: Fulfillment;
  sourceStatus: string;
  article: string;
  name: string;
  colour: string;
  size: string;
  quantity: number;
  price: number | null;
  paid: number | null;
  productUrl: string | null;
  sourceImageUrl: string | null;
  imageId: string | null;
  photos?: ProductPhoto[];
};
export type FragranceDetails = {
  concentration: string;
  family: string;
  notes: string;
  variantConfirmed: boolean;
};
export type ItemPrice = {
  amount: number;
  isLowerBound?: boolean;
  currency: string;
  basis: 'purchase' | 'retail' | 'estimate';
  checkedAt: string;
  sourceUrl?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSourceUrl?: string;
};
export type ItemSale = {
  published: boolean;
  askingPrice: number | null;
  currency?: string;
  description: string;
  photoIds: string[];
};
export type WardrobeItem = {
  id: string;
  sourceKey: string;
  purchaseId: string | null;
  owner: Owner;
  status: Status;
  name: string;
  brand: string;
  category: Category;
  colour: string;
  size: string;
  quantity: number | null;
  fit: string;
  pattern: string;
  warmth: 'light' | 'medium' | 'warm';
  notes: string;
  favourite: boolean;
  price?: ItemPrice | null;
  sale?: ItemSale | null;
  imageId: string | null;
  photos?: ProductPhoto[];
  productUrl: string | null;
  updatedAt: string;
  facts?: SourceFacts;
  fragrance?: FragranceDetails;
  details?: Array<{ label: string; value: string }>;
  location?: string;
  purchaseDate?: string;
  purchaseVendor?: string;
  purchaseLocation?: string;
  trash?: { previousStatus: Exclude<Status, 'trashed'>; trashedAt: string };
};
export type Outfit = {
  id: string;
  owner: Owner;
  name: string;
  occasion: Occasion;
  temperature: Temperature;
  itemIds: string[];
  notes: string;
  createdAt: string;
};
export type Preferences = {
  blurPrices?: boolean;
};
export type ImportBatch = {
  id: string;
  label: string;
  importedAt: string;
  source: string;
  orderCount: number;
  listedItemCount: number;
  newItems: number;
  updatedPurchases: number;
};
export type ItemGroup = {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type Archive = {
  items: WardrobeItem[];
  groups: ItemGroup[];
  outfits: Outfit[];
  batches: ImportBatch[];
  preferences: Preferences;
};
export type ImportImage = {
  id: string;
  contentType: string;
  base64: string;
  filename?: string;
};
export type ImportPayload = {
  version: 1;
  label: string;
  source: string;
  orderCount: number;
  listedItemCount: number;
  purchases: SourceFacts[];
  items: WardrobeItem[];
  images?: ImportImage[];
};
export type ArchiveAction =
  | { action: 'import'; payload: ImportPayload }
  | {
      action: 'update';
      ids: string[];
      patch: Partial<WardrobeItem>;
      expectedUpdatedAt?: Record<string, string>;
    }
  | { action: 'add'; item: Partial<WardrobeItem>; requestId?: string }
  | {
      action: 'create_group';
      group: { name: string; itemIds?: string[] };
      requestId?: string;
    }
  | {
      action: 'update_group';
      id: string;
      patch: { name?: string; itemIds?: string[] };
      expectedUpdatedAt: string;
    }
  | { action: 'delete_group'; id: string; expectedUpdatedAt: string }
  | {
      action: 'set_item_group';
      itemId: string;
      groupId: string | null;
      expectedGroupId: string | null;
    }
  | {
      action: 'trash' | 'restore';
      ids: string[];
      expectedUpdatedAt?: Record<string, string>;
    }
  | { action: 'save_outfit'; outfit: Outfit }
  | { action: 'delete_outfit'; id: string }
  | { action: 'preferences'; preferences: Preferences };
export const defaultPreferences: Preferences = {
  blurPrices: true,
};
export const ownerLabels: Record<string, string> = {
  me: 'Me',
  wife: 'Wife',
  child: 'Child',
  household: 'Household',
  unassigned: 'Unassigned',
};
export type HouseholdProfile = {
  id: string;
  label: string;
  position: number;
};
export function profileLabel(owner: string, profiles: HouseholdProfile[] = []) {
  return (
    profiles.find((profile) => profile.id === owner)?.label ||
    ownerLabels[owner] ||
    'Unassigned'
  );
}
export const statusLabels: Record<Status, string> = {
  wishlist: 'Wishlist',
  owned: 'Owned',
  review: 'Needs review',
  awaiting_delivery: 'Awaiting delivery',
  returned: 'Returned',
  retired: 'No longer owned',
  outgrown: 'Outgrown',
  trashed: 'Trash',
};
export const categoryLabels: Record<Category, string> = {
  shirt: 'Shirts',
  tshirt: 'T-shirts',
  polo: 'Polos',
  jeans: 'Jeans',
  trousers: 'Trousers',
  shorts: 'Shorts',
  dress: 'Dresses',
  skirt: 'Skirts',
  set: 'Sets',
  jacket: 'Jackets',
  knitwear: 'Knitwear',
  shoes: 'Shoes',
  accessory: 'Accessories',
  fragrance: 'Fragrances',
  underwear: 'Underwear',
  sleepwear: 'Sleepwear',
  furniture: 'Furniture',
  lighting: 'Lighting',
  appliance: 'Appliances',
  kitchenware: 'Kitchenware',
  phone: 'Phones',
  laptop: 'Laptops',
  tablet: 'Tablets',
  smartwatch: 'Smartwatches',
  watch: 'Watches',
  speaker: 'Speakers',
  headphones: 'Headphones & earbuds',
  camera: 'Cameras',
  lens: 'Camera lenses',
  keyboard: 'Keyboards',
  gaming: 'Gaming',
  vehicle: 'Vehicles',
  spirit: 'Spirits',
  coffee: 'Coffee',
  tea: 'Tea',
  cooking_oil: 'Oils',
  seasoning: 'Salts & seasonings',
  other_consumable: 'Other consumables',
  pet: 'Pets',
  pet_supply: 'Pet supplies',
  pet_care: 'Pet care',
  baby_gear: 'Baby gear',
  musical_instrument: 'Musical instruments',
  tool: 'Tools',
  other: 'Other',
};

export const collections = [
  'all',
  'fashion',
  'home',
  'tech',
  'watches',
  'vehicles',
  'spirits',
  'pantry',
  'pets',
  'kids',
  'other',
] as const;
export type Collection = (typeof collections)[number];
export const collectionLabels: Record<Collection, string> = {
  all: 'All my stuff',
  fashion: 'Fashion',
  home: 'Home & living',
  tech: 'Technology',
  watches: 'Watches',
  vehicles: 'Vehicles',
  spirits: 'Spirits',
  pantry: 'Pantry',
  pets: 'Pets',
  kids: 'Kid’s gear',
  other: 'Other belongings',
};
export const collectionHeadings: Record<Collection, string> = {
  all: 'All your stuff.',
  fashion: 'Your wardrobe.',
  home: 'At home.',
  tech: 'Everyday technology.',
  watches: 'On your wrist.',
  vehicles: 'On the road.',
  spirits: 'On the shelf.',
  pantry: 'Bought, brewed, tasted.',
  pets: 'Part of the family.',
  kids: 'For the little one.',
  other: 'The rest of your world.',
};
export function collectionFor(category: Category): Exclude<Collection, 'all'> {
  if (['furniture', 'lighting', 'appliance', 'kitchenware'].includes(category))
    return 'home';
  if (
    [
      'phone',
      'laptop',
      'tablet',
      'smartwatch',
      'speaker',
      'headphones',
      'camera',
      'lens',
      'keyboard',
      'gaming',
    ].includes(category)
  )
    return 'tech';
  if (category === 'watch') return 'watches';
  if (category === 'vehicle') return 'vehicles';
  if (category === 'spirit') return 'spirits';
  if (
    ['coffee', 'tea', 'cooking_oil', 'seasoning', 'other_consumable'].includes(
      category,
    )
  )
    return 'pantry';
  if (['pet', 'pet_supply', 'pet_care'].includes(category)) return 'pets';
  if (category === 'baby_gear') return 'kids';
  return ['other', 'musical_instrument', 'tool'].includes(category)
    ? 'other'
    : 'fashion';
}
export function isClothing(item: Pick<WardrobeItem, 'category'>) {
  return (
    collectionFor(item.category) === 'fashion' && item.category !== 'fragrance'
  );
}
export function stylingAccessoryKind(
  item: Pick<WardrobeItem, 'category'> & Partial<Pick<WardrobeItem, 'name'>>,
) {
  if (item.category !== 'accessory') return '';
  const name = (item.name || '').toLowerCase();
  if (/wallet|duffel|backpack|pannier|key|luggage|bag|carrier/.test(name))
    return '';
  if (/\bbelt\b/.test(name)) return 'belt';
  if (/\b(scarf|shawl)\b/.test(name)) return 'scarf';
  if (/\b(hat|cap|beanie)\b/.test(name)) return 'headwear';
  if (/\b(tie|pocket square)\b/.test(name)) return 'tie';
  if (/\b(necklace|bracelet|earrings|sunglasses)\b/.test(name))
    return 'jewellery';
  return '';
}
export function supportsStyling(
  item: Pick<WardrobeItem, 'category'> & Partial<Pick<WardrobeItem, 'name'>>,
) {
  if (item.category === 'accessory') return Boolean(stylingAccessoryKind(item));
  return (
    collectionFor(item.category) === 'fashion' &&
    !['underwear', 'sleepwear', 'other'].includes(item.category)
  );
}
export function orderedCoverPhotos(
  photos: ProductPhoto[],
  imageId: string | null | undefined,
  clothing: boolean,
): ProductPhoto[] {
  const selected = photos.find((photo) => photo.imageId === imageId);
  const products = photos.filter((photo) => photo.kind === 'product');
  products.sort(
    (a, b) =>
      Number(b.referenceConfirmed !== false) -
      Number(a.referenceConfirmed !== false),
  );
  return [
    ...(selected ? [selected] : []),
    ...products,
    ...(clothing ? photos.filter((photo) => photo.kind === 'model') : []),
  ].filter((photo, index) => index === 0 || photo !== selected);
}

export function coverPhotos(item: WardrobeItem): ProductPhoto[] {
  return orderedCoverPhotos(itemPhotos(item), item.imageId, isClothing(item));
}

export function inferCategory(name: string): Category {
  const value = name.toLowerCase();
  if (/sofa|dining|bench|armchair|furniture/.test(value)) return 'furniture';
  if (/lamp|pendant/.test(value)) return 'lighting';
  if (
    /\bknife\b|\bknives\b|\bsantoku\b|\bcookware\b|\bcutlery\b|\bespresso (?:cups?|mugs?)\b|\bespressokopp\b/.test(
      value,
    )
  )
    return 'kitchenware';
  if (/espresso|coffee machine/.test(value)) return 'appliance';
  if (/\bguitar\b|\bpiano\b|\bukulele\b/.test(value))
    return 'musical_instrument';
  if (/\bmulti[ -]?tool\b/.test(value)) return 'tool';
  if (
    /\bwallet\b|\bduffel\b|\bbackpack\b|\bpannier\b|\bkey organi[sz]er\b|\b(?:camera|lens) bag\b/.test(
      value,
    )
  )
    return 'accessory';
  if (/\bkeyboard\b/.test(value)) return 'keyboard';
  if (/\bheadphones?\b|\bearbuds?\b|\bairpods\b/.test(value))
    return 'headphones';
  if (/\blens\b|\blenses\b|\bxf\d{1,3}(?:-\d{1,3})?mm(?:f\d|\b)/.test(value))
    return 'lens';
  if (/\bcamera\b|\bfujifilm x-h2\b/.test(value)) return 'camera';
  if (/\biphone\b|\bsmartphone\b|\bmobile phone\b/.test(value)) return 'phone';
  if (/macbook|laptop/.test(value)) return 'laptop';
  if (/ipad|tablet/.test(value)) return 'tablet';
  if (/apple watch|smartwatch/.test(value)) return 'smartwatch';
  if (/tissot|casio|tag heuer|wristwatch/.test(value)) return 'watch';
  if (/sonos|emberton|speaker/.test(value)) return 'speaker';
  if (/xbox|playstation|console/.test(value)) return 'gaming';
  if (
    /mercedes|\bamg\b|\bskoda\b|škoda\b|vehicle|\bmotorcycle\b|\bcb350rs\b/.test(
      value,
    )
  )
    return 'vehicle';
  if (/whisky|whiskey|cachaça|cachaca|pisco/.test(value)) return 'spirit';
  if (/crib|stroller|highchair|high chair|baby carrier|car seat/.test(value))
    return 'baby_gear';
  if (/perfume|parfum|fragrance|cologne|eau de toilette/.test(value))
    return 'fragrance';
  if (/boxer|brief|trunk|underwear|bralette|\bbra\b/.test(value))
    return 'underwear';
  if (/pyjama|pajama|nightdress/.test(value)) return 'sleepwear';
  if (/loafers|sneakers|trainers|shoes|sandals|boots/.test(value))
    return 'shoes';
  if (/belt|cap\b|hat\b|socks|scarf|bag\b/.test(value)) return 'accessory';
  if (/jacket|blazer|coat\b/.test(value)) return 'jacket';
  if (/dress/.test(value)) return 'dress';
  if (/set\b/.test(value)) return 'set';
  if (/jeans/.test(value)) return 'jeans';
  if (/trousers|chinos|joggers/.test(value)) return 'trousers';
  if (/shorts/.test(value)) return 'shorts';
  if (/skirt/.test(value)) return 'skirt';
  if (/polo/.test(value)) return 'polo';
  if (/jumper|cardigan|sweater|sweatshirt|hoodie/.test(value))
    return 'knitwear';
  if (/t-shirt|tee\b|hammo|top\b|\bbody\b|bodysuit/.test(value))
    return 'tshirt';
  if (/shirt|blouse/.test(value)) return 'shirt';
  return 'other';
}

export function inferPattern(text: string): string {
  if (/herringbone/i.test(text)) return 'Herringbone';
  if (/stripe/i.test(text)) return 'Striped';
  if (/check|plaid/i.test(text)) return 'Checked';
  if (/print|pattern|floral|paisley/i.test(text)) return 'Patterned';
  return '';
}

export function nextUpdatedAt(previous?: string): string {
  const previousTime = previous ? Date.parse(previous) : 0;
  return new Date(
    Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0),
  ).toISOString();
}

export function purchaseItems(facts: SourceFacts): WardrobeItem[] {
  return Array.from({ length: facts.quantity }, (_, index) => ({
    id: `${facts.id}-${index + 1}`,
    sourceKey: `${facts.sourceKey}:unit:${index + 1}`,
    purchaseId: facts.id,
    owner: 'unassigned',
    status:
      facts.fulfillment === 'returned' || facts.fulfillment === 'cancelled'
        ? 'returned'
        : facts.fulfillment === 'in_transit'
          ? 'awaiting_delivery'
          : 'review',
    name: facts.name,
    brand: facts.retailer,
    category: inferCategory(facts.name),
    colour: facts.colour,
    size: facts.size,
    quantity: 1,
    fit:
      facts.name.match(
        /(regular|slim|loose|relaxed|oversized|straight)\s*(fit)?/i,
      )?.[0] || '',
    pattern: inferPattern(`${facts.name} ${facts.colour}`),
    warmth: /corduroy|jacket|sweater|hoodie/i.test(facts.name)
      ? 'medium'
      : 'light',
    notes: '',
    favourite: false,
    imageId:
      facts.photos?.find((photo) => photo.kind === 'product')?.imageId || null,
    productUrl: facts.productUrl,
    updatedAt: new Date().toISOString(),
  }));
}

export function reconcileItem(
  existing: WardrobeItem,
  incoming: WardrobeItem,
  facts?: SourceFacts,
): WardrobeItem {
  let status =
    existing.status === 'trashed'
      ? existing.trash!.previousStatus
      : existing.status;
  if (facts?.fulfillment === 'returned' || facts?.fulfillment === 'cancelled')
    status = 'returned';
  else if (
    facts?.fulfillment === 'in_transit' &&
    !['returned', 'retired', 'outgrown'].includes(status)
  )
    status = 'awaiting_delivery';
  else if (
    facts?.fulfillment === 'return_unknown' &&
    existing.facts?.fulfillment !== 'return_unknown' &&
    !['returned', 'retired', 'outgrown'].includes(status)
  )
    status = 'review';
  else if (status === 'awaiting_delivery' && facts?.fulfillment === 'delivered')
    status = 'review';
  return {
    ...existing,
    status: existing.status === 'trashed' ? 'trashed' : status,
    ...(existing.sale && (existing.status === 'trashed' || status !== 'owned')
      ? { sale: { ...existing.sale, published: false } }
      : {}),
    ...(existing.trash
      ? { trash: { ...existing.trash, previousStatus: status } }
      : {}),
    imageId: existing.imageId || incoming.imageId,
    photos: [
      ...new Map(
        [...(incoming.photos || []), ...(existing.photos || [])].map(
          (photo) => [photo.imageId, photo],
        ),
      ).values(),
    ],
    productUrl: existing.productUrl || incoming.productUrl,
    updatedAt: nextUpdatedAt(existing.updatedAt),
  };
}

export function itemPhotos(item: WardrobeItem): ProductPhoto[] {
  const photos = [...(item.facts?.photos || []), ...(item.photos || [])];
  if (item.imageId && !photos.some((photo) => photo.imageId === item.imageId))
    photos.unshift({
      imageId: item.imageId,
      kind: 'product',
      alt: item.name,
    });
  return [...new Map(photos.map((photo) => [photo.imageId, photo])).values()];
}

export function productCover(item: WardrobeItem): string | null {
  return coverPhotos(item)[0]?.imageId || null;
}

export function colourFamily(colour: string): string {
  const value = colour.toLowerCase();
  if (!value || value === 'unknown') return 'unknown';
  const families: [RegExp, string][] = [
    [/black/, 'black'],
    [/white|ivory|cream|bone/, 'white'],
    [/grey|gray/, 'grey'],
    [/navy|blue|denim/, 'blue'],
    [/beige|sand|ecru/, 'beige'],
    [/brown|toffee|ganache|mink|taupe|camel|\btan\b/, 'brown'],
    [/green|olive|khaki/, 'green'],
    [/red|burgundy/, 'red'],
    [/pink/, 'pink'],
    [/purple|lilac/, 'purple'],
    [/yellow/, 'yellow'],
    [/orange/, 'orange'],
  ];
  return families.find(([pattern]) => pattern.test(value))?.[1] || 'other';
}

export function reviewReason(item: WardrobeItem): string {
  if (item.status === 'awaiting_delivery')
    return 'This parcel is still on its way.';
  if (item.facts?.fulfillment === 'return_unknown')
    return 'H&M reports a return in this parcel. Confirm whether you kept this piece.';
  if (item.owner === 'unassigned')
    return 'Choose who this belongs to and confirm it is still owned.';
  return 'Confirm this piece is still in the wardrobe.';
}

export function isAvailable(item: WardrobeItem, owner: Owner): boolean {
  return (
    owner !== 'unassigned' &&
    item.owner === owner &&
    item.status === 'owned' &&
    !['in_transit', 'returned', 'cancelled'].includes(
      item.facts?.fulfillment || '',
    )
  );
}
