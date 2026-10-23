import { getInstallation } from '@/app/installation';
import { ArchiveError, errorResponse } from '@/app/wardrobe/server';
import { getShopImage } from '@/app/wardrobe/shop-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string; imageId: string }> },
) {
  try {
    if (!(await getInstallation()).settings.features.shop)
      throw new ArchiveError('The public shop is disabled.', 404);
    const { itemId, imageId } = await params;
    return await getShopImage(itemId, imageId);
  } catch (error) {
    return errorResponse(error, 'shop_photo');
  }
}
