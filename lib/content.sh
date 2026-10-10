#!/usr/bin/env bash
# Load a brand's seed content into its D1 database and R2 bucket.
#
#   npx emdash-kit content <brand> --local|--remote     (run in the site's cms/ folder)
#
# EmDash's first-boot seed creates only the schema; content arrives through the
# setup wizard, which would make the first visitor the Administrator. Seeding
# here instead lets a site go live with its content and no user accounts, so the
# admin is claimed later, on the real domain.
#
# Run it against an EMPTY database only (before the Worker's first request). It
# refuses when the target already has tables.
set -euo pipefail
kit="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
[[ -f wrangler.jsonc && -d seed ]] || { echo "run in a site cms/ folder (wrangler.jsonc and seed/ needed)" >&2; exit 3; }

brand="${1:-}"; where="${2:-}"
[[ -f "seed/$brand.json" && "$where" =~ ^--(local|remote)$ ]] || {
	echo "usage: emdash-kit content <$(ls seed | grep -v schema | sed 's/.json//' | paste -sd'|')> --local|--remote" >&2; exit 3; }

cfg=$(node "$kit/lib/env.mjs" "$brand")
read -r db bucket <<<"$cfg"
w=(npx wrangler --env "$brand")

tables=$("${w[@]}" d1 execute "$db" "$where" --json \
	--command "select count(*) n from sqlite_master where type='table' and name not like '_cf_%' and name <> 'sqlite_sequence'" \
	| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')
[[ "$tables" == 0 ]] || { echo "refusing: $db ($where) already has $tables tables" >&2; exit 3; }

work=".content/$brand"; rm -rf "$work"; mkdir -p "$work"
BRAND="$brand" node "$kit/lib/brand.mjs"
npx emdash seed .emdash/seed.json -d "$work/site.db" --uploads-dir "$work/uploads"

python3 -I "$kit/lib/d1-dump.py" "$work/site.db" > "$work/site.sql"
"${w[@]}" d1 execute "$db" "$where" --yes --file "$work/site.sql"

# D1 can drop a statement on a transient internal reset (D1_RESET_DO) while the rest of the
# file still reports success, so prove the import: every table's row count must match.
tables=$(sqlite3 "$work/site.db" "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%'")
# One statement per table: D1 caps the number of terms in a compound SELECT.
q=$(for t in $tables; do printf "select '%s' t, count(*) n from \"%s\"; " "$t" "$t"; done)
"${w[@]}" d1 execute "$db" "$where" --json --command "$q" > "$work/counts.json"
python3 - "$work/site.db" "$work/counts.json" <<'PY' || { echo "import incomplete: recreate the database and rerun" >&2; exit 1; }
import json, sqlite3, sys
remote = {r["t"]: r["n"] for stmt in json.load(open(sys.argv[2])) for r in stmt["results"]}
db = sqlite3.connect(sys.argv[1])
bad = [(t, db.execute(f'select count(*) from "{t}"').fetchone()[0], n) for t, n in remote.items()
       if db.execute(f'select count(*) from "{t}"').fetchone()[0] != n]
for t, want, got in bad: print(f"  {t}: {got} rows, expected {want}", file=sys.stderr)
sys.exit(1 if bad else 0)
PY

sqlite3 -separator ' ' "$work/site.db" "select storage_key, mime_type from media" | while read -r key mime; do
	"${w[@]}" r2 object put "$bucket/$key" "$where" --file "$work/uploads/$key" --content-type "$mime"
done
echo "loaded $brand into $db and $bucket ($where)"
