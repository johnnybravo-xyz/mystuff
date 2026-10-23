import { getInstallation } from '@/app/installation';
import { ArchiveError, errorResponse } from '@/app/wardrobe/server';
import {
  consumeInquiryLimit,
  deleteShopInquiry,
  getShopInquiries,
  shopHeaders,
  shopJson,
  shopSellerAccount,
  submitShopInquiry,
} from '@/app/wardrobe/shop-server';

async function requireShop() {
  if (!(await getInstallation()).settings.features.shop)
    throw new ArchiveError('The public shop is disabled.', 404);
}

export async function POST(request: Request) {
  try {
    await requireShop();
    consumeInquiryLimit();
    const value = await shopJson(request);
    await submitShopInquiry(value);
    return Response.json({ ok: true }, { headers: shopHeaders });
  } catch (error) {
    return errorResponse(error, 'shop_inquiry_submit');
  }
}
export async function GET(request: Request) {
  try {
    await requireShop();
    const account = await shopSellerAccount(request);
    const offset = Number(new URL(request.url).searchParams.get('offset') || 0);
    return Response.json(
      await getShopInquiries(account, Number.isFinite(offset) ? offset : 0),
      { headers: shopHeaders },
    );
  } catch (error) {
    return errorResponse(error, 'shop_inquiry_list');
  }
}
export async function DELETE(request: Request) {
  try {
    await requireShop();
    const account = await shopSellerAccount(request);
    const value = (await shopJson(request)) as { id?: unknown } | null;
    await deleteShopInquiry(account, value?.id);
    return Response.json({ ok: true }, { headers: shopHeaders });
  } catch (error) {
    return errorResponse(error, 'shop_inquiry_delete');
  }
}
