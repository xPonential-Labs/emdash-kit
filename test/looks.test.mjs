import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = fileURLToPath(new URL("..", import.meta.url));
const SECTIONS = ["hero", "text", "image-text", "cards", "steps", "gallery", "quote", "faq", "cta-band", "links"];
const FIELD_TYPES = new Set(["string", "text", "select", "boolean", "url", "image", "repeater"]);
const catalog = JSON.parse(readFileSync(join(kit, "sections/catalog.json"), "utf8"));

test("sections: the catalog holds the ten sections in order", () => {
	assert.deepEqual(catalog.map((b) => b.slug), SECTIONS);
});

test("sections: each has a current version with a required field and only supported field types", () => {
	for (const b of catalog) {
		const ver = b.versions.find((v) => v.version === b.currentVersion);
		assert.ok(ver, `${b.slug}: currentVersion ${b.currentVersion} is not in versions`);
		assert.ok(ver.fields.some((f) => f.required), `${b.slug}: no required field`);
		const walk = (fields) => {
			for (const f of fields) {
				assert.ok(FIELD_TYPES.has(f.type), `${b.slug}.${f.slug}: unsupported type ${f.type}`);
				if (f.type === "select") assert.ok(f.options?.length, `${b.slug}.${f.slug}: select without options`);
				if (f.type === "repeater") walk(f.validation.subFields);
			}
		};
		walk(ver.fields);
	}
});

test("sections: every section has a component whose root is <section class=\"kit-section kit-<type>\">", () => {
	const file = (s) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("") + ".astro";
	for (const s of SECTIONS) {
		const p = join(kit, "sections", file(s));
		assert.ok(existsSync(p), p);
		assert.match(readFileSync(p, "utf8"), new RegExp(`<section class="kit-section kit-${s}"`), s);
	}
	const renderer = readFileSync(join(kit, "sections/Sections.astro"), "utf8");
	for (const s of SECTIONS) assert.ok(renderer.includes(s.includes("-") ? `"${s}":` : `${s}:`), `renderer maps ${s}`);
});

test("package: sections and looks are exported and published", () => {
	const pkg = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
	assert.equal(pkg.exports["./sections/*"], "./sections/*");
	assert.equal(pkg.exports["./looks/*"], "./looks/*");
	assert.ok(pkg.files.includes("sections") && pkg.files.includes("looks"));
});
