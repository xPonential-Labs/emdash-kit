// Print "<d1 database name> <r2 bucket name>" for a brand's wrangler environment.
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";

const brand = process.argv[2];
const env = parse(readFileSync("wrangler.jsonc", "utf8")).env?.[brand];
if (!env) {
	console.error(`wrangler.jsonc has no env "${brand}"`);
	process.exit(3);
}
console.log(env.d1_databases[0].database_name, env.r2_buckets[0].bucket_name);
