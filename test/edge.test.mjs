import { test } from "node:test";
import assert from "node:assert/strict";
import { adminGated, canonicalRedirect, uncacheable } from "../lib/edge.js";

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

test("canonicalRedirect sends other hosts to the EMDASH_SITE_URL origin, never cached", () => {
	const env = { EMDASH_SITE_URL: "https://example.com" };
	const go = (u, method = "GET", e = env) => canonicalRedirect(new Request(u, { method }), e);
	for (const method of ["GET", "HEAD"]) {
		const r = go("https://www.example.com/a/b?x=1&y=2", method);
		assert.equal(r.status, 301);
		assert.equal(r.headers.get("Location"), "https://example.com/a/b?x=1&y=2");
		assert.equal(r.headers.get("Cache-Control"), "no-store");
		assert.equal(r.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
	}
	for (const method of ["POST", "PUT", "DELETE"]) {
		const r = go("https://www.example.com/_emdash/api/x?q=1", method);
		assert.equal(r.status, 308);
		assert.equal(r.headers.get("Location"), "https://example.com/_emdash/api/x?q=1");
		assert.equal(r.headers.get("Cache-Control"), "no-store");
		assert.equal(r.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
	}
	const www = go("https://example.org/z?k=v", "GET", { EMDASH_SITE_URL: "https://www.example.org" });
	assert.equal(www.headers.get("Location"), "https://www.example.org/z?k=v");
	assert.equal(go("https://www.example.com").headers.get("Location"), "https://example.com/");
});

test("canonicalRedirect stays out of the way", () => {
	const env = { EMDASH_SITE_URL: "https://example.com" };
	const go = (u, e = env) => canonicalRedirect(new Request(u), e);
	assert.equal(go("https://example.com/a?x=1"), null);
	for (const u of ["http://localhost:8787/x", "http://127.0.0.1:8787/x", "http://[::1]:8787/x"]) assert.equal(go(u), null);
	assert.equal(go("https://www.example.com/x", {}), null);
	assert.equal(go("https://www.example.com/x", { EMDASH_SITE_URL: "not a url" }), null);
	assert.equal(go("https://www.example.com/x", { EMDASH_SITE_URL: "" }), null);
});
