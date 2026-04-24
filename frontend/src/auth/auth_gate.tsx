import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuth } from "./auth_context";
import "./auth_gate.css";


interface AuthGateProps {
    children: ReactNode;
}


/**
 * Wraps the app; shows the beta-key prompt until the user has authenticated.
 */
export function AuthGate({ children }: AuthGateProps) {
    const { status, error, signIn } = useAuth();

    const [key, setKey] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLocalError(null);
        setSubmitting(true);
        try {
            const res = await signIn(key);
            if (!res.ok) setLocalError(res.error ?? "Sign-in failed.");
        } finally {
            setSubmitting(false);
        }
    }

    if (status === "authenticated") {
        return <>{children}</>;
    }

    const isBooting = status === "checking" && !submitting && !localError;
    const shownError = localError ?? error;

    return (
        <div className="bb-gate-root" role="dialog" aria-modal="true" aria-labelledby="bb-gate-title">
            <div className="bb-gate-card">
                <div className="bb-gate-brand">
                    <span className="bb-gate-mark" aria-hidden="true">BB</span>
                    <span className="bb-gate-brand-name">Blue Bird</span>
                </div>

                <h1 id="bb-gate-title" className="bb-gate-title">Beta access</h1>
                <p className="bb-gate-subtitle">
                    This preview is gated. Paste the beta key that was shared with you to continue.
                </p>

                <form className="bb-gate-form" onSubmit={handleSubmit}>
                    <label className="bb-gate-field">
                        <span className="bb-gate-label">Access key</span>
                        <input
                            type="password"
                            className="bb-gate-input"
                            value={key}
                            onChange={e => setKey(e.target.value)}
                            placeholder="bb_…"
                            autoComplete="off"
                            autoFocus
                            disabled={submitting || isBooting}
                            spellCheck={false}
                        />
                    </label>

                    {shownError && (
                        <div className="bb-gate-error" role="alert">
                            {shownError}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="bb-gate-submit"
                        disabled={submitting || isBooting || key.trim().length === 0}>
                        {submitting || isBooting ? "Checking…" : "Unlock"}
                    </button>
                </form>

                <p className="bb-gate-footnote">
                    Don't have a key? Contact the project owner to request beta access.
                </p>
            </div>
        </div>
    );
}
