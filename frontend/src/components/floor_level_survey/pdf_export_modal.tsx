import { useEffect } from "react";
import type { PdfOrientation } from "./project_io";
import "./project_info_modal.css";
import "./pdf_export_modal.css";


interface PdfExportModalProps {
    open: boolean;
    orientation: PdfOrientation;
    onChangeOrientation: (o: PdfOrientation) => void;
    onClose: () => void;
    onExport: (orientation: PdfOrientation) => void;
}


const OPTIONS: { id: PdfOrientation; label: string; hint: string }[] = [
    { id: "auto", label: "Auto", hint: "Pick the best orientation from canvas aspect ratio." },
    { id: "portrait", label: "Portrait", hint: "A4 portrait, drawing centred on the page." },
    { id: "landscape", label: "Landscape", hint: "A4 landscape, ideal for wide floor plans." },
];


function PdfExportModal({ open, orientation, onChangeOrientation, onClose, onExport }: PdfExportModalProps) {
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter") {
                e.preventDefault();
                onExport(orientation);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, orientation, onClose, onExport]);

    if (!open) return null;

    return (
        <div className="fls-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div
                className="fls-modal fls-pdf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fls-pdf-export-title"
                onMouseDown={e => e.stopPropagation()}>

                <header className="fls-modal-header">
                    <h2 id="fls-pdf-export-title">Export to PDF</h2>
                    <button type="button" className="fls-modal-close" aria-label="Close" onClick={onClose}>×</button>
                </header>

                <div className="fls-modal-body">
                    <p className="fls-pdf-modal-intro">
                        Choose the layout for the exported PDF.
                    </p>

                    <div className="fls-pdf-modal-options" role="radiogroup" aria-label="PDF layout">
                        {OPTIONS.map(opt => {
                            const checked = orientation === opt.id;
                            return (
                                <label
                                    key={opt.id}
                                    className={`fls-pdf-modal-option${checked ? " is-active" : ""}`}>
                                    <input
                                        type="radio"
                                        name="fls-pdf-orientation"
                                        value={opt.id}
                                        checked={checked}
                                        onChange={() => onChangeOrientation(opt.id)}
                                    />
                                    <span className="fls-pdf-modal-option-preview" aria-hidden="true">
                                        <span className={`fls-pdf-modal-page fls-pdf-modal-page-${opt.id}`} />
                                    </span>
                                    <span className="fls-pdf-modal-option-text">
                                        <span className="fls-pdf-modal-option-label">{opt.label}</span>
                                        <span className="fls-pdf-modal-option-hint">{opt.hint}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <footer className="fls-modal-footer">
                    <button
                        type="button"
                        className="fls-modal-btn fls-modal-btn-ghost"
                        onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="fls-modal-btn fls-modal-btn-primary"
                        onClick={() => onExport(orientation)}>
                        Export
                    </button>
                </footer>
            </div>
        </div>
    );
}


export default PdfExportModal;
