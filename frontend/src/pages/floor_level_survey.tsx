import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FloorLevelSurvey, { type FLSApi } from "../components/floor_level_survey/floorlevelsurvey";
import { FloatInput } from "../components";
import {
    SelectIcon,
    WallIcon,
    PointIcon,
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
} from "../components/floor_level_survey/project_io";
import ProjectInfoModal, {
    emptyProjectInfo,
    type FLSProjectInfo,
} from "../components/floor_level_survey/project_info_modal";
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
];


function FloorLevelSurveyPage() {
    const [tool, setTool] = useState<Tool>("select");
    const [contourSpacing, setContourSpacing] = useState<number | null>(0.1);
    const [pointHeight, setPointHeight] = useState<number | null>(0.0);
    const [solveTrigger, setSolveTrigger] = useState<number>(0);
    const [showMajorGrid, setShowMajorGrid] = useState<boolean>(true);
    const [showMinimap, setShowMinimap] = useState<boolean>(true);
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
    const [projectInfo, setProjectInfo] = useState<FLSProjectInfo>(() => loadStoredProjectInfo());
    const [projectInfoOpen, setProjectInfoOpen] = useState<boolean>(false);
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
        try { localStorage.setItem(PROJECT_INFO_STORAGE_KEY, JSON.stringify(projectInfo)); } catch { /* ignore */ }
    }, [projectInfo]);

    const giveContourSpacing = () => contourSpacing ?? 0.1;
    const givePointHeight = () => pointHeight ?? 0.0;

    const flsApiRef = useRef<FLSApi | null>(null);
    const openInputRef = useRef<HTMLInputElement | null>(null);

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
            const dataUrl = api.getStageDataURL(2);
            if (!dataUrl) {
                window.alert("Canvas is not ready for export yet.");
                return;
            }
            const { width, height } = api.getStageSize();
            exportCanvasAsPDF({
                dataUrl,
                stageWidth: width,
                stageHeight: height,
                shapes: api.getShapes(),
                settings: currentSettings(),
                legendRange: api.getLegendRange(),
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
        </div>
    );
}


export default FloorLevelSurveyPage;
