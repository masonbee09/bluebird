import { useEffect, useRef, useState } from "react";
import type { Shape } from "./shape_types";
import "./minimap.css";


interface MinimapProps {
    shapes: Shape[];
    viewport: {
        width: number;
        height: number;
        scale: number;
        offsetX: number;
        offsetY: number;
    };
    onPanTo: (worldX: number, worldY: number) => void;
    version: number;
}


const MINIMAP_MAX_W = 200;
const MINIMAP_MAX_H = 150;


function Minimap({ shapes, viewport, onPanTo, version }: MinimapProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [dragging, setDragging] = useState(false);

    // Reference workspace window = stage area at scale 1, anchored at world origin.
    // This makes the minimap's blue viewport rect fill the whole minimap at 100% zoom
    // when the stage is at its default (unpanned) position.
    const workspaceW = Math.max(1, viewport.width);
    const workspaceH = Math.max(1, viewport.height);

    // Fit the reference window into the minimap container preserving aspect ratio.
    const containerAspect = MINIMAP_MAX_W / MINIMAP_MAX_H;
    const workspaceAspect = workspaceW / workspaceH;
    let miniW: number;
    let miniH: number;
    if (workspaceAspect >= containerAspect) {
        miniW = MINIMAP_MAX_W;
        miniH = Math.round(MINIMAP_MAX_W / workspaceAspect);
    } else {
        miniH = MINIMAP_MAX_H;
        miniW = Math.round(MINIMAP_MAX_H * workspaceAspect);
    }
    const fit = miniW / workspaceW;

    const worldToMini = (wx: number, wy: number) => ({
        x: wx * fit,
        y: wy * fit,
    });

    const miniToWorld = (mx: number, my: number) => ({
        x: mx / fit,
        y: my / fit,
    });

    // Current viewport in world coords.
    const s = viewport.scale || 1;
    const vpWorldLeft = -viewport.offsetX / s;
    const vpWorldTop = -viewport.offsetY / s;
    const vpWorldW = viewport.width / s;
    const vpWorldH = viewport.height / s;

    // Project to minimap and clamp into the visible minimap rectangle.
    const rawLeft = vpWorldLeft * fit;
    const rawTop = vpWorldTop * fit;
    const rawRight = (vpWorldLeft + vpWorldW) * fit;
    const rawBottom = (vpWorldTop + vpWorldH) * fit;
    const rectX = Math.max(0, Math.min(miniW, rawLeft));
    const rectY = Math.max(0, Math.min(miniH, rawTop));
    const rectX2 = Math.max(0, Math.min(miniW, rawRight));
    const rectY2 = Math.max(0, Math.min(miniH, rawBottom));
    const rectW = Math.max(2, rectX2 - rectX);
    const rectH = Math.max(2, rectY2 - rectY);

    const atOneHundred = Math.abs(s - 1) < 0.001;

    const onPointer = (clientX: number, clientY: number) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const w = miniToWorld(mx, my);
        onPanTo(w.x, w.y);
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => onPointer(e.clientX, e.clientY);
        const onUp = () => setDragging(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragging]);

    void version;

    return (
        <div className="fls-minimap" title="Overview map — click or drag to pan">
            <div className="fls-minimap-header">
                <span>Overview</span>
                <span className="fls-minimap-zoom">{Math.round(s * 100)}%</span>
            </div>
            <svg
                ref={svgRef}
                className="fls-minimap-canvas"
                width={miniW}
                height={miniH}
                viewBox={`0 0 ${miniW} ${miniH}`}
                onMouseDown={e => {
                    e.preventDefault();
                    setDragging(true);
                    onPointer(e.clientX, e.clientY);
                }}>
                <rect x={0} y={0} width={miniW} height={miniH} className="fls-minimap-bg" />
                {shapes.map((sh, i) => {
                    if (sh.type === "wall" && !sh.temporary) {
                        const a = worldToMini(sh.points[0], sh.points[1]);
                        const b = worldToMini(sh.points[2], sh.points[3]);
                        return (
                            <line
                                key={`w${i}`}
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                className="fls-minimap-wall"
                            />
                        );
                    }
                    if (sh.type === "point") {
                        const p = worldToMini(sh.x, sh.y);
                        return (
                            <circle
                                key={`p${i}`}
                                cx={p.x}
                                cy={p.y}
                                r={1.4}
                                className={sh.selected ? "fls-minimap-point selected" : "fls-minimap-point"}
                            />
                        );
                    }
                    return null;
                })}
                <rect
                    x={rectX}
                    y={rectY}
                    width={rectW}
                    height={rectH}
                    className={`fls-minimap-viewport${atOneHundred ? " is-full" : ""}`}
                />
            </svg>
        </div>
    );
}


export default Minimap;
