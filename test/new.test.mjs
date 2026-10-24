import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
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
