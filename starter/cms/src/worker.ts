// The shared Worker entry (admin gate before cutover, never-cache-errors guard, and the
// Maintenance entrypoint the shared scheduler calls) lives in emdash-kit.
export { default, Maintenance, PluginBridge } from "emdash-kit/worker";
