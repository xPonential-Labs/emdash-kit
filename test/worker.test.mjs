import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// worker.js imports the Workers runtime and the EmDash handler, neither of which exists
// under plain Node: resolve both to stubs that record their calls on globalThis.
const stubs = {
	"cloudflare:workers": "export class WorkerEntrypoint {}",
	"@emdash-cms/cloudflare/worker": `
		export class PluginBridge {}
		export const createScheduledHandler = () => async () => {};
		export default { fetch: async (request) => { globalThis.__calls.push(new URL(request.url).pathname); return new Response("page"); } };`,
};
const hooks = `
	const stubs = ${JSON.stringify(stubs)};
	export async function resolve(specifier, context, next) {
		if (specifier in stubs) return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
		return next(specifier, context);
	}`;

let worker;
before(async () => {
	register("data:text/javascript," + encodeURIComponent(hooks));
	globalThis.__calls = [];
	worker = (await import("../worker.js")).default;
});
beforeEach(() => {
	globalThis.__calls = [];
});

const env = { EMDASH_SITE_URL: "https://example.com" };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("a www request is redirected before the handler or the admin gate runs", async () => {
	const page = await worker.fetch(new Request("https://www.example.com/a?x=1"), env, ctx);
	assert.equal(page.status, 301);
	assert.equal(page.headers.get("Location"), "https://example.com/a?x=1");
	const admin = await worker.fetch(new Request("https://www.example.com/_emdash/admin"), env, ctx);
	assert.equal(admin.status, 301);
	assert.deepEqual(globalThis.__calls, []);
});

test("a canonical-host request reaches the handler", async () => {
	const res = await worker.fetch(new Request("https://example.com/a"), env, ctx);
	assert.equal(res.status, 200);
	assert.equal(await res.text(), "page");
	assert.deepEqual(globalThis.__calls, ["/a"]);
	const gated = await worker.fetch(new Request("https://example.com/_emdash/admin"), env, ctx);
	assert.equal(gated.status, 404);
	assert.deepEqual(globalThis.__calls, ["/a"]);
});
