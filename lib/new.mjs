// emdash-kit new <domain> --d1-id <uuid> --dir <path>
// Writes a placeholder EmDash site (cms/) for a new domain. Never calls Cloudflare: the D1
// database must already exist and its id is an input. Every refusal exits 3 and writes nothing.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = fileURLToPath(new URL("..", import.meta.url));
const USAGE = "usage: emdash-kit new <domain> --d1-id <uuid> --dir <path>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.([a-z]{2,63})$/;

function refuse(why) {
	console.error(`refused: ${why}\n${USAGE}`);
	process.exit(3);
}

export function parseArgs(argv) {
	const out = { domain: null, d1Id: null, dir: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--d1-id" || a === "--dir") {
			const v = argv[++i];
			if (v === undefined || v.startsWith("--")) refuse(`${a} needs a value`);
			if (a === "--d1-id") out.d1Id = v;
			else out.dir = v;
		} else if (a.startsWith("--")) refuse(`unknown option ${a}`);
		else if (out.domain === null) out.domain = a;
		else refuse(`unexpected argument ${a}`);
	}
	return out;
}

export function checkArgs({ domain, d1Id, dir }) {
	if (!domain) refuse("a domain is required");
	const m = DOMAIN.exec(domain);
	if (!m) refuse(`domain must be exactly <label>.<tld> (got ${JSON.stringify(domain)})`);
	if (!d1Id) refuse("--d1-id is required");
	if (!UUID.test(d1Id)) refuse(`--d1-id must be a UUID (got ${JSON.stringify(d1Id)})`);
	if (!dir) refuse("--dir is required");
	if (existsSync(dir)) {
		if (!statSync(dir).isDirectory()) refuse(`--dir ${dir} is not a directory`);
		if (readdirSync(dir).length > 0) refuse(`--dir ${dir} is not empty`);
	}
	return { domain, brand: m[1] };
}

export function wranglerFor({ domain, brand, d1Id }) {
	const config = {
		$schema: "node_modules/wrangler/config-schema.json",
		main: "./src/worker.ts",
		compatibility_date: "2026-02-24",
		compatibility_flags: ["nodejs_compat"],
		// No cron of its own: the shared scheduler Worker calls the Maintenance entrypoint.
		triggers: { crons: [] },
		workers_dev: false,
		// Every deploy names the environment; there is no top-level deployment.
		env: {
			[brand]: {
				name: brand,
				routes: [
					{ pattern: `${domain}/*`, zone_name: domain },
					{ pattern: `www.${domain}/*`, zone_name: domain },
				],
				// EMDASH_ADMIN_OPEN is absent: the admin stays gated until the operator claims it.
				vars: { EMDASH_SITE_URL: `https://${domain}` },
				d1_databases: [{ binding: "DB", database_name: brand, database_id: d1Id }],
				r2_buckets: [{ binding: "MEDIA", bucket_name: `${brand}-media` }],
			},
		},
	};
	return JSON.stringify(config, null, "\t") + "\n";
}

export function packageFor({ domain, brand }, kitVersion) {
	const pkg = {
		name: `${brand}-cms`,
		version: "0.0.1",
		private: true,
		type: "module",
		emdash: { label: domain, seed: ".emdash/seed.json" },
		scripts: {
			dev: 'emdash-kit seed "$BRAND" && astro dev',
			build: 'emdash-kit seed "$BRAND" && astro build',
			preview: "astro preview",
			deploy: `BRAND=${brand} CLOUDFLARE_ENV=${brand} npm run build && wrangler deploy --config dist/server/wrangler.json`,
			typecheck: "astro check",
		},
		dependencies: {
			"@astrojs/cloudflare": "^14.3.1",
			"@astrojs/react": "^6.0.5",
			"@emdash-cms/cloudflare": "^1.0.1",
			astro: "^7.3.2",
			emdash: "^1.0.1",
			"emdash-kit": `file:vendor/emdash-kit-${kitVersion}.tgz`,
			react: "19.2.4",
			"react-dom": "19.2.4",
		},
		devDependencies: {
			"@astrojs/check": "^0.9.10",
			"@cloudflare/workers-types": "^5.20260820.1",
			wrangler: "^4.125.0",
		},
		allowScripts: { "workerd@1.20261006.1": true, "esbuild@0.28.2": true },
	};
	return JSON.stringify(pkg, null, "\t") + "\n";
}

// The placeholder site shipped in starter/cms: {{DOMAIN}} and {{BRAND}} are filled in, and
// __BRAND__ in a path is the brand. npm drops files named .gitignore, so it ships as `gitignore`.
export function starterFiles({ domain, brand }) {
	const out = new Map();
	const walk = (rel) => {
		for (const e of readdirSync(join(kit, "starter", rel), { withFileTypes: true })) {
			const r = join(rel, e.name);
			if (e.isDirectory()) walk(r);
			else {
				const text = readFileSync(join(kit, "starter", r), "utf8").replaceAll("{{DOMAIN}}", domain).replaceAll("{{BRAND}}", brand);
				const dest = r.replaceAll("__BRAND__", brand).replace(/(^|\/)gitignore$/, "$1.gitignore");
				out.set(dest, text);
			}
		}
	};
	walk("cms");
	// The block types come from the kit's one catalog, so a section added there reaches every new site.
	// blockTypes must precede the collections that use them.
	const schema = JSON.parse(out.get("cms/seed/schema.json"));
	const catalog = JSON.parse(readFileSync(join(kit, "sections", "catalog.json"), "utf8"));
	const layout = schema.collections.find((c) => c.slug === "pages").fields.find((f) => f.slug === "layout");
	layout.validation.allowedTypes = catalog.map((b) => b.slug);
	out.set("cms/seed/schema.json", JSON.stringify({ $schema: schema.$schema, version: schema.version, meta: schema.meta, blockTypes: catalog, ...schema }, null, "\t") + "\n");
	return out;
}

export function generate(argv) {
	const args = parseArgs(argv);
	const { domain, brand } = checkArgs(args);
	const kitVersion = JSON.parse(readFileSync(join(kit, "package.json"), "utf8")).version;
	const files = new Map([
		...starterFiles({ domain, brand }),
		["cms/wrangler.jsonc", wranglerFor({ domain, brand, d1Id: args.d1Id })],
		["cms/package.json", packageFor({ domain, brand }, kitVersion)],
	]);
	for (const [rel, text] of files) {
		const p = join(args.dir, rel);
		mkdirSync(dirname(p), { recursive: true });
		writeFileSync(p, text);
	}
	console.log(`new: ${domain} -> ${join(args.dir, "cms")} (brand ${brand}, env ${brand})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) generate(process.argv.slice(2));
