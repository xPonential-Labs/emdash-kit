// Compose seed/schema.json with seed/<BRAND>.json into .emdash/seed.json.
// BRAND is required: guessing a brand would seed one site with the other's content.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const brand = process.env.BRAND;
if (!brand || !existsSync(`seed/${brand}.json`)) {
	console.error(`BRAND must name a file in seed/ (got ${JSON.stringify(brand)})`);
	process.exit(3);
}

const schema = JSON.parse(readFileSync("seed/schema.json", "utf8"));
const content = JSON.parse(readFileSync(`seed/${brand}.json`, "utf8"));

// Brand entries replace schema placeholders of the same name.
const byName = (base = [], over = []) => {
	const names = new Set(over.map((x) => x.name));
	return [...base.filter((x) => !names.has(x.name)), ...over];
};
const seed = {
	...schema,
	settings: content.settings,
	menus: byName(schema.menus, content.menus),
	widgetAreas: byName(schema.widgetAreas, content.widgetAreas),
	content: content.content,
};

mkdirSync(".emdash", { recursive: true });
writeFileSync(".emdash/seed.json", JSON.stringify(seed, null, "\t"));
console.log(`seed: ${brand}`);
