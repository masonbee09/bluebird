import { useEffect, useRef, useState } from "react";
import type { FloorMaterial } from "./shape_types";
import "./material_dialog.css";


export interface MaterialDialogProps {
    open: boolean;
    materials: FloorMaterial[];
    selectedMaterialIndex: number;
    onClose: () => void;
    onSelect: (index: number) => void;
    onAdd: (mat: Omit<FloorMaterial, "id">) => void;
    onUpdate: (index: number, mat: Omit<FloorMaterial, "id">) => void;
    onDelete: (index: number) => void;
}


const PRESET_COLORS = [
    "#2563eb", "#16a34a", "#dc2626", "#d97706",
    "#7c3aed", "#db2777", "#0891b2", "#65a30d",
];


interface EditState {
    name: string;
    offset: string;
    color: string;
    fillOpacity: number;
}


function emptyEdit(colors: string[], count: number): EditState {
    return {
        name: "",
        offset: "0",
        color: PRESET_COLORS[count % PRESET_COLORS.length] ?? colors[0] ?? "#2563eb",
        fillOpacity: 0.25,
    };
}


function MaterialRow({
    mat,
    index,
    isSelected,
    isEditing,
    editState,
    onSelect,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onDelete,
}: {
    mat: FloorMaterial;
    index: number;
    isSelected: boolean;
    isEditing: boolean;
    editState: EditState | null;
    onSelect: () => void;
    onEditStart: () => void;
    onEditChange: (patch: Partial<EditState>) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: () => void;
}) {
    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (isEditing) nameRef.current?.focus();
    }, [isEditing]);

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); onEditSave(); }
        if (e.key === "Escape") onEditCancel();
    };

    return (
        <div className={`matd-row${isSelected ? " is-selected" : ""}${isEditing ? " is-editing" : ""}`}>
            {/* Summary line */}
            <div className="matd-row-summary">
                <span
                    className="matd-swatch"
                    style={{ background: mat.color, opacity: 0.5 + mat.fillOpacity * 0.5 }}
                    aria-hidden="true" />
                <button
                    type="button"
                    className="matd-select-btn"
                    onClick={onSelect}
                    title={isSelected ? "Currently selected" : "Select for drawing"}>
                    {isSelected ? (
                        <span className="matd-active-badge">Drawing</span>
                    ) : (
                        <span className="matd-select-label">Select</span>
                    )}
                </button>
                <span className="matd-name">{mat.name}</span>
                <span className="matd-meta">
                    offset {mat.offset >= 0 ? "+" : ""}{mat.offset.toFixed(3)}
                </span>
                <span className="matd-meta matd-alpha">
                    α {mat.fillOpacity.toFixed(2)}
                </span>
                <div className="matd-actions">
                    <button
                        type="button"
                        className="matd-action-btn"
                        title="Edit"
                        onClick={onEditStart}
                        aria-label="Edit material">
                        ✎
                    </button>
                    <button
                        type="button"
                        className="matd-action-btn matd-del-btn"
                        title="Delete"
                        onClick={onDelete}
                        aria-label="Delete material">
                        ×
                    </button>
                </div>
            </div>

            {/* Inline edit form */}
            {isEditing && editState && (
                <div className="matd-edit-form" onKeyDown={handleKey}>
                    <div className="matd-edit-row">
                        <label className="matd-edit-field matd-edit-name">
                            <span className="matd-edit-label">Name</span>
                            <input
                                ref={nameRef}
                                type="text"
                                className="matd-edit-input"
                                value={editState.name}
                                onChange={e => onEditChange({ name: e.target.value })}
                                placeholder="e.g. Carpet"
                            />
                        </label>
                        <label className="matd-edit-field">
                            <span className="matd-edit-label">Offset</span>
                            <input
                                type="number"
                                step="0.001"
                                className="matd-edit-input matd-edit-number"
                                value={editState.offset}
                                onChange={e => onEditChange({ offset: e.target.value })}
                            />
                        </label>
                        <label className="matd-edit-field">
                            <span className="matd-edit-label">Color</span>
                            <input
                                type="color"
                                className="matd-color-input"
                                value={editState.color}
                                onChange={e => onEditChange({ color: e.target.value })}
                            />
                        </label>
                    </div>
                    <div className="matd-edit-row">
                        <label className="matd-edit-field matd-edit-alpha">
                            <span className="matd-edit-label">Fill opacity (A)</span>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                className="matd-slider"
                                value={editState.fillOpacity}
                                onChange={e => onEditChange({ fillOpacity: parseFloat(e.target.value) })}
                            />
                            <span className="matd-alpha-val">{editState.fillOpacity.toFixed(2)}</span>
                        </label>
                        <div
                            className="matd-preview-swatch"
                            style={{ background: editState.color, opacity: editState.fillOpacity }}
                            title="Preview fill"
                            aria-hidden="true" />
                    </div>
                    <div className="matd-edit-btns">
                        <button type="button" className="matd-save-btn" onClick={onEditSave}>
                            Update
                        </button>
                        <button type="button" className="matd-cancel-btn" onClick={onEditCancel}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


function MaterialDialog({
    open,
    materials,
    selectedMaterialIndex,
    onClose,
    onSelect,
    onAdd,
    onUpdate,
    onDelete,
}: MaterialDialogProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editState, setEditState] = useState<EditState | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addState, setAddState] = useState<EditState>(() => emptyEdit(PRESET_COLORS, 0));
    const addNameRef = useRef<HTMLInputElement>(null);

    // Reset when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setEditingIndex(null);
            setEditState(null);
            setAddOpen(false);
        }
    }, [open]);

    useEffect(() => {
        if (addOpen) addNameRef.current?.focus();
    }, [addOpen]);

    if (!open) return null;

    const startEdit = (i: number) => {
        const m = materials[i];
        setEditingIndex(i);
        setEditState({ name: m.name, offset: String(m.offset), color: m.color, fillOpacity: m.fillOpacity });
        setAddOpen(false);
    };

    const cancelEdit = () => { setEditingIndex(null); setEditState(null); };

    const saveEdit = () => {
        if (editingIndex === null || !editState) return;
        onUpdate(editingIndex, {
            name: editState.name.trim() || "Material",
            offset: parseFloat(editState.offset) || 0,
            color: editState.color,
            fillOpacity: Math.max(0, Math.min(1, editState.fillOpacity)),
        });
        setEditingIndex(null);
        setEditState(null);
    };

    const openAdd = () => {
        setAddState(emptyEdit(PRESET_COLORS, materials.length));
        setAddOpen(true);
        setEditingIndex(null);
        setEditState(null);
    };

    const saveAdd = () => {
        onAdd({
            name: addState.name.trim() || "Material",
            offset: parseFloat(addState.offset) || 0,
            color: addState.color,
            fillOpacity: Math.max(0, Math.min(1, addState.fillOpacity)),
        });
        setAddOpen(false);
    };

    const handleAddKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); saveAdd(); }
        if (e.key === "Escape") setAddOpen(false);
    };

    return (
        <div
            className="matd-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Floor Materials"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

            <div className="matd-panel">
                {/* Header */}
                <div className="matd-header">
                    <span className="matd-title">Floor Materials</span>
                    <button
                        type="button"
                        className="matd-close-btn"
                        onClick={onClose}
                        aria-label="Close">
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="matd-body">
                    {materials.length === 0 && !addOpen && (
                        <div className="matd-empty">
                            No materials defined yet. Add one to get started.
                        </div>
                    )}

                    {materials.map((mat, i) => (
                        <MaterialRow
                            key={mat.id}
                            mat={mat}
                            index={i}
                            isSelected={selectedMaterialIndex === i}
                            isEditing={editingIndex === i}
                            editState={editingIndex === i ? editState : null}
                            onSelect={() => { onSelect(i); onClose(); }}
                            onEditStart={() => startEdit(i)}
                            onEditChange={patch => setEditState(prev => prev ? { ...prev, ...patch } : prev)}
                            onEditSave={saveEdit}
                            onEditCancel={cancelEdit}
                            onDelete={() => {
                                onDelete(i);
                                if (editingIndex === i) cancelEdit();
                            }}
                        />
                    ))}

                    {/* Add new material form */}
                    {addOpen && (
                        <div className="matd-add-form" onKeyDown={handleAddKey}>
                            <div className="matd-add-heading">New Material</div>
                            <div className="matd-edit-row">
                                <label className="matd-edit-field matd-edit-name">
                                    <span className="matd-edit-label">Name</span>
                                    <input
                                        ref={addNameRef}
                                        type="text"
                                        className="matd-edit-input"
                                        value={addState.name}
                                        onChange={e => setAddState(s => ({ ...s, name: e.target.value }))}
                                        placeholder="e.g. Carpet"
                                    />
                                </label>
                                <label className="matd-edit-field">
                                    <span className="matd-edit-label">Offset</span>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="matd-edit-input matd-edit-number"
                                        value={addState.offset}
                                        onChange={e => setAddState(s => ({ ...s, offset: e.target.value }))}
                                    />
                                </label>
                                <label className="matd-edit-field">
                                    <span className="matd-edit-label">Color</span>
                                    <input
                                        type="color"
                                        className="matd-color-input"
                                        value={addState.color}
                                        onChange={e => setAddState(s => ({ ...s, color: e.target.value }))}
                                    />
                                </label>
                            </div>
                            <div className="matd-edit-row">
                                <label className="matd-edit-field matd-edit-alpha">
                                    <span className="matd-edit-label">Fill opacity (A)</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        className="matd-slider"
                                        value={addState.fillOpacity}
                                        onChange={e => setAddState(s => ({ ...s, fillOpacity: parseFloat(e.target.value) }))}
                                    />
                                    <span className="matd-alpha-val">{addState.fillOpacity.toFixed(2)}</span>
                                </label>
                                <div
                                    className="matd-preview-swatch"
                                    style={{ background: addState.color, opacity: addState.fillOpacity }}
                                    aria-hidden="true" />
                            </div>
                            <div className="matd-edit-btns">
                                <button type="button" className="matd-save-btn" onClick={saveAdd}>
                                    Add
                                </button>
                                <button type="button" className="matd-cancel-btn" onClick={() => setAddOpen(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="matd-footer">
                    <button
                        type="button"
                        className="matd-add-trigger"
                        onClick={openAdd}
                        disabled={addOpen}>
                        + Add Material
                    </button>
                </div>
            </div>
        </div>
    );
}


export default MaterialDialog;
