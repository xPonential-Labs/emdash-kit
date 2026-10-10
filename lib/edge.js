// Pure request/response guards used by worker.js; no Workers runtime imports, so they
// can be tested under plain Node.

// EmDash's first-run setup lets the first visitor create the Administrator.
// Until EMDASH_ADMIN_OPEN is "true", everything under /_emdash/ answers 404
// except media files, so a staged deployment cannot be claimed by a stranger.
export function adminGated(request, env) {
	if (env.EMDASH_ADMIN_OPEN === "true") return false;
	const { pathname } = new URL(request.url);
	return pathname.startsWith("/_emdash") && !pathname.startsWith("/_emdash/api/media/file/");
}

// Never let an error be cached. Route rules cache pages at the edge for an hour, and they
// apply whatever the status, so a transient failure (a restart mid-deploy, a database
// blip) would otherwise be served from cache to every visitor until it expired.
export function uncacheable(res) {
	if (res.status < 400) return res;
	const out = new Response(res.body, res);
	out.headers.delete("Cache-Tag");
	out.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	out.headers.set("Cache-Control", "no-store");
	return out;
}
