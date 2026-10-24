// Shared Astro config (route caching, D1 + R2, theme folder per BRAND) from emdash-kit.
import { emdashSite } from "emdash-kit/config";

export default emdashSite({
	root: import.meta.url,
	brands: ["{{BRAND}}"],
	cachedPages: ["/"],
});
