/**
 * Small wrapper around localStorage for the beta API key.
 *
 * The key is persisted so users only paste it once per browser. A user can
 * clear it via the "Sign out" button in the topbar, which calls
 * ``clearStoredApiKey()``.
 */

const KEY_STORAGE = "bb.apiKey";
const LABEL_STORAGE = "bb.apiKeyLabel";


export function getStoredApiKey(): string | null {
    try {
        const v = localStorage.getItem(KEY_STORAGE);
        return v && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}


export function setStoredApiKey(key: string, label: string | null): void {
    try {
        localStorage.setItem(KEY_STORAGE, key);
        if (label) localStorage.setItem(LABEL_STORAGE, label);
        else localStorage.removeItem(LABEL_STORAGE);
    } catch {
        /* storage disabled / quota exceeded — non-fatal */
    }
}


export function getStoredApiKeyLabel(): string | null {
    try {
        const v = localStorage.getItem(LABEL_STORAGE);
        return v && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}


export function clearStoredApiKey(): void {
    try {
        localStorage.removeItem(KEY_STORAGE);
        localStorage.removeItem(LABEL_STORAGE);
    } catch {
        /* ignore */
    }
}
