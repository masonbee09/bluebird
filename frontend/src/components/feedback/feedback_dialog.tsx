import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { apiFetch } from "../../auth/api_client";
import "./feedback_dialog.css";


export type FeedbackCategory = "bug" | "feature" | "question" | "praise" | "other";


interface FeedbackDialogProps {
    open: boolean;
    onClose: () => void;
}


interface CategoryOption {
    id: FeedbackCategory;
    label: string;
    hint: string;
}


const CATEGORIES: CategoryOption[] = [
    { id: "bug",      label: "Bug",             hint: "Something is broken or behaving oddly" },
    { id: "feature",  label: "Feature request", hint: "Something you wish existed" },
    { id: "question", label: "Question",        hint: "Not sure how something works" },
    { id: "praise",   label: "Praise",          hint: "Something you liked" },
    { id: "other",    label: "Other",           hint: "General comment" },
];


type SubmitState =
    | { status: "idle" }
    | { status: "submitting" }
    | { status: "success" }
    | { status: "error"; message: string };


function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
    const [category, setCategory] = useState<FeedbackCategory>("bug");
    const [message, setMessage] = useState<string>("");
    const [state, setState] = useState<SubmitState>({ status: "idle" });
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Reset and focus each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setState({ status: "idle" });
        setMessage("");
        setCategory("bug");
        // Let the modal mount before focusing.
        const t = window.setTimeout(() => textareaRef.current?.focus(), 20);
        return () => window.clearTimeout(t);
    }, [open]);

    // Esc to close (only while idle/error — don't interrupt a submit).
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && state.status !== "submitting") {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose, state.status]);

    // Auto-close after a brief success confirmation.
    useEffect(() => {
        if (state.status !== "success") return;
        const t = window.setTimeout(() => onClose(), 1400);
        return () => window.clearTimeout(t);
    }, [state.status, onClose]);

    const trimmed = message.trim();
    const canSubmit = useMemo(
        () => trimmed.length > 0 && state.status !== "submitting" && state.status !== "success",
        [trimmed, state.status],
    );

    async function doSubmit() {
        if (!canSubmit) return;
        setState({ status: "submitting" });
        try {
            await apiFetch("/feedback", {
                method: "POST",
                body: {
                    category,
                    message: trimmed,
                    page: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
                    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                },
            });
            setState({ status: "success" });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setState({ status: "error", message: msg || "Could not send feedback." });
        }
    }

    function handleTextareaKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
        // Ctrl/Cmd+Enter submits from anywhere in the textarea.
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void doSubmit();
        }
    }

    if (!open) return null;

    return (
        <div
            className="bb-feedback-backdrop"
            role="presentation"
            onMouseDown={e => {
                if (e.target === e.currentTarget && state.status !== "submitting") onClose();
            }}>
            <div
                className="bb-feedback-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bb-feedback-title"
                onMouseDown={e => e.stopPropagation()}>

                <header className="bb-feedback-header">
                    <h2 id="bb-feedback-title" className="bb-feedback-title">Send feedback</h2>
                    <button
                        type="button"
                        className="bb-feedback-close"
                        aria-label="Close"
                        onClick={onClose}
                        disabled={state.status === "submitting"}>
                        ×
                    </button>
                </header>

                <div className="bb-feedback-body">
                    {state.status === "success" ? (
                        <div className="bb-feedback-success" role="status">
                            <span className="bb-feedback-success-check" aria-hidden="true">✓</span>
                            <div>
                                <div className="bb-feedback-success-title">Thanks — feedback sent.</div>
                                <div className="bb-feedback-success-subtitle">
                                    We'll review it shortly.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="bb-feedback-field">
                                <label className="bb-feedback-label" htmlFor="bb-feedback-category">
                                    Category
                                </label>
                                <div className="bb-feedback-chips" role="radiogroup" aria-labelledby="bb-feedback-category">
                                    {CATEGORIES.map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={category === opt.id}
                                            className={`bb-feedback-chip${category === opt.id ? " is-selected" : ""}`}
                                            onClick={() => setCategory(opt.id)}
                                            title={opt.hint}
                                            disabled={state.status === "submitting"}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bb-feedback-field">
                                <label className="bb-feedback-label" htmlFor="bb-feedback-message">
                                    Message
                                </label>
                                <textarea
                                    id="bb-feedback-message"
                                    ref={textareaRef}
                                    className="bb-feedback-textarea"
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    onKeyDown={handleTextareaKey}
                                    placeholder="What happened, what did you expect, and where were you in the app?"
                                    rows={6}
                                    maxLength={8000}
                                    disabled={state.status === "submitting"}
                                />
                                <div className="bb-feedback-counter" aria-hidden="true">
                                    {trimmed.length} / 8000
                                </div>
                            </div>

                            {state.status === "error" && (
                                <div className="bb-feedback-error" role="alert">
                                    {state.message}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {state.status !== "success" && (
                    <footer className="bb-feedback-footer">
                        <span className="bb-feedback-hint">
                            <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send
                        </span>
                        <div className="bb-feedback-actions">
                            <button
                                type="button"
                                className="bb-feedback-btn bb-feedback-btn-secondary"
                                onClick={onClose}
                                disabled={state.status === "submitting"}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="bb-feedback-btn bb-feedback-btn-primary"
                                onClick={doSubmit}
                                disabled={!canSubmit}>
                                {state.status === "submitting" ? "Sending…" : "Send"}
                            </button>
                        </div>
                    </footer>
                )}
            </div>
        </div>
    );
}

export default FeedbackDialog;
