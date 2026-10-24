import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";

const kit = fileURLToPath(new URL("..", import.meta.url));
const bin = join(kit, "bin/emdash-kit");
const D1 = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const tmp = () => mkdtempSync(join(tmpdir(), "kit-new-"));
const run = (args, cwd) => spawnSync(bin, ["new", ...args], { cwd, encoding: "utf8" });

test("new: writes wrangler.jsonc and package.json for example.com", () => {
	const d = tmp();
	const r = run(["example.com", "--d1-id", D1, "--dir", d]);
	assert.equal(r.status, 0, r.stderr);
	const w = parse(readFileSync(join(d, "cms/wrangler.jsonc"), "utf8"));
	assert.deepEqual(Object.keys(w.env), ["example"]);
	const e = w.env.example;
	assert.equal(e.name, "example");
	assert.deepEqual(e.routes, [
		{ pattern: "example.com/*", zone_name: "example.com" },
		{ pattern: "www.example.com/*", zone_name: "example.com" },
	]);
	assert.deepEqual(e.vars, { EMDASH_SITE_URL: "https://example.com" });
	assert.deepEqual(e.d1_databases, [{ binding: "DB", database_name: "example", database_id: D1 }]);
	assert.deepEqual(e.r2_buckets, [{ binding: "MEDIA", bucket_name: "example-media" }]);
	assert.deepEqual(w.triggers.crons, []);
	assert.equal(w.workers_dev, false);
	const version = JSON.parse(readFileSync(join(kit, "package.json"), "utf8")).version;
	const pkg = JSON.parse(readFileSync(join(d, "cms/package.json"), "utf8"));
	assert.equal(pkg.dependencies["emdash-kit"], `file:vendor/emdash-kit-${version}.tgz`);
	assert.equal(existsSync(join(d, "cms/vendor")), false);
	assert.ok(existsSync(join(d, "cms/.gitignore")) && existsSync(join(d, "cms/seed/example.json")));
});

test("new: creates --dir when it does not exist yet", () => {
	const d = join(tmp(), "fresh");
	assert.equal(run(["example.com", "--d1-id", D1, "--dir", d]).status, 0);
	assert.ok(existsSync(join(d, "cms/wrangler.jsonc")));
});

const snap = (d) => readdirSync(d, { recursive: true }).sort();

for (const [name, args, seed] of [
	["missing --dir", ["example.com", "--d1-id", D1], false],
	["non-empty --dir", ["example.com", "--d1-id", D1, "--dir", "{d}"], true],
	["missing --d1-id", ["example.com", "--dir", "{d}"], false],
	["--d1-id not a UUID", ["example.com", "--d1-id", "nope", "--dir", "{d}"], false],
	["subdomain", ["www.example.com", "--d1-id", D1, "--dir", "{d}"], false],
	["no TLD", ["example", "--d1-id", D1, "--dir", "{d}"], false],
	["no domain", ["--d1-id", D1, "--dir", "{d}"], false],
	["unknown option", ["example.com", "--d1-id", D1, "--dir", "{d}", "--x"], false],
]) {
	test(`new: refuses ${name} with exit 3 and writes nothing`, () => {
		const d = tmp();
		if (seed) writeFileSync(join(d, "keep.txt"), "keep\n");
		const before = snap(d);
		const r = run(args.map((a) => (a === "{d}" ? d : a)), d);
		assert.equal(r.status, 3, r.stderr);
		assert.deepEqual(snap(d), before);
	});
}

test("new: the generated site seeds and builds against the kit's installed dependencies", { timeout: 900_000 }, () => {
	const d = tmp();
	assert.equal(run(["example.com", "--d1-id", D1, "--dir", d]).status, 0);
	const cms = join(d, "cms");
	// Link the kit's installed tree (no npm install) and the kit itself as emdash-kit.
	const nm = join(cms, "node_modules");
	mkdirSync(nm);
	for (const e of readdirSync(join(kit, "node_modules"))) {
		if (e !== ".astro" && e !== "emdash-kit") symlinkSync(realpathSync(join(kit, "node_modules", e)), join(nm, e));
	}
	symlinkSync(kit, join(nm, "emdash-kit"));
	// EmDash fetches its admin font at build time; a cache outside the repo survives between runs.
	const cache = process.env.EMDASH_KIT_TEST_FONT_CACHE ?? join(homedir(), "workspace/temp/kit-starter-font-cache");
	mkdirSync(cache, { recursive: true });
	symlinkSync(cache, join(nm, ".astro"));

	const seed = spawnSync(bin, ["seed", "example"], { cwd: cms, encoding: "utf8" });
	assert.equal(seed.status, 0, seed.stderr);
	const home = JSON.parse(readFileSync(join(cms, ".emdash/seed.json"), "utf8")).content.pages.find((p) => p.slug === "home");
	const blob = JSON.stringify(home);
	assert.ok(blob.includes("example.com") && blob.includes("Coming soon"), blob);

	const env = { ...process.env, BRAND: "example", CLOUDFLARE_ENV: "example", ASTRO_TELEMETRY_DISABLED: "1" };
	const build = () => spawnSync(join(nm, ".bin/astro"), ["build"], { cwd: cms, env, encoding: "utf8" });
	let b = build();
	if (b.status !== 0 && (b.stdout + b.stderr).includes("CannotFetchFontFile")) b = build();
	assert.equal(b.status, 0, (b.stdout + b.stderr).slice(-1500));
	const w = JSON.parse(readFileSync(join(cms, "dist/server/wrangler.json"), "utf8"));
	assert.deepEqual(w.routes.map((r) => r.pattern).sort(), ["example.com/*", "www.example.com/*"]);
	assert.equal(w.vars.EMDASH_SITE_URL, "https://example.com");
});
