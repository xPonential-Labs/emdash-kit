// The Astro config every EmDash site shares. A site's astro.config.mjs:
//   import { emdashSite } from "emdash-kit/config";
//   export default emdashSite({ root: import.meta.url, brands: ["mysite"], cachedPages: ["/", "/[slug]"] });
//
// Every setting is explicit: a site names its brands, the pages it caches, and any extra
// folders the dev server may read. Nothing is defaulted.
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { fileURLToPath } from "node:url";

const PAGE_CACHE = { maxAge: 3600, swr: 86400 };
const MEDIA_ROUTE = "/_emdash/api/media/file/[...key]";

export function routeRulesFor(cachedPages) {
	if (!Array.isArray(cachedPages) || cachedPages.length === 0) {
		throw new Error("emdashSite: cachedPages must list the page routes to cache, e.g. [\"/\"]");
	}
	const rules = Object.fromEntries(cachedPages.map((p) => [p, PAGE_CACHE]));
	// Media files are immutable (a new upload gets a new key), so cache them for a
	// year: otherwise every image view is a Worker invocation plus an R2 read.
	rules[MEDIA_ROUTE] = { maxAge: 31536000 };
	return rules;
}

export function emdashSite({ root, brands, cachedPages, devAllow }) {
	if (!root) throw new Error("emdashSite: root is required (pass import.meta.url)");
	if (!Array.isArray(brands) || brands.length === 0) throw new Error("emdashSite: brands is required");
	// One codebase, one deployment per brand. BRAND picks the theme folder; the matching
	// wrangler environment (CLOUDFLARE_ENV) picks the Worker, D1 and R2.
	const brand = process.env.BRAND;
	if (!brands.includes(brand)) throw new Error(`BRAND must be one of ${brands.join(" | ")} (got ${JSON.stringify(brand)})`);

	const vite = { resolve: { alias: { "@theme": fileURLToPath(new URL(`./src/themes/${brand}`, root)) } } };
	if (devAllow?.length) vite.server = { fs: { allow: devAllow.map((p) => fileURLToPath(new URL(p, root))) } };

	return defineConfig({
		output: "server",
		adapter: cloudflare(),
		// Serve rendered pages from Cloudflare's Worker cache. A render costs ~14 ms CPU,
		// over the Free plan's 10 ms; a cache hit costs next to nothing. EmDash purges
		// the page's tags on publish, so edits still show immediately.
		cache: { provider: cacheCloudflare() },
		routeRules: routeRulesFor(cachedPages),
		image: { layout: "constrained", responsiveStyles: true },
		vite,
		integrations: [
			react(),
			emdash({
				database: d1({ binding: "DB", session: "auto" }),
				storage: r2({ binding: "MEDIA" }),
			}),
		],
		devToolbar: { enabled: false },
	});
}
