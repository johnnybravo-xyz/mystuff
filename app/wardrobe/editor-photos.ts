import { orderedCoverPhotos } from './model';
import type { ProductPhoto } from './model';

export type PendingPhoto = {
    id: string;
    file: File;
    kind: ProductPhoto['kind'];
    imageId?: string;
};

export async function prepareEditorPhotos({
    photos,
    uploads,
    primaryPhotoId,
    clothing,
    name,
    uploadPhoto,
    onUploaded,
}: {
    photos: ProductPhoto[];
    uploads: PendingPhoto[];
    primaryPhotoId: string;
    clothing: boolean;
    name: string;
    uploadPhoto: (file: File) => Promise<string>;
    onUploaded: (id: string, imageId: string) => void;
}): Promise<{ photos: ProductPhoto[]; imageId: string | null }> {
    const added: ProductPhoto[] = [];
    let selectedImageId = photos.find(
        (photo) => photo.imageId === primaryPhotoId,
    )?.imageId;
    for (const upload of uploads) {
        const imageId = upload.imageId || (await uploadPhoto(upload.file));
        // Remember each completed upload even if a later upload or save fails.
        onUploaded(upload.id, imageId);
        added.push({ imageId, kind: upload.kind, alt: name || 'Item photo' });
        if (upload.id === primaryPhotoId) selectedImageId = imageId;
    }
    const gallery = [...photos, ...added];
    return {
        photos: gallery,
        imageId:
            orderedCoverPhotos(gallery, selectedImageId, clothing)[0]
                ?.imageId || null,
    };
}
