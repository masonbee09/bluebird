/**
 * Resolve the backend base URL.
 *
 * - In dev the Vite server runs on :5173/:5174 and the API on :8001, so the
 *   default hard-coded origin is correct.
 * - When deploying, build with `VITE_API_BASE=https://api.example.com` so the
 *   frontend points at the real backend. Trailing slash is tolerated.
 */
export function getApiBase(): string {
    const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
    const base = fromEnv && fromEnv.length > 0 ? fromEnv : "http://127.0.0.1:8001";
    return base.replace(/\/+$/, "");
}


/** Join ``getApiBase()`` with a path like "/fls_get_contour_polygons". */
export function apiUrl(path: string): string {
    const base = getApiBase();
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
}
