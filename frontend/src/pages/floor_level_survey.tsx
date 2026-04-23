import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FloorLevelSurvey, { type FLSApi } from "../components/floor_level_survey/floorlevelsurvey";
import { FloatInput } from "../components";
import {
    SelectIcon,
    WallIcon,
    PointIcon,
    BoundaryIcon,
    SolveIcon,
    SaveIcon,
    OpenIcon,
    PdfIcon,
    InfoIcon,
} from "../components/floor_level_survey/tool_icons";
import { interpolateContourColor } from "../components/floor_level_survey/contour_colors";
import {
    saveProjectFile,
    readProjectFile,
    exportCanvasAsPDF,
    type FLSProjectSettings,
    type PdfOrientation,
} from "../components/floor_level_survey/project_io";
import type { FloorMaterial } from "../components/floor_level_survey/shape_types";
import ProjectInfoModal, {
    emptyProjectInfo,
    type FLSProjectInfo,
} from "../components/floor_level_survey/project_info_modal";
import MaterialDialog from "../components/floor_level_survey/material_dialog";
import type { PointShape, Tool } from "../components/floor_level_survey/shape_types";
import "./div_types.css";
import "./floor_level_survey.css";


const PROJECT_INFO_STORAGE_KEY = "fls.projectInfo";


function loadStoredProjectInfo(): FLSProjectInfo {
    try {
        const raw = localStorage.getItem(PROJECT_INFO_STORAGE_KEY);
        if (!raw) return emptyProjectInfo();
        const parsed = JSON.parse(raw) as Partial<FLSProjectInfo>;
        return { ...emptyProjectInfo(), ...parsed };
    } catch {
        return emptyProjectInfo();
    }
}


interface ToolDef {
    id: Tool;
    label: string;
    shortcut: string;
    Icon: React.FC<React.SVGProps<SVGSVGElement>>;
}


const TOOLS: ToolDef[] = [
    { id: "select", label: "Select", shortcut: "V", Icon: SelectIcon },
    { id: "draw_wall", label: "Draw Wall", shortcut: "W", Icon: WallIcon },
    { id: "draw_point", label: "Draw Point", shortcut: "P", Icon: PointIcon },
    { id: "draw_boundary", label: "Boundary", shortcut: "B", Icon: BoundaryIcon },
];


function FloorLevelSurveyPage() {
    const [tool, setTool] = useState<Tool>("select");
    const [contourSpacing, setContourSpacing] = useState<number | null>(0.1);
    const [pointHeight, setPointHeight] = useState<number | null>(0.0);
    const [solveTrigger, setSolveTrigger] = useState<number>(0);
    const [showMajorGrid, setShowMajorGrid] = useState<boolean>(true);
    const [showMinimap, setShowMinimap] = useState<boolean>(true);
    const [showBoundaries, setShowBoundaries] = useState<boolean>(() => {
        try { return localStorage.getItem("fls.showBoundaries") !== "0"; } catch { return true; }
    });
    const [guideOpen, setGuideOpen] = useState<boolean>(() => {
        try { return localStorage.getItem("fls.shortcutGuide.open") === "1"; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem("fls.shortcutGuide.open", guideOpen ? "1" : "0"); } catch { /* ignore */ }
    }, [guideOpen]);
    const [contourStartColor, setContourStartColor] = useState<string>(() => {
        try { return localStorage.getItem("fls.contourStartColor") ?? "#1e40af"; } catch { return "#1e40af"; }
    });
    const [contourEndColor, setContourEndColor] = useState<string>(() => {
        try { return localStorage.getItem("fls.contourEndColor") ?? "#dc2626"; } catch { return "#dc2626"; }
    });
    const [contourFill, setContourFill] = useState<boolean>(() => {
        try { return localStorage.getItem("fls.contourFill") !== "0"; } catch { return true; }
    });
    const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>(() => {
        try {
            const v = localStorage.getItem("fls.pdfOrientation");
            if (v === "portrait" || v === "landscape" || v === "auto") return v;
        } catch { /* ignore */ }
        return "auto";
    });
    const [projectInfo, setProjectInfo] = useState<FLSProjectInfo>(() => loadStoredProjectInfo());
    const [projectInfoOpen, setProjectInfoOpen] = useState<boolean>(false);

    const [materials, setMaterials] = useState<FloorMaterial[]>(() => {
        try {
            const raw = localStorage.getItem("fls.materials");
            if (!raw) return [];
            return JSON.parse(raw) as FloorMaterial[];
        } catch { return []; }
    });
    const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number>(-1);

    const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false);
    const [highPoint, setHighPoint] = useState<PointShape | null>(null);
    const [lowPoint, setLowPoint] = useState<PointShape | null>(null);
    const [differential, setDifferential] = useState<number | null>(null);

    useEffect(() => {
        try { localStorage.setItem("fls.contourStartColor", contourStartColor); } catch { /* ignore */ }
    }, [contourStartColor]);
    useEffect(() => {
        try { localStorage.setItem("fls.contourEndColor", contourEndColor); } catch { /* ignore */ }
    }, [contourEndColor]);
    useEffect(() => {
        try { localStorage.setItem("fls.contourFill", contourFill ? "1" : "0"); } catch { /* ignore */ }
    }, [contourFill]);
    useEffect(() => {
        try { localStorage.setItem("fls.pdfOrientation", pdfOrientation); } catch { /* ignore */ }
    }, [pdfOrientation]);
    useEffect(() => {
        try { localStorage.setItem("fls.showBoundaries", showBoundaries ? "1" : "0"); } catch { /* ignore */ }
    }, [showBoundaries]);
    useEffect(() => {
        try { localStorage.setItem(PROJECT_INFO_STORAGE_KEY, JSON.stringify(projectInfo)); } catch { /* ignore */ }
    }, [projectInfo]);
    useEffect(() => {
        try { localStorage.setItem("fls.materials", JSON.stringify(materials)); } catch { /* ignore */ }
    }, [materials]);

    const selectedMaterial: FloorMaterial | null =
        selectedMaterialIndex >= 0 && selectedMaterialIndex < materials.length
            ? materials[selectedMaterialIndex]
            : null;

    function handleAddMaterial(patch: Omit<FloorMaterial, "id">) {
        const newMat: FloorMaterial = { id: crypto.randomUUID(), ...patch };
        setMaterials(prev => [...prev, newMat]);
        setSelectedMaterialIndex(materials.length);
    }

    function handleUpdateMaterial(index: number, patch: Omit<FloorMaterial, "id">) {
        const api = flsApiRef.current;
        const existing = materials[index];
        const updated: FloorMaterial = { ...existing, ...patch };
        setMaterials(prev => prev.map((m, i) => i === index ? updated : m));
        // Sync color/opacity/name/offset to all drawn boundary shapes
        if (api) api.updateBoundaryMaterial(existing.id, patch.name, patch.offset, patch.color, patch.fillOpacity);
    }

    function handleDeleteMaterial(index: number) {
        setMaterials(prev => prev.filter((_, i) => i !== index));
        if (selectedMaterialIndex === index) setSelectedMaterialIndex(-1);
        else if (selectedMaterialIndex > index) setSelectedMaterialIndex(prev => prev - 1);
    }

    const giveContourSpacing = () => contourSpacing ?? 0.1;
    const givePointHeight = () => pointHeight ?? 0.0;

    const flsApiRef = useRef<FLSApi | null>(null);
    const openInputRef = useRef<HTMLInputElement | null>(null);
    // Expose flsApiRef to material handlers above (safe — called only in events, not during render)

    const handleHighLowChange = useCallback((high: PointShape | null, low: PointShape | null, diff: number | null) => {
        setHighPoint(high);
        setLowPoint(low);
        setDifferential(diff);
    }, []);

    function triggerSolve() {
        setSolveTrigger(prev => prev + 1);
    }

    function currentSettings(): FLSProjectSettings {
        return {
            contourSpacing,
            pointHeight,
            showMajorGrid,
            showMinimap,
            contourStartColor,
            contourEndColor,
            contourFill,
            pdfOrientation,
            materials,
            projectInfo,
        };
    }

    function handleSaveProject() {
        const api = flsApiRef.current;
        if (!api) return;
        try {
            saveProjectFile(api.getShapes(), currentSettings());
        } catch (err) {
            console.error(err);
            window.alert("Failed to save project file.");
        }
    }

    function handleOpenProjectClick() {
        openInputRef.current?.click();
    }

    async function handleOpenProjectFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const api = flsApiRef.current;
        if (!api) return;
        try {
            const project = await readProjectFile(file);
            api.loadShapes(project.shapes);
            const s = project.settings;
            if (s) {
                setContourSpacing(s.contourSpacing ?? 0.1);
                setPointHeight(s.pointHeight ?? 0.0);
                setShowMajorGrid(!!s.showMajorGrid);
                setShowMinimap(!!s.showMinimap);
                if (s.contourStartColor) setContourStartColor(s.contourStartColor);
                if (s.contourEndColor) setContourEndColor(s.contourEndColor);
                setContourFill(!!s.contourFill);
                if (s.pdfOrientation === "portrait" || s.pdfOrientation === "landscape" || s.pdfOrientation === "auto") {
                    setPdfOrientation(s.pdfOrientation);
                }
                if (Array.isArray(s.materials)) {
                    setMaterials(s.materials as FloorMaterial[]);
                    setSelectedMaterialIndex(-1);
                }
                if (s.projectInfo) setProjectInfo({ ...emptyProjectInfo(), ...s.projectInfo });
            }
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : "Failed to read project file.";
            window.alert(`Import failed: ${message}`);
        }
    }

    function handleExportPDF() {
        const api = flsApiRef.current;
        if (!api) return;
        try {
            const img = api.getExportImage(3);
            if (!img) {
                window.alert("Canvas is not ready for export yet.");
                return;
            }
            exportCanvasAsPDF({
                dataUrl: img.dataUrl,
                stageWidth: img.width,
                stageHeight: img.height,
                shapes: api.getShapes(),
                settings: currentSettings(),
                legendRange: api.getLegendRange(),
                legendLevels: api.getLegendLevels(),
            });
        } catch (err) {
            console.error(err);
            window.alert("Failed to export PDF.");
        }
    }

    const contourGradientCss = useMemo(() => {
        const stops: string[] = [];
        const STOPS = 10;
        for (let i = 0; i <= STOPS; i++) {
            const t = i / STOPS;
            const color = interpolateContourColor(contourStartColor, contourEndColor, t);
            stops.push(`${color} ${(t * 100).toFixed(1)}%`);
        }
        return `linear-gradient(to right, ${stops.join(", ")})`;
    }, [contourStartColor, contourEndColor]);

    return (
        <div className="fls-page">
            <aside className="fls-toolstrip" aria-label="Tools">
                <button
                    type="button"
                    className="fls-toolstrip-btn"
                    onClick={handleOpenProjectClick}
                    title="Open project (.json)"
                    aria-label="Open project">
                    <OpenIcon />
                    <span className="fls-toolstrip-label">Open</span>
                </button>
                <button
                    type="button"
                    className="fls-toolstrip-btn"
                    onClick={handleSaveProject}
                    title="Save project (.json)"
                    aria-label="Save project">
                    <SaveIcon />
                    <span className="fls-toolstrip-label">Save</span>
                </button>
                <button
                    type="button"
                    className="fls-toolstrip-btn"
                    onClick={handleExportPDF}
                    title="Export as PDF"
                    aria-label="Export as PDF">
                    <PdfIcon />
                    <span className="fls-toolstrip-label">PDF</span>
                </button>
                <button
                    type="button"
                    className="fls-toolstrip-btn"
                    onClick={() => setProjectInfoOpen(true)}
                    title="Project information"
                    aria-label="Project information">
                    <InfoIcon />
                    <span className="fls-toolstrip-label">Project</span>
                </button>

                <div className="fls-toolstrip-divider" />

                {TOOLS.map(({ id, label, shortcut, Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={`fls-toolstrip-btn${tool === id ? " is-active" : ""}`}
                        onClick={() => setTool(id)}
                        title={`${label} (${shortcut})`}
                        aria-label={label}
                        aria-pressed={tool === id}>
                        <Icon />
                        <span className="fls-toolstrip-shortcut">{shortcut}</span>
                        <span className="fls-toolstrip-label">{label.replace(/^Draw /, "")}</span>
                    </button>
                ))}

                <div className="fls-toolstrip-divider" />

                <button
                    type="button"
                    className="fls-toolstrip-btn fls-toolstrip-solve"
                    onClick={triggerSolve}
                    title="Solve contours"
                    aria-label="Solve contours">
                    <SolveIcon />
                    <span className="fls-toolstrip-label">Solve</span>
                </button>

                <div className="fls-toolstrip-spacer" />

                <button
                    type="button"
                    className={`fls-toolstrip-btn fls-toolstrip-help${guideOpen ? " is-active" : ""}`}
                    onClick={() => setGuideOpen(!guideOpen)}
                    title="Keyboard shortcuts (?)"
                    aria-label="Keyboard shortcuts"
                    aria-pressed={guideOpen}>
                    <span className="fls-toolstrip-help-glyph">?</span>
                    <span className="fls-toolstrip-label">Help</span>
                </button>

                <input
                    ref={openInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={handleOpenProjectFile}
                />
            </aside>

            <div className="fls-workspace">
                <main className="fls-canvas-host">
                    <FloorLevelSurvey
                        apiRef={flsApiRef}
                        tool={tool}
                        setTool={setTool}
                        getContourSpacing={giveContourSpacing}
                        getPointHeight={givePointHeight}
                        solveTrigger={solveTrigger}
                        showMajorGrid={showMajorGrid}
                        setShowMajorGrid={setShowMajorGrid}
                        showMinimap={showMinimap}
                        setShowMinimap={setShowMinimap}
                        guideOpen={guideOpen}
                        setGuideOpen={setGuideOpen}
                        contourStartColor={contourStartColor}
                        contourEndColor={contourEndColor}
                        contourFill={contourFill}
                        setContourFill={setContourFill}
                        onActiveHeightChange={setPointHeight}
                        onHighLowChange={handleHighLowChange}
                        selectedMaterial={selectedMaterial}
                        showBoundaries={showBoundaries}
                    />
                </main>

                <footer className="fls-bottom-bar" aria-label="Properties">
                    <div className="fls-bottom-group">
                        <div className="fls-bottom-group-title">Properties Editor</div>
                        <div className="fls-bottom-group-content">
                            <div className="fls-bottom-field">
                                <FloatInput text="Point height" value={pointHeight} onChange={setPointHeight} />
                            </div>
                            <div className="fls-bottom-field">
                                <FloatInput text="Contour spacing" onChange={setContourSpacing} />
                            </div>
                        </div>
                    </div>

                    <div className="fls-bottom-divider" />

                    <div className="fls-bottom-group">
                        <div className="fls-bottom-group-title">Survey Summary</div>
                        <div className="fls-bottom-group-content fls-summary-content">
                            <div className="fls-summary-stat">
                                <span className="fls-summary-badge fls-summary-badge-high" aria-hidden="true">H</span>
                                <span className="fls-summary-value">
                                    {highPoint !== null ? highPoint.z.toFixed(2) : "—"}
                                </span>
                            </div>
                            <div className="fls-summary-stat">
                                <span className="fls-summary-badge fls-summary-badge-low" aria-hidden="true">L</span>
                                <span className="fls-summary-value">
                                    {lowPoint !== null ? lowPoint.z.toFixed(2) : "—"}
                                </span>
                            </div>
                            <div className="fls-summary-stat fls-summary-stat-diff">
                                <span className="fls-summary-key">Total Differential</span>
                                <span className="fls-summary-value fls-summary-value-strong">
                                    {differential !== null
                                        ? `${differential.toFixed(2)} ${projectInfo.units || ""}`.trim()
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="fls-bottom-divider" />

                    <div className="fls-bottom-group">
                        <div className="fls-bottom-group-title">Contour Colors</div>
                        <div className="fls-bottom-group-content">
                            <label className="fls-color-field">
                                <span className="fls-color-label">Start</span>
                                <input
                                    type="color"
                                    className="fls-color-input"
                                    value={contourStartColor}
                                    onChange={e => setContourStartColor(e.target.value)}
                                    aria-label="Contour start color"
                                />
                                <span className="fls-color-hex">{contourStartColor.toUpperCase()}</span>
                            </label>
                            <div
                                className="fls-color-preview"
                                aria-hidden="true"
                                style={{ backgroundImage: contourGradientCss }}
                            />
                            <label className="fls-color-field">
                                <span className="fls-color-label">End</span>
                                <input
                                    type="color"
                                    className="fls-color-input"
                                    value={contourEndColor}
                                    onChange={e => setContourEndColor(e.target.value)}
                                    aria-label="Contour end color"
                                />
                                <span className="fls-color-hex">{contourEndColor.toUpperCase()}</span>
                            </label>
                        </div>
                    </div>

                    <div className="fls-bottom-divider" />

                    <div className="fls-bottom-group fls-materials-group">
                        <div className="fls-bottom-group-title">Floor Materials</div>
                        <div className="fls-bottom-group-content fls-materials-row">
                            <button
                                type="button"
                                className="fls-mat-dialog-trigger"
                                onClick={() => setMaterialsDialogOpen(true)}
                                title="Manage floor materials">
                                {selectedMaterial ? (
                                    <>
                                        <span
                                            className="fls-mat-color"
                                            style={{ background: selectedMaterial.color }}
                                            aria-hidden="true" />
                                        <span className="fls-mat-name">{selectedMaterial.name}</span>
                                        <span className="fls-mat-offset">
                                            {selectedMaterial.offset >= 0 ? "+" : ""}
                                            {selectedMaterial.offset}
                                        </span>
                                    </>
                                ) : (
                                    <span className="fls-mat-name">
                                        {materials.length > 0
                                            ? `${materials.length} material${materials.length !== 1 ? "s" : ""}`
                                            : "No materials"}
                                    </span>
                                )}
                                <span className="fls-mat-dialog-arrow">▾</span>
                            </button>

                            {/* Visibility toggle */}
                            <label
                                className="fls-view-toggle"
                                title={showBoundaries ? "Hide material areas" : "Show material areas"}>
                                <input
                                    type="checkbox"
                                    className="fls-switch-input"
                                    checked={showBoundaries}
                                    onChange={e => setShowBoundaries(e.target.checked)}
                                />
                                <span className="fls-switch-track" aria-hidden="true" />
                                <span className="fls-view-toggle-label">Show Areas</span>
                            </label>
                        </div>
                    </div>

                    <div className="fls-bottom-divider" />

                    <div className="fls-bottom-group">
                        <div className="fls-bottom-group-title">PDF Layout</div>
                        <div className="fls-bottom-group-content">
                            <div
                                className="fls-segmented"
                                role="radiogroup"
                                aria-label="PDF orientation">
                                {(["auto", "portrait", "landscape"] as const).map(opt => (
                                    <button
                                        key={opt}
                                        type="button"
                                        role="radio"
                                        aria-checked={pdfOrientation === opt}
                                        className={`fls-segmented-btn${pdfOrientation === opt ? " is-active" : ""}`}
                                        onClick={() => setPdfOrientation(opt)}
                                        title={`Export PDF in ${opt} layout`}>
                                        {opt === "auto"
                                            ? "Auto"
                                            : opt === "portrait"
                                                ? "Portrait"
                                                : "Landscape"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="fls-bottom-spacer" />

                    <div className="fls-bottom-hint">
                        
                    </div>
                </footer>
            </div>

            <ProjectInfoModal
                open={projectInfoOpen}
                value={projectInfo}
                onClose={() => setProjectInfoOpen(false)}
                onSave={setProjectInfo}
            />

            <MaterialDialog
                open={materialsDialogOpen}
                materials={materials}
                selectedMaterialIndex={selectedMaterialIndex}
                onClose={() => setMaterialsDialogOpen(false)}
                onSelect={i => {
                    setSelectedMaterialIndex(i);
                    setTool("draw_boundary");
                }}
                onAdd={handleAddMaterial}
                onUpdate={handleUpdateMaterial}
                onDelete={handleDeleteMaterial}
            />
        </div>
    );
}


export default FloorLevelSurveyPage;
