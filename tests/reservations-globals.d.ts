// Legacy application boundary only. RPC JSON is dynamically supplied by Supabase;
// authoritative field/permission validation is in the tested SQL migration.
declare let session: {id: string | null; authMode: string};
declare let supabaseClient: {rpc(name: string, args: object): Promise<{data: any; error: {code?: string; message?: string} | null}>} | null;
declare function escapeHTML(value: unknown): string;
declare let showApp: (...args: unknown[]) => unknown;
declare function page(id: string): unknown;
declare const STOPFLOW_STABLE_PAGES: Set<string>;
interface Window {
  stopflowReservations?: {active: boolean; canOpen(): boolean; open(): Promise<void>; refreshAccess(): Promise<void>};
  stopflow070CardNavigation?: {active: boolean; runtime: {currentZone: string}; refreshMenus(): void; refresh(): void; openHome(): void};
}
