import { apiUrl } from "./api_base";
import { getStoredApiKey } from "./api_key_store";


export class ApiAuthError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ApiAuthError";
    }
}


type AuthEventKind = "unauthorized" | "forbidden";
type AuthListener = (kind: AuthEventKind, message: string) => void;

const listeners = new Set<AuthListener>();

/** Subscribe to 401/403 responses so the gate UI can react (sign the user out). */
export function onAuthFailure(listener: AuthListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function emitAuthFailure(kind: AuthEventKind, message: string): void {
    listeners.forEach(l => {
        try { l(kind, message); } catch { /* ignore */ }
    });
}


interface ApiFetchOptions {
    method?: string;
    body?: unknown;
    /** Extra headers (merged after the defaults). */
    headers?: Record<string, string>;
    /** When true, send the request without the X-API-Key header (used by
     *  ``/auth/validate`` itself). Default false. */
    skipAuth?: boolean;
    /** Pass an explicit key for this call (used by the login flow to validate
     *  a freshly-entered key that has not been stored yet). */
    apiKeyOverride?: string;
    signal?: AbortSignal;
}


/**
 * ``fetch`` wrapper that automatically:
 *   - resolves the base URL via ``getApiBase()``
 *   - sets JSON content/accept headers
 *   - attaches the stored ``X-API-Key`` header
 *   - serialises the body as JSON
 *   - throws ``ApiAuthError`` on 401/403 and notifies listeners
 *   - throws ``Error`` with the server message on other non-2xx responses
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(opts.headers ?? {}),
    };

    if (!opts.skipAuth) {
        const key = opts.apiKeyOverride ?? getStoredApiKey();
        if (key) headers["X-API-Key"] = key;
    }

    const init: RequestInit = {
        method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
        headers,
        signal: opts.signal,
    };
    if (opts.body !== undefined) {
        init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }

    const response = await fetch(apiUrl(path), init);

    if (response.status === 401 || response.status === 403) {
        const msg = await safeReadMessage(response);
        if (!opts.skipAuth && !opts.apiKeyOverride) {
            emitAuthFailure(response.status === 401 ? "unauthorized" : "forbidden", msg);
        }
        throw new ApiAuthError(response.status, msg);
    }

    if (!response.ok) {
        const msg = await safeReadMessage(response);
        throw new Error(`HTTP ${response.status}: ${msg}`);
    }

    if (response.status === 204) return undefined as unknown as T;
    return (await response.json()) as T;
}


async function safeReadMessage(response: Response): Promise<string> {
    try {
        const data = await response.clone().json();
        if (data && typeof data === "object" && typeof (data as { detail?: unknown }).detail === "string") {
            return (data as { detail: string }).detail;
        }
        if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
            return (data as { message: string }).message;
        }
    } catch {
        /* fall through to text */
    }
    try {
        const text = await response.clone().text();
        if (text) return text;
    } catch {
        /* ignore */
    }
    return response.statusText || `HTTP ${response.status}`;
}
