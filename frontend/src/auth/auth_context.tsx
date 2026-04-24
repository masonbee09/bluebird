import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch, ApiAuthError, onAuthFailure } from "./api_client";
import {
    clearStoredApiKey,
    getStoredApiKey,
    getStoredApiKeyLabel,
    setStoredApiKey,
} from "./api_key_store";


export type AuthStatus = "unknown" | "checking" | "authenticated" | "unauthenticated";


interface AuthContextValue {
    status: AuthStatus;
    label: string | null;
    error: string | null;
    /** Validate a freshly-entered key with the server; on success, persist it. */
    signIn(key: string): Promise<{ ok: boolean; error?: string }>;
    /** Clear the stored key and drop back to the gate. */
    signOut(): void;
}


const AuthContext = createContext<AuthContextValue | null>(null);


interface ValidateResponse {
    ok: boolean;
    reason?: string;
    label?: string;
    expires_at?: string | null;
}


function describeFailure(reason: string | undefined): string {
    switch (reason) {
        case "expired":  return "This key has expired. Ask the admin for a new one.";
        case "revoked":  return "This key has been revoked.";
        case "unknown":
        case "invalid":
        case undefined:  return "That key is not recognized. Double-check for typos.";
        default:         return `Sign-in failed: ${reason}`;
    }
}


export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>(() =>
        getStoredApiKey() ? "checking" : "unauthenticated",
    );
    const [label, setLabel] = useState<string | null>(() => getStoredApiKeyLabel());
    const [error, setError] = useState<string | null>(null);

    // Verify any persisted key on load. If the admin has revoked it or it
    // expired, drop back to the gate automatically.
    useEffect(() => {
        const stored = getStoredApiKey();
        if (!stored) {
            setStatus("unauthenticated");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetch<ValidateResponse>("/auth/validate", {
                    method: "POST",
                    body: { key: stored },
                    skipAuth: true,
                });
                if (cancelled) return;
                if (res.ok) {
                    if (res.label) setLabel(res.label);
                    setStoredApiKey(stored, res.label ?? null);
                    setStatus("authenticated");
                } else {
                    clearStoredApiKey();
                    setLabel(null);
                    setError(describeFailure(res.reason));
                    setStatus("unauthenticated");
                }
            } catch (err) {
                if (cancelled) return;
                // Network error — don't wipe the key, just show the gate so
                // the user can retry. They might be offline.
                console.warn("Auth validate failed:", err);
                setError("Could not reach the server. Check your connection and try again.");
                setStatus("unauthenticated");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const signIn = useCallback(async (rawKey: string): Promise<{ ok: boolean; error?: string }> => {
        const key = rawKey.trim();
        if (!key) {
            return { ok: false, error: "Enter your beta access key." };
        }
        setStatus("checking");
        setError(null);
        try {
            const res = await apiFetch<ValidateResponse>("/auth/validate", {
                method: "POST",
                body: { key },
                skipAuth: true,
            });
            if (res.ok) {
                setStoredApiKey(key, res.label ?? null);
                setLabel(res.label ?? null);
                setStatus("authenticated");
                return { ok: true };
            }
            const msg = describeFailure(res.reason);
            setError(msg);
            setStatus("unauthenticated");
            return { ok: false, error: msg };
        } catch (err) {
            const msg = err instanceof ApiAuthError
                ? err.message
                : err instanceof Error
                    ? `Could not reach the server: ${err.message}`
                    : "Could not reach the server.";
            setError(msg);
            setStatus("unauthenticated");
            return { ok: false, error: msg };
        }
    }, []);

    const signOut = useCallback(() => {
        clearStoredApiKey();
        setLabel(null);
        setError(null);
        setStatus("unauthenticated");
    }, []);

    // Global reaction to 401/403 from any apiFetch caller: treat it as a
    // forced sign-out so the gate reappears with a helpful message.
    useEffect(() => {
        const off = onAuthFailure((_kind, message) => {
            clearStoredApiKey();
            setLabel(null);
            setError(message || "Your session is no longer valid. Please sign in again.");
            setStatus("unauthenticated");
        });
        return off;
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        status,
        label,
        error,
        signIn,
        signOut,
    }), [status, label, error, signIn, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside an <AuthProvider>");
    return ctx;
}
