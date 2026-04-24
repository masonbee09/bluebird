import { useEffect } from "react";
import "./project_info_modal.css";
import "./notice_dialog.css";

export type NoticeVariant = "info" | "warning" | "error";

interface NoticeDialogProps {
    open: boolean;
    title: string;
    message: string;
    variant?: NoticeVariant;
    onClose: () => void;
}

function NoticeDialog({ open, title, message, variant = "info", onClose }: NoticeDialogProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" || e.key === "Enter") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const badge = variant === "error" ? "!" : variant === "warning" ? "!" : "i";
    const titleResolved = title || (variant === "error" ? "Error" : variant === "warning" ? "Warning" : "Notice");

    return (
        <div className="fls-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div
                className={`fls-modal fls-notice-modal is-${variant}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="fls-notice-title"
                onMouseDown={e => e.stopPropagation()}>

                <header className="fls-modal-header">
                    <div className="fls-notice-title-wrap">
                        <span className="fls-notice-badge" aria-hidden="true">{badge}</span>
                        <h2 id="fls-notice-title">{titleResolved}</h2>
                    </div>
                    <button type="button" className="fls-modal-close" aria-label="Close" onClick={onClose}>×</button>
                </header>

                <div className="fls-modal-body">
                    <p className="fls-notice-message">{message}</p>
                </div>

                <footer className="fls-modal-footer">
                    <button
                        type="button"
                        className="fls-modal-btn fls-modal-btn-primary"
                        onClick={onClose}>
                        OK
                    </button>
                </footer>
            </div>
        </div>
    );
}

export default NoticeDialog;
