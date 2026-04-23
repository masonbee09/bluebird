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
    type FLSBackgroundImage,
} from "../components/floor_level_survey/project_io";
import { importBackgroundFile } from "../components/floor_level_survey/pdf_to_image";
import type { FloorMaterial } from "../components/floor_level_survey/shape_types";
import ProjectInfoModal, {
    emptyProjectInfo,
    type FLSProjectInfo,
} from "../components/floor_level_survey/project_info_modal";
import MaterialDialog from "../components/floor_level_survey/material_dialog";
import PdfExportModal from "../components/floor_level_survey/pdf_export_modal";
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

    const [materials, setMaterials] = useState<FloorMaterial[]>([]);
    const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number>(-1);

    const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false);
    const [highPoint, setHighPoint] = useState<PointShape | null>(null);
    const [lowPoint, setLowPoint] = useState<PointShape | null>(null);
    const [differential, setDifferential] = useState<number | null>(null);

    // Tracing reference image (hand-drawn survey PDF / photo)
    const [backgroundImage, setBackgroundImage] = useState<FLSBackgroundImage | null>(() => {
        try {
            const raw = localStorage.getItem("fls.backgroundImage");
            return raw ? JSON.parse(raw) as FLSBackgroundImage : null;
        } catch { return null; }
    });
    const [bgAdjustMode, setBgAdjustMode] = useState<boolean>(false);
    const [bgImporting, setBgImporting] = useState<boolean>(false);
    const bgFileInputRef = useRef<HTMLInputElement | null>(null);
    const [pdfDialogOpen, setPdfDialogOpen] = useState<boolean>(false);


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

    // Automatically exit "Adjust background" mode when the user switches to
    // any drawing tool. Otherwise the Transformer on the background image
    // would hijack mouse events over the image's bounding rectangle and the
    // picture would follow the pointer while the user tries to trace.
    useEffect(() => {
        if (tool !== "select" && bgAdjustMode) setBgAdjustMode(false);
    }, [tool, bgAdjustMode]);
    useEffect(() => {
        try {
            if (backgroundImage) localStorage.setItem("fls.backgroundImage", JSON.stringify(backgroundImage));
            else localStorage.removeItem("fls.backgroundImage");
        } catch { /* may exceed quota for huge images; non-fatal */ }
    }, [backgroundImage]);

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

    /* ── Background tracing image ───────────────────────── */

    function handleImportBackgroundClick() {
        bgFileInputRef.current?.click();
    }

    async function handleImportBackgroundFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBgImporting(true);
        try {
            const raster = await importBackgroundFile(file);
            // Default placement: fit a generous, always-visible size, regardless
            // of the source resolution. Longest side = 600 world units
            // (i.e. ~30 major grid squares — big enough to see immediately on
            // any viewport, small enough to still fit on screen).
            const rasterW = Math.max(1, raster.width);
            const rasterH = Math.max(1, raster.height);
            const targetLongestPx = 600;
            const longestPx = Math.max(rasterW, rasterH);
            const worldScale = targetLongestPx / longestPx;
            const w = rasterW * worldScale;
            const h = rasterH * worldScale;
            setBackgroundImage({
                dataUrl: raster.dataUrl,
                x: -w / 2,
                y: -h / 2,
                width: w,
                height: h,
                rotation: 0,
                opacity: 0.35,
                visible: true,
                locked: true,
                naturalWidth: rasterW,
                naturalHeight: rasterH,
            });
            // Open in adjust mode so the user can position it immediately.
            // (Switching to a drawing tool will automatically exit adjust mode.)
            setTool("select");
            setBgAdjustMode(true);
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : "Could not import the file.";
            window.alert(`Background import failed: ${message}`);
        } finally {
            setBgImporting(false);
        }
    }

    const handleBackgroundPatch = useCallback((patch: Partial<FLSBackgroundImage>) => {
        setBackgroundImage(prev => prev ? { ...prev, ...patch } : prev);
    }, []);

    function handleRemoveBackground() {
        if (!backgroundImage) return;
        if (!window.confirm("Remove the tracing background image?")) return;
        setBackgroundImage(null);
        setBgAdjustMode(false);
    }

    // The FLS canvas captures these callbacks only on its first render (via
    // useState), so we need stable identities that always return the latest
    // values. A ref is the simplest way to bridge this.
    const contourSpacingRef = useRef<number>(contourSpacing ?? 0.1);
    useEffect(() => { contourSpacingRef.current = contourSpacing ?? 0.1; }, [contourSpacing]);
    const pointHeightRef = useRef<number>(pointHeight ?? 0.0);
    useEffect(() => { pointHeightRef.current = pointHeight ?? 0.0; }, [pointHeight]);
    const giveContourSpacing = useCallback(() => contourSpacingRef.current, []);
    const givePointHeight = useCallback(() => pointHeightRef.current, []);

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
            backgroundImage,
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
        const api = flsApiRef.current;
        const hasWork = !!api && api.getShapes().length > 0;
        if (hasWork && !window.confirm("Opening another project will discard unsaved changes in the current workspace. Continue?")) {
            return;
        }
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
                } else {
                    setMaterials([]);
                    setSelectedMaterialIndex(-1);
                }
                if (s.projectInfo) setProjectInfo({ ...emptyProjectInfo(), ...s.projectInfo });
                setBackgroundImage(s.backgroundImage ?? null);
                setBgAdjustMode(false);
            }
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : "Failed to read project file.";
            window.alert(`Import failed: ${message}`);
        }
    }

    function handleExportPDF(orientationOverride?: PdfOrientation) {
        const api = flsApiRef.current;
        if (!api) return;
        try {
            const img = api.getExportImage(3);
            if (!img) {
                window.alert("Canvas is not ready for export yet.");
                return;
            }
            const settings = currentSettings();
            if (orientationOverride) settings.pdfOrientation = orientationOverride;
            exportCanvasAsPDF({
                dataUrl: img.dataUrl,
                stageWidth: img.width,
                stageHeight: img.height,
                shapes: api.getShapes(),
                settings,
                legendRange: api.getLegendRange(),
                legendLevels: api.getLegendLevels(),
                filenameBase: `${(projectInfo.projectNumber || "project").trim()} - FLS ${(projectInfo.projectName || "untitled").trim()}`.replace(/[\\/:*?"<>|]+/g, "_"),
            });
        } catch (err) {
            console.error(err);
            window.alert("Failed to export PDF.");
        }
    }

    function handlePdfExportConfirm(orientation: PdfOrientation) {
        setPdfOrientation(orientation);
        setPdfDialogOpen(false);
        handleExportPDF(orientation);
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
                    onClick={() => setPdfDialogOpen(true)}
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
                        backgroundImage={backgroundImage}
                        backgroundAdjustMode={bgAdjustMode}
                        onBackgroundChange={handleBackgroundPatch}
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
                                <FloatInput
                                    text="Contour spacing"
                                    value={contourSpacing}
                                    onChange={setContourSpacing}
                                />
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

                    {/* ── Tracing background (hand-drawn survey PDF / photo) ───── */}
                    <div className="fls-bottom-group fls-trace-group">
                        <div className="fls-bottom-group-title">Trace Background</div>
                        <div className="fls-bottom-group-content fls-trace-row">
                            {!backgroundImage ? (
                                <button
                                    type="button"
                                    className="fls-trace-import-btn"
                                    onClick={handleImportBackgroundClick}
                                    disabled={bgImporting}
                                    title="Import a PDF or image of your hand-drawn survey to trace over">
                                    {bgImporting ? "Loading…" : "Import PDF / Image"}
                                </button>
                            ) : (
                                <>
                                    <label
                                        className="fls-view-toggle"
                                        title={backgroundImage.visible ? "Hide tracing image" : "Show tracing image"}>
                                        <input
                                            type="checkbox"
                                            className="fls-switch-input"
                                            checked={backgroundImage.visible}
                                            onChange={e => handleBackgroundPatch({ visible: e.target.checked })}
                                        />
                                        <span className="fls-switch-track" aria-hidden="true" />
                                        <span className="fls-view-toggle-label">Show</span>
                                    </label>

                                    <label className="fls-trace-opacity-field" title="Background opacity">
                                        <span className="fls-trace-opacity-label">α</span>
                                        <input
                                            type="range"
                                            min="0.05"
                                            max="1"
                                            step="0.05"
                                            className="fls-trace-slider"
                                            value={backgroundImage.opacity}
                                            onChange={e => handleBackgroundPatch({ opacity: parseFloat(e.target.value) })}
                                        />
                                        <span className="fls-trace-opacity-val">
                                            {backgroundImage.opacity.toFixed(2)}
                                        </span>
                                    </label>

                                    <button
                                        type="button"
                                        className={`fls-trace-mode-btn${bgAdjustMode ? " is-active" : ""}`}
                                        onClick={() => {
                                            if (!bgAdjustMode) setTool("select");
                                            setBgAdjustMode(v => !v);
                                        }}
                                        title={bgAdjustMode
                                            ? "Lock background (exit adjust mode)"
                                            : "Adjust background (drag / resize / rotate)"}>
                                        {bgAdjustMode ? "Done" : "Adjust"}
                                    </button>

                                    <button
                                        type="button"
                                        className="fls-trace-replace-btn"
                                        onClick={handleImportBackgroundClick}
                                        disabled={bgImporting}
                                        title="Replace with another file">
                                        Replace
                                    </button>

                                    <button
                                        type="button"
                                        className="fls-trace-remove-btn"
                                        onClick={handleRemoveBackground}
                                        title="Remove background image">
                                        ×
                                    </button>
                                </>
                            )}
                            <input
                                ref={bgFileInputRef}
                                type="file"
                                accept="application/pdf,image/*,.pdf"
                                onChange={handleImportBackgroundFile}
                                style={{ display: "none" }}
                            />
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

            <PdfExportModal
                open={pdfDialogOpen}
                orientation={pdfOrientation}
                onChangeOrientation={setPdfOrientation}
                onClose={() => setPdfDialogOpen(false)}
                onExport={handlePdfExportConfirm}
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
