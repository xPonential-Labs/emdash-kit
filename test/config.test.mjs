import { test } from "node:test";
import assert from "node:assert/strict";

// config.mjs imports Astro and the adapters, which a bare kit checkout does not install;
// test the route-rule builder through a copy of its logic is not acceptable (a second
// copy drifts), so import it only when the peers are present.
let routeRulesFor;
try { ({ routeRulesFor } = await import("../config.mjs")); } catch { routeRulesFor = null; }

test("route rules: listed pages cached an hour, media a year", { skip: !routeRulesFor && "peer deps not installed" }, () => {
	const r = routeRulesFor(["/", "/[slug]"]);
	assert.deepEqual(r["/"], { maxAge: 3600, swr: 86400 });
	assert.deepEqual(r["/[slug]"], { maxAge: 3600, swr: 86400 });
	assert.deepEqual(r["/_emdash/api/media/file/[...key]"], { maxAge: 31536000 });
	assert.throws(() => routeRulesFor([]));
});

let siteHosts;
try { ({ siteHosts } = await import("../config.mjs")); } catch { siteHosts = null; }

test("site hosts come from EMDASH_SITE_URL and route patterns, deduplicated", { skip: !siteHosts && "peer deps not installed" }, () => {
	const w = `{ // comment
		"env": { "a": {
			"vars": { "EMDASH_SITE_URL": "https://example.com" },
			"routes": [ { "pattern": "example.com/*", "zone_name": "example.com" }, { "pattern": "www.example.com/*", "zone_name": "example.com" } ],
		} } }`;
	assert.deepEqual(siteHosts(w, "a"), ["example.com", "www.example.com"]);
	assert.throws(() => siteHosts(w, "missing"));
	assert.deepEqual(siteHosts('{"env":{"b":{"vars":{}}}}', "b"), []);
});
