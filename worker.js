// The Worker entry every EmDash site shares. A site's src/worker.ts is one line:
//   export { default, Maintenance, PluginBridge } from "emdash-kit/worker";
import { WorkerEntrypoint } from "cloudflare:workers";
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { adminGated, uncacheable } from "./lib/edge.js";

export { PluginBridge };

const scheduled = createScheduledHandler();

// EmDash maintenance (scheduled publishing, cleanup, scheduler heartbeat), called by a
// shared scheduler Worker through a service binding. The Workers Free plan allows 5 cron
// triggers per account, so the sites share one instead of each owning a cron. A named
// entrypoint is reachable only through a binding, never from the internet.
export class Maintenance extends WorkerEntrypoint {
	async run() {
		const pending = [];
		const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };
		await scheduled({ cron: "shared-scheduler", scheduledTime: Date.now(), noRetry() {} }, this.env, ctx);
		await Promise.all(pending);
		return "ok";
	}
}

export default {
	...handler,
	async fetch(request, env, ctx) {
		if (adminGated(request, env)) return uncacheable(new Response("Not found", { status: 404 }));
		return uncacheable(await handler.fetch(request, env, ctx));
	},
	scheduled,
};

