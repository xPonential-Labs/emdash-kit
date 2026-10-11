import { test } from "node:test";
import assert from "node:assert/strict";
import { adminGated, uncacheable } from "../lib/edge.js";

const req = (p) => new Request(`https://example.com${p}`);

test("admin is gated until EMDASH_ADMIN_OPEN is true, media files never", () => {
	assert.equal(adminGated(req("/_emdash/admin"), {}), true);
	assert.equal(adminGated(req("/_emdash/api/setup/admin"), { EMDASH_ADMIN_OPEN: "false" }), true);
	assert.equal(adminGated(req("/_emdash/api/media/file/a.png"), {}), false);
	assert.equal(adminGated(req("/"), {}), false);
	assert.equal(adminGated(req("/_emdash/admin"), { EMDASH_ADMIN_OPEN: "true" }), false);
});

test("errors are never cacheable; successes pass through untouched", async () => {
	const ok = new Response("hi", { headers: { "Cloudflare-CDN-Cache-Control": "public, max-age=3600", "Cache-Tag": "p:/" } });
	assert.equal(uncacheable(ok), ok);
	for (const status of [400, 404, 500, 503]) {
		const bad = uncacheable(new Response("x", { status, headers: { "Cloudflare-CDN-Cache-Control": "public, max-age=3600", "Cache-Tag": "p:/" } }));
		assert.equal(bad.status, status);
		assert.equal(bad.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
		assert.equal(bad.headers.get("Cache-Control"), "no-store");
		assert.equal(bad.headers.get("Cache-Tag"), null);
		assert.equal(await bad.text(), "x");
	}
});

test("the not-found page may cache its own 404; a 404 anywhere else may not", () => {
	const page = uncacheable(new Response("nf", { status: 404 }), req("/404"));
	assert.equal(page.status, 404);
	assert.equal(page.headers.get("Cloudflare-CDN-Cache-Control"), "public, max-age=3600");
	assert.equal(page.headers.get("Cache-Control"), null);
	const other = uncacheable(new Response("nf", { status: 404 }), req("/.env"));
	assert.equal(other.headers.get("Cache-Control"), "no-store");
	const broken = uncacheable(new Response("x", { status: 500 }), req("/404"));
	assert.equal(broken.headers.get("Cache-Control"), "no-store");
});
