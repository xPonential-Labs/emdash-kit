import type { WorkerEntrypoint } from "cloudflare:workers";
export { PluginBridge } from "@emdash-cms/cloudflare/worker";
declare const worker: ExportedHandler;
export default worker;
export declare class Maintenance extends WorkerEntrypoint {
	run(): Promise<string>;
}
export declare function adminGated(request: Request, env: Record<string, unknown>): boolean;
export declare function uncacheable(res: Response): Response;
