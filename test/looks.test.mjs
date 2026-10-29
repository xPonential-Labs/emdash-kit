import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = fileURLToPath(new URL("..", import.meta.url));
const SECTIONS = ["hero", "text", "image_text", "cards", "steps", "gallery", "quote", "faq", "cta_band", "links"];
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
				if (f.type === "select") {
					assert.ok(f.validation?.options?.length, `${b.slug}.${f.slug}: select without validation.options`);
					assert.equal(f.options, undefined, `${b.slug}.${f.slug}: top-level options are rejected by EmDash`);
				}
				if (f.type === "repeater") walk(f.validation.subFields);
			}
		};
		walk(ver.fields);
	}
});

test("sections: every section has a component whose root is <section class=\"kit-section kit-<type>\">", () => {
	const file = (s) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("") + ".astro";
	for (const s of SECTIONS) {
		const p = join(kit, "sections", file(s));
		assert.ok(existsSync(p), p);
		assert.match(readFileSync(p, "utf8"), new RegExp(`<section class="kit-section kit-${s.replace("_", "-")}"`), s);
	}
	const renderer = readFileSync(join(kit, "sections/Sections.astro"), "utf8");
	for (const s of SECTIONS) assert.ok(renderer.includes(`${s}:`), `renderer maps ${s}`);
});

test("package: sections and looks are exported and published", () => {
	const pkg = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
	assert.equal(pkg.exports["./sections/*"], "./sections/*");
	assert.equal(pkg.exports["./looks/*"], "./looks/*");
	assert.ok(pkg.files.includes("sections") && pkg.files.includes("looks"));
});

// ---------------------------------------------------------------- looks
const LOOKS = ["warm", "bold", "quiet", "playful", "editorial", "dark"];
const VARS = ["--look-bg", "--look-surface", "--look-text", "--look-muted", "--look-accent", "--look-font-heading", "--look-font-body", "--look-radius", "--look-space"];
const COLOURS = VARS.slice(0, 5);

function parseLook(name) {
	const css = readFileSync(join(kit, "looks", `${name}.css`), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
	const vars = {};
	for (const [, , body] of rules) for (const m of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim();
	return { css, rules, vars };
}
const looks = Object.fromEntries(LOOKS.map((n) => [n, parseLook(n)]));

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
	const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

test("looks: the folder holds exactly the six looks", () => {
	assert.deepEqual(readdirSync(join(kit, "looks")).sort(), LOOKS.map((n) => `${n}.css`).sort());
});

for (const n of LOOKS) {
	test(`looks: ${n} is scoped, defines the nine variables, uses hex colours and no remote font`, () => {
		const { css, rules, vars } = looks[n];
		assert.ok(rules.length > 0);
		for (const [, sel] of rules) assert.equal(sel.trim(), `[data-look="${n}"]`);
		assert.deepEqual(Object.keys(vars).sort(), [...VARS].sort());
		for (const v of COLOURS) assert.match(vars[v], /^#[0-9a-f]{6}$/i, v);
		assert.ok(!css.includes("url(") && !css.includes("@import"));
	});
	test(`looks: ${n} meets the contrast bars`, () => {
		const v = looks[n].vars;
		assert.ok(contrast(v["--look-text"], v["--look-bg"]) >= 4.5, "text on bg");
		assert.ok(contrast(v["--look-text"], v["--look-surface"]) >= 4.5, "text on surface");
		assert.ok(contrast(v["--look-accent"], v["--look-bg"]) >= 3, "accent on bg");
	});
}

test("looks: any two differ in at least five variables, at least two of them colours", () => {
	for (const [i, a] of LOOKS.entries()) {
		for (const b of LOOKS.slice(i + 1)) {
			const diff = VARS.filter((v) => looks[a].vars[v].toLowerCase() !== looks[b].vars[v].toLowerCase());
			assert.ok(diff.length >= 5, `${a}/${b} differ in ${diff.length}`);
			assert.ok(diff.filter((v) => COLOURS.includes(v)).length >= 2, `${a}/${b} differ in <2 colours`);
		}
	}
});

// ---------------------------------------------------------------- generated site
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const D1 = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const gen = mkdtempSync(join(tmpdir(), "kit-looks-"));
const made = spawnSync(join(kit, "bin/emdash-kit"), ["new", "example.com", "--d1-id", D1, "--dir", gen], { encoding: "utf8" });
const cms = join(gen, "cms");
const read = (rel) => JSON.parse(readFileSync(join(cms, rel), "utf8"));

test("generated site: the schema has the ten block types and pages.layout allows them in order", () => {
	assert.equal(made.status, 0, made.stderr);
	const schema = read("seed/schema.json");
	assert.deepEqual(schema.blockTypes, catalog);
	const layout = schema.collections.find((c) => c.slug === "pages").fields.find((f) => f.slug === "layout");
	assert.equal(layout.type, "blocks");
	assert.deepEqual(layout.validation.allowedTypes, SECTIONS);
});

test("generated site: the look collection offers exactly the six looks, with drafts and revisions", () => {
	const look = read("seed/schema.json").collections.find((c) => c.slug === "look");
	assert.ok(look.supports.includes("drafts") && look.supports.includes("revisions"));
	const style = look.fields.find((f) => f.slug === "style");
	assert.equal(style.type, "select");
	assert.equal(style.required, true);
	assert.deepEqual(style.validation.options, LOOKS);
	assert.deepEqual(style.options, LOOKS);
});

test("generated site: the seed has one published look and a home page with sections of allowed types", () => {
	const seed = read("seed/example.json");
	assert.equal(seed.content.look.filter((e) => e.status === "published").length, 1);
	assert.ok(LOOKS.includes(seed.content.look[0].data.style));
	const home = seed.content.pages.find((p) => p.slug === "home");
	assert.ok(home.data.layout.length >= 2);
	for (const s of home.data.layout) assert.ok(SECTIONS.includes(s._type), s._type);
});

test("generated site: the layout applies the published look and imports the six look stylesheets", () => {
	const base = readFileSync(join(cms, "src/layouts/Base.astro"), "utf8");
	assert.match(base, /data-look=\{look\}/);
	for (const n of LOOKS) assert.ok(base.includes(`emdash-kit/looks/${n}.css`), n);
	assert.ok(existsSync(join(cms, "src/pages/[slug].astro")));
});
