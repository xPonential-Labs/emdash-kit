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
- Requests on any host other than `EMDASH_SITE_URL`'s are redirected there, path and query
  kept: 301 for GET and HEAD, 308 for other methods, never cached. A page names the host it
  was rendered for and the page cache keeps whichever host came first, so a site answers on
  one host only. `localhost`, `127.0.0.1` and `[::1]` never redirect, and nothing redirects
  when `EMDASH_SITE_URL` is unset or unparsable.
- Responses with status 400 and above are marked `no-store` and lose their cache tags.
  Route caching applies whatever the status, so a transient error would otherwise be
  served from cache. The exception is the not-found page answering 404 at `/404`: themes
  redirect unknown slugs there and scanners probe thousands of unknown paths, so it is
  cached like a page.
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
Cloudflare route caching. Images uploaded to EmDash are resized (WebP, a `srcset` of
widths) by Cloudflare Images through the adapter's `IMAGES` binding. The site's own hosts are
allowed for resizing, read from `wrangler.jsonc` (`EMDASH_SITE_URL` and the route patterns
of the environment being built). Workers Free includes 5,000 unique transformations a month.
A page render measured 17-135 ms CPU (October 2026) against the Free plan's 10 ms; a cache
hit is served before the Worker runs and costs nothing.

**Sign-in**: the login page offers "Sign in with Google" beside passkeys, so editors need
neither a passkey nor an email provider. It is active once the Worker has two secrets:

    npx wrangler secret put EMDASH_OAUTH_GOOGLE_CLIENT_ID --name <worker>
    npx wrangler secret put EMDASH_OAUTH_GOOGLE_CLIENT_SECRET --name <worker>

The Google OAuth client (a Web application) lists one authorized redirect URI per site:
`https://<EMDASH_SITE_URL host>/_emdash/api/auth/oauth/google/callback`. Without an email
provider, the admin offers "copy invite link"; the invitee opens it and signs in with the
Google account whose address was invited (EmDash refuses a different or unverified one).

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

## New site

    emdash-kit new <domain> --d1-id <uuid> --dir <path>

Writes a placeholder EmDash site into `<path>/cms/` for a newly bought domain: `wrangler.jsonc`
with one environment named after the domain's label (routes for the apex and `www` on the
zone, `EMDASH_SITE_URL`, the D1 and R2 bindings, no cron, no workers.dev), a `package.json`
that depends on `file:vendor/emdash-kit-<version>.tgz`, and a plain page that says "Coming
soon" with a system-font stylesheet and `/404`. It does not write `vendor/`; copy the packed
tarball there before `npm install`.

`emdash-kit new` never calls Cloudflare: create the D1 database first and pass its id. The
admin stays gated, because `EMDASH_ADMIN_OPEN` is not set; the Administrator is claimed
after the first deploy. The domain must be exactly `<label>.<tld>`, `--d1-id` a UUID and
`--dir` absent or empty; anything else exits 3 and writes nothing.

## Sections and looks

A **section** is a building block of a page: an editor adds, fills in and reorders sections in the
admin, in the `layout` field of a page, with no code. A **look** is a selectable style pack (colours,
type and spacing) for the whole site. Both live in the kit, so a site generated by `emdash-kit new`
has them and every site can use a new one once it is added here.

The ten sections, by their block type slug: `hero`, `text`, `image_text`, `cards`, `steps`,
`gallery`, `quote`, `faq`, `cta_band`, `links`. Each renders as
`<section class="kit-section kit-<slug with hyphens>">` (for example `kit-image-text`). Their
fields are defined once, in `sections/catalog.json`, which `emdash-kit new` copies into the
site's `seed/schema.json` as `blockTypes`; the components are `sections/*.astro`, rendered by
`sections/Sections.astro`. The home page and `/<slug>` pages in the starter render their `layout`
with it.

The six looks: `warm`, `bold`, `quiet`, `playful`, `editorial`, `dark`. An editor picks the look in
the admin through the `look` collection: it holds one entry with a `style` dropdown. Publishing the
entry applies the look to the whole site with no rebuild, and drafts and revisions undo a choice.
If two entries are published the most recently published wins; with none published no look is
applied and the site's base styles show. The site's name and logo stay in its own settings.

### Add a look

A look is one CSS file in the kit's `looks/` folder, named after the look, whose rules are all
scoped to `[data-look="<name>"]` and which defines exactly nine variables: `--look-bg`,
`--look-surface`, `--look-text`, `--look-muted`, `--look-accent` (these five as literal hex
colours), `--look-font-heading`, `--look-font-body` (system font stacks, no `url(` and no
`@import`), `--look-radius` and `--look-space`. Text must reach a contrast of 4.5 to 1 on both
`--look-bg` and `--look-surface`, and the accent 3 to 1 on `--look-bg`; any two looks must differ
in at least five variables, at least two of them colours. Then add the name to the `style`
options of the `look` collection in `starter/cms/seed/schema.json` and import the file in the
starter's `src/layouts/Base.astro`. `npm test` checks all of this.

## Test

    npm install && npm test
