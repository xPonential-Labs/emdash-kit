# emdash-kit

Shared infrastructure for EmDash (Astro CMS) sites on Cloudflare Workers + D1 + R2 on the
Workers Free plan: the Worker entry, the Astro config, and the content tools. Each site keeps
its own theme, templates, seed content and wrangler config.

## Install (in a site's `cms/` folder)

npm's defaults (`allow-git = none`, `allow-remote = none`) refuse git and remote-tarball
dependencies, so each site vendors a packed release:

    npm pack                                   # in this repo: emdash-kit-<version>.tgz
    mkdir -p vendor && cp <kit>/emdash-kit-<version>.tgz vendor/
    npm i ./vendor/emdash-kit-<version>.tgz    # in the site's cms/; commit vendor/

To update a site, drop in the new tarball, `npm i` it, then build and deploy. The tarball is
a built release of this repo, never edited.

## Use

**Worker entry**: `src/worker.ts`

    export { default, Maintenance, PluginBridge } from "emdash-kit/worker";

- `/_emdash/*` answers 404 (except media files) until `EMDASH_ADMIN_OPEN` is `"true"`.
  EmDash's first-run setup makes the first visitor Administrator, so a staged site
  must not expose it.
- Responses with status 400 and above are marked `no-store` and lose their cache tags.
  Route caching applies whatever the status, so a transient error would otherwise be
  served from cache.
- `Maintenance` is a named entrypoint, reachable only through a service binding. A shared
  scheduler Worker with one cron calls `run()` on each site, because the Free plan allows
  only 5 cron triggers per account. Sites set `"triggers": { "crons": [] }`.

**Astro config**: `astro.config.mjs`

    import { emdashSite } from "emdash-kit/config";
    export default emdashSite({ root: import.meta.url, brands: ["mysite"], cachedPages: ["/", "/[slug]"] });

Every setting is explicit: `brands` (the allowed `BRAND` values, each a `src/themes/<brand>/`
folder), `cachedPages` (route patterns cached an hour, with stale-while-revalidate for a day;
media files are always cached a year), and optionally `devAllow` (extra folders the dev
server may read, relative to the site). It uses D1 binding `DB`, R2 binding `MEDIA`, and
Cloudflare route caching. A page render costs ~14 ms CPU against the Free plan's 10 ms;
a cache hit costs next to nothing.

**Media URL for CSS backgrounds**: `import { mediaUrl } from "emdash-kit/media-url"`

**Tools** (run in the site's `cms/` folder):

    npx emdash-kit seed <brand>                       # .emdash/seed.json from seed/schema.json + seed/<brand>.json
    npx emdash-kit content <brand> --local|--remote   # load seed content into an EMPTY D1 and its R2

`content` seeds a local SQLite with `emdash seed`, loads it into D1 in an order D1's foreign
keys accept, copies media into R2, and then checks every table's row count against the
local copy. D1 can drop a statement on a transient reset while reporting success. It
refuses a non-empty database. Content goes in without creating any user, so the
Administrator is claimed later on the real domain (passkeys bind to the origin).

Exit codes: 0 done, 3 refused (wrong folder, unknown brand, non-empty database), 1 fault.

## Test

    npm install && npm test
