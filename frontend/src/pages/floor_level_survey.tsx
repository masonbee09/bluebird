import { useEffect, useMemo, useRef, useState } from "react";
import FloorLevelSurvey, { type FLSApi } from "../components/floor_level_survey/floorlevelsurvey";
import { FloatInput } from "../components";
import {
    SelectIcon,
    WallIcon,
    PointIcon,
    SolveIcon,
} from "../components/floor_level_survey/tool_icons";
import { interpolateContourColor } from "../components/floor_level_survey/contour_colors";
import type { Tool } from "../components/floor_level_survey/shape_types";
import "./div_types.css";
import "./floor_level_survey.css";


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
    useEffect(() => {
        try { localStorage.setItem("fls.contourStartColor", contourStartColor); } catch { /* ignore */ }
    }, [contourStartColor]);
    useEffect(() => {
        try { localStorage.setItem("fls.contourEndColor", contourEndColor); } catch { /* ignore */ }
    }, [contourEndColor]);
    useEffect(() => {
        try { localStorage.setItem("fls.contourFill", contourFill ? "1" : "0"); } catch { /* ignore */ }
    }, [contourFill]);

    const giveContourSpacing = () => contourSpacing ?? 0.1;
    const givePointHeight = () => pointHeight ?? 0.0;

    const flsApiRef = useRef<FLSApi | null>(null);

    function triggerSolve() {
        setSolveTrigger(prev => prev + 1);
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
                    title="Run"
                    aria-label="Run contours">
                    <SolveIcon />
                    <span className="fls-toolstrip-label">Run</span>
                </button>

                <div className="fls-toolstrip-spacer" />

                <button
                    type="button"
                    className={`fls-toolstrip-btn fls-toolstrip-help${guideOpen ? " is-active" : ""}`}
                    onClick={() => setGuideOpen(!guideOpen)}
                    title="Help"
                    aria-label="Help"
                    aria-pressed={guideOpen}>
                    <span className="fls-toolstrip-help-glyph">?</span>
                    <span className="fls-toolstrip-label">Help</span>
                </button>
            </aside>

            <div className="fls-workspace">
                <main className="fls-canvas-host">
                    <FloorLevelSurvey
                        apiRef={flsApiRef}
                        tool={tool}
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
                                <FloatInput text="Contour spacing" value={contourSpacing} onChange={setContourSpacing} />
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
        </div>
    );
}


export default FloorLevelSurveyPage;
