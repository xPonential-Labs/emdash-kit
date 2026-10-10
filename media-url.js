// URL for an image field value, for places that need a plain URL (CSS backgrounds)
// rather than <Image>. Mirrors EmDash's internal buildRenderMediaUrl: a pre-resolved
// src or url first, then the storage key, then the bare media id via the media route.
const MEDIA_ROUTE = "/_emdash/api/media/file/";

export function mediaUrl(image) {
	if (!image) return undefined;
	if (image.src) return image.src;
	if (image.url) return image.url;
	if (image.meta?.storageKey) return MEDIA_ROUTE + image.meta.storageKey;
	if (image.id) return MEDIA_ROUTE + image.id;
	return undefined;
}
