import { accountForRequest, errorResponse } from '@/app/wardrobe/server';
import { getInstallation } from '@/app/installation';
import { shopCurrencies } from '@/app/wardrobe/shop-model';
import {
  categories,
  categoryLabels,
  collectionFor,
  collections,
  collectionLabels,
  ownerLabels,
  statuses,
  statusLabels,
} from '@/app/wardrobe/model';

export async function GET(request: Request) {
  try {
    await accountForRequest(request);
    const installation = await getInstallation();
    const { settings, profiles } = installation;
    return Response.json(
      {
        version: 1,
        categories: categories.map((id) => ({
          id,
          label: categoryLabels[id],
          collection: collectionFor(id),
        })),
        collections: collections
          .filter((id) => id !== 'all')
          .map((id) => ({ id, label: collectionLabels[id] })),
        owners: [
          ...profiles.map(({ id, label }) => ({ id, label })),
          { id: 'unassigned', label: ownerLabels.unassigned },
        ],
        statuses: statuses.map((id) => ({
          id,
          label: statusLabels[id],
        })),
        endpoints: {
          archive: '/api/archive',
          preview: '/api/product-preview',
          images: '/api/images',
        },
        actions: [
          'add',
          'update',
          'trash',
          'restore',
          'create_group',
          'update_group',
          'delete_group',
          'set_item_group',
        ],
        groups: {
          fields: ['id', 'name', 'itemIds', 'createdAt', 'updatedAt'],
          maximumMembers: 500,
          maximumNameLength: 120,
          membership:
            'Explicit only; each item can belong to at most one private group. No automatic matching.',
          concurrency:
            'update_group and delete_group require expectedUpdatedAt. set_item_group requires expectedGroupId (null when ungrouped).',
          move: 'set_item_group moves one item atomically; groupId:null removes membership without removing the item.',
          visibility:
            'Private archive only. Public shop listings never expose groups or other variants.',
        },
        purchaseDetails: {
          fields: ['purchaseDate', 'purchaseVendor', 'purchaseLocation'],
          date: 'YYYY-MM-DD; empty string clears it.',
          textLimit: 200,
          notes:
            'Use notes for editable tasting notes (up to 3,000 characters).',
          price:
            'Use price with basis: purchase for the private purchase price.',
          visibility:
            'Private archive only; excluded from public shop listings.',
        },
        privatePrice: {
          currency: settings.baseCurrency,
          bases: ['purchase', 'retail', 'estimate'],
          required: ['amount', 'currency', 'basis', 'checkedAt'],
          optionalFields: {
            isLowerBound: {
              type: 'boolean',
              description:
                'True means the price is strictly more than amount; false or omitted does not assert a lower bound.',
            },
          },
          maximumAmount: 1_000_000_000,
          clear: 'Send price: null; omit price to preserve it.',
          visibility:
            'Private item overview only; distinct from a public sale askingPrice.',
        },
        sale: {
          currencies: shopCurrencies.map(({ value, fractionDigits }) => ({
            code: value,
            fractionDigits,
          })),
          defaultCurrency: settings.shop.defaultCurrency,
          currencyUpdate:
            'Omitting currency preserves an existing listing currency; new and legacy listings default to USD. Changing currency does not convert askingPrice.',
          required: ['published', 'askingPrice', 'description', 'photoIds'],
          maximumAmount: 1_000_000_000,
          clear:
            'Send sale: null to clear the listing; omit sale to preserve it.',
          visibility:
            'Public asking price and currency are independent of the private valuation. Publishing requires an owned item and explicitly selected photos.',
        },
        limits: {
          photoBytes: 8 * 1024 * 1024,
          galleryPhotos: 30,
          bulkItems: 500,
        },
        concurrency:
          'Send expectedUpdatedAt as an object mapping each target item ID to its last-read updatedAt value. Conflicts return 409.',
        retries:
          'Send requestId on add. Retrying the same account-scoped key returns the original entry, including if it has since been edited or removed.',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, 'integration_schema');
  }
}
