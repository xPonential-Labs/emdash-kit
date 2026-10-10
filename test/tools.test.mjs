import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = fileURLToPath(new URL("..", import.meta.url));

test("seed: composes schema + brand, brand replaces same-name menus", () => {
	const d = mkdtempSync(join(tmpdir(), "kit-"));
	mkdirSync(join(d, "seed"));
	writeFileSync(join(d, "seed/schema.json"), JSON.stringify({ version: "1", collections: [{ slug: "pages" }], menus: [{ name: "primary", items: [] }] }));
	writeFileSync(join(d, "seed/a.json"), JSON.stringify({ settings: { title: "A" }, menus: [{ name: "primary", items: [{ label: "x" }] }], content: {} }));
	execFileSync(join(kit, "bin/emdash-kit"), ["seed", "a"], { cwd: d });
	const out = JSON.parse(readFileSync(join(d, ".emdash/seed.json"), "utf8"));
	assert.equal(out.settings.title, "A");
	assert.equal(out.menus.length, 1);
	assert.equal(out.menus[0].items.length, 1);
	assert.deepEqual(out.collections, [{ slug: "pages" }]);
});

test("seed: refuses an unknown brand with exit 3", () => {
	const d = mkdtempSync(join(tmpdir(), "kit-"));
	mkdirSync(join(d, "seed"));
	const r = spawnSync(join(kit, "bin/emdash-kit"), ["seed", "nope"], { cwd: d });
	assert.equal(r.status, 3);
});

test("content: refuses outside a site cms/ folder", () => {
	const r = spawnSync(join(kit, "bin/emdash-kit"), ["content", "a", "--local"], { cwd: mkdtempSync(join(tmpdir(), "kit-")) });
	assert.equal(r.status, 3);
});

test("d1-dump: tables before rows, indexes after, no sqlite_sequence", () => {
	const d = mkdtempSync(join(tmpdir(), "kit-"));
	const db = join(d, "t.db");
	execFileSync("sqlite3", [db, "create table parent(id integer primary key autoincrement); create table child(id integer primary key, p integer references parent(id)); create index ci on child(p); insert into parent default values; insert into child values(1,1);"]);
	const sql = execFileSync("python3", ["-I", join(kit, "lib/d1-dump.py"), db], { encoding: "utf8" });
	const at = (s) => sql.indexOf(s);
	assert.ok(at('CREATE TABLE child') < at('INSERT INTO "parent"'));
	assert.ok(at('INSERT INTO "child"') < at("CREATE INDEX ci"));
	assert.equal(sql.includes("sqlite_sequence"), false);
});

test("bin: unknown command prints usage and exits 3", () => {
	const r = spawnSync(join(kit, "bin/emdash-kit"), ["bogus"]);
	assert.equal(r.status, 3);
});
