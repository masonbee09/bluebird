import { useEffect, useRef, useState } from "react";
import "./project_info_modal.css";


export interface FLSProjectInfo {
    companyName: string;
    companyLogo: string; // data URL (base64) or empty
    projectName: string;
    projectAddress: string;
    projectNumber: string;
    drawingNumber: string;
    surveyDate: string; // ISO yyyy-mm-dd, or empty for "today"
    units: string;
}


export function emptyProjectInfo(): FLSProjectInfo {
    return {
        companyName: "",
        companyLogo: "",
        projectName: "",
        projectAddress: "",
        projectNumber: "",
        drawingNumber: "",
        surveyDate: "",
        units: "inches",
    };
}


const MAX_LOGO_BYTES = 1_500_000; // ~1.5 MB raw; base64 expands ~33%


interface ProjectInfoModalProps {
    open: boolean;
    value: FLSProjectInfo;
    onClose: () => void;
    onSave: (info: FLSProjectInfo) => void;
}


function ProjectInfoModal({ open, value, onClose, onSave }: ProjectInfoModalProps) {
    const [draft, setDraft] = useState<FLSProjectInfo>(value);
    const [logoError, setLogoError] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setDraft(value);
            setLogoError(null);
        }
    }, [open, value]);

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const set = <K extends keyof FLSProjectInfo>(key: K, v: FLSProjectInfo[K]) => {
        setDraft(prev => ({ ...prev, [key]: v }));
    };

    function handleLogoFile(file: File | null) {
        if (!file) return;
        if (file.size > MAX_LOGO_BYTES) {
            setLogoError(`Image is too large (${(file.size / 1024).toFixed(0)} KB). Please use one under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`);
            return;
        }
        if (!file.type.startsWith("image/")) {
            setLogoError("Please choose an image file (PNG, JPG, SVG).");
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => setLogoError("Failed to read image file.");
        reader.onload = () => {
            setLogoError(null);
            set("companyLogo", String(reader.result ?? ""));
        };
        reader.readAsDataURL(file);
    }

    function handleSave() {
        onSave(draft);
        onClose();
    }

    return (
        <div className="fls-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div
                className="fls-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fls-project-info-title"
                onMouseDown={e => e.stopPropagation()}>

                <header className="fls-modal-header">
                    <h2 id="fls-project-info-title">Project Information</h2>
                    <button type="button" className="fls-modal-close" aria-label="Close" onClick={onClose}>×</button>
                </header>

                <div className="fls-modal-body">
                    <div className="fls-modal-row">
                        <label className="fls-modal-field fls-modal-field-wide">
                            <span>Company name</span>
                            <input
                                type="text"
                                value={draft.companyName}
                                onChange={e => set("companyName", e.target.value)}
                                placeholder=""
                            />
                        </label>
                    </div>

                    <div className="fls-modal-row">
                        <div className="fls-modal-field fls-modal-field-wide">
                            <span>Company logo</span>
                            <div className="fls-modal-logo-row">
                                <div className="fls-modal-logo-preview" aria-hidden="true">
                                    {draft.companyLogo ? (
                                        <img src={draft.companyLogo} alt="" />
                                    ) : (
                                        <span>No logo</span>
                                    )}
                                </div>
                                <div className="fls-modal-logo-actions">
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={e => handleLogoFile(e.target.files?.[0] ?? null)}
                                    />
                                    <button
                                        type="button"
                                        className="fls-modal-btn fls-modal-btn-ghost"
                                        onClick={() => logoInputRef.current?.click()}>
                                        Choose image
                                    </button>
                                    {draft.companyLogo && (
                                        <button
                                            type="button"
                                            className="fls-modal-btn fls-modal-btn-ghost"
                                            onClick={() => set("companyLogo", "")}>
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            {logoError && <span className="fls-modal-error">{logoError}</span>}
                        </div>
                    </div>

                    <div className="fls-modal-row">
                        <label className="fls-modal-field fls-modal-field-wide">
                            <span>Project name</span>
                            <input
                                type="text"
                                value={draft.projectName}
                                onChange={e => set("projectName", e.target.value)}
                                placeholder=""
                            />
                        </label>
                    </div>

                    <div className="fls-modal-row">
                        <label className="fls-modal-field fls-modal-field-wide">
                            <span>Project address</span>
                            <textarea
                                value={draft.projectAddress}
                                onChange={e => set("projectAddress", e.target.value)}
                                rows={3}
                                placeholder=""
                            />
                        </label>
                    </div>

                    <div className="fls-modal-row">
                        <label className="fls-modal-field">
                            <span>Project number</span>
                            <input
                                type="text"
                                value={draft.projectNumber}
                                onChange={e => set("projectNumber", e.target.value)}
                                placeholder=""
                            />
                        </label>
                        <label className="fls-modal-field">
                            <span>Drawing number</span>
                            <input
                                type="text"
                                value={draft.drawingNumber}
                                onChange={e => set("drawingNumber", e.target.value)}
                                placeholder=""
                            />
                        </label>
                    </div>

                    <div className="fls-modal-row">
                        <label className="fls-modal-field">
                            <span>Survey date</span>
                            <input
                                type="date"
                                value={draft.surveyDate}
                                onChange={e => set("surveyDate", e.target.value)}
                            />
                        </label>
                        <label className="fls-modal-field">
                            <span>Units</span>
                            <select
                                value={draft.units}
                                onChange={e => set("units", e.target.value)}>
                                <option value="inches">inches</option>
                                <option value="mm">mm</option>
                                <option value="cm">cm</option>
                                <option value="m">m</option>
                                <option value="ft">ft</option>
                            </select>
                        </label>
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
                        onClick={handleSave}>
                        Save
                    </button>
                </footer>
            </div>
        </div>
    );
}


export default ProjectInfoModal;
