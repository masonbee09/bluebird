import { useEffect, useState } from "react";
import FloorLevelSurvey from "../components/floor_level_survey/floorlevelsurvey";
import { FloatInput } from "../components";
import { SelectIcon, WallIcon, PointIcon, SolveIcon } from "../components/floor_level_survey/tool_icons";
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
    const [showContours, setShowContours] = useState<boolean>(true);
    const [contourStartColor, setContourStartColor] = useState<string>("#2563eb");
    const [contourEndColor, setContourEndColor] = useState<string>("#dc2626");
    const [guideOpen, setGuideOpen] = useState<boolean>(() => {
        try { return localStorage.getItem("fls.shortcutGuide.open") === "1"; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem("fls.shortcutGuide.open", guideOpen ? "1" : "0"); } catch { /* ignore */ }
    }, [guideOpen]);

    const giveContourSpacing = () => contourSpacing ?? 0.1;
    const givePointHeight = () => pointHeight ?? 0.0;

    function triggerSolve() {
        setSolveTrigger(prev => prev + 1);
    }

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
                </button>
            </aside>

            <div className="fls-workspace">
                <main className="fls-canvas-host">
                    <FloorLevelSurvey
                        tool={tool}
                        setTool={setTool}
                        getContourSpacing={giveContourSpacing}
                        getPointHeight={givePointHeight}
                        solveTrigger={solveTrigger}
                        showMajorGrid={showMajorGrid}
                        setShowMajorGrid={setShowMajorGrid}
                        showMinimap={showMinimap}
                        setShowMinimap={setShowMinimap}
                        showContours={showContours}
                        setShowContours={setShowContours}
                        contourStartColor={contourStartColor}
                        contourEndColor={contourEndColor}
                        guideOpen={guideOpen}
                        setGuideOpen={setGuideOpen}
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
                                <FloatInput text="Contour spacing" onChange={setContourSpacing} />
                            </div>
                        </div>
                    </div>

                    <div className="fls-bottom-divider" />

                    <div className="fls-bottom-group">
                        <div className="fls-bottom-group-title">Contour colors</div>
                        <div className="fls-bottom-group-content">
                            <label className="fls-color-field" title="Color assigned to the lowest contour height">
                                <span className="fls-color-label">Low</span>
                                <input
                                    type="color"
                                    value={contourStartColor}
                                    onChange={e => setContourStartColor(e.target.value)}
                                    aria-label="Start color (low)"
                                />
                            </label>
                            <div
                                className="fls-color-gradient"
                                aria-hidden="true"
                                style={{
                                    background: `linear-gradient(to right, ${contourStartColor}, ${contourEndColor})`,
                                }}
                            />
                            <label className="fls-color-field" title="Color assigned to the highest contour height">
                                <span className="fls-color-label">High</span>
                                <input
                                    type="color"
                                    value={contourEndColor}
                                    onChange={e => setContourEndColor(e.target.value)}
                                    aria-label="End color (high)"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="fls-bottom-spacer" />

                    <div className="fls-bottom-hint">
                        Right-click a wall for options. Scroll or arrow keys
                        adjust the selected point's height by <kbd>0.1</kbd>.
                        Press <kbd>?</kbd> for shortcuts.
                    </div>
                </footer>
            </div>
        </div>
    );
}


export default FloorLevelSurveyPage;
