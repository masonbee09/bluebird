import { Layer, Shape } from "react-konva";
import { interpolateContourColor } from "./contour_colors";


export type ContourPoint = { x: number; y: number } | [number, number];
export type ContourPolyline = ContourPoint[];


export interface ContourData {
    status?: string;
    /** User-requested contour levels (used for legend min/max). */
    heights: number[];
    /** One polygon per entry in `polygon_heights` (supports holes via rings). */
    polygons?: Array<ContourPolyline | { rings: ContourPolyline[] }>;
    /** Parallel array to `polygons` giving the height each polygon is drawn for. */
    polygon_heights?: number[];
    /** Clipped contour lines; parallel to `line_heights`. */
    lines: ContourPolyline[];
    /** Height for each entry in `lines`. */
    line_heights?: number[];
}


interface ContourLayerProps {
    data: ContourData | null;
    startColor: string;
    endColor: string;
    lineWidth?: number;
    minZ?: number | null;
    maxZ?: number | null;
    fillOpacity?: number;
    lineOpacity?: number;
    lineTension?: number;
    showFill?: boolean;
}


function extractXY(pt: ContourPoint): [number, number] | null {
    if (!pt) return null;
    if (Array.isArray(pt)) {
        if (pt.length < 2) return null;
        return [pt[0], pt[1]];
    }
    if (typeof pt === "object" && "x" in pt && "y" in pt) {
        return [pt.x, pt.y];
    }
    return null;
}


function ringToFlat(ring: ContourPoint[]): number[] {
    const out: number[] = [];
    for (const raw of ring) {
        const xy = extractXY(raw);
        if (xy) out.push(xy[0], xy[1]);
    }
    return out;
}


function ContourLayer({
    data,
    startColor,
    endColor,
    lineWidth = 1.2,
    minZ = null,
    maxZ = null,
    fillOpacity = 1,
    lineOpacity = 0.95,
    lineTension = 0,
    showFill = true,
}: ContourLayerProps) {
    if (!data) return null;
    const heights = data.heights ?? [];
    if (heights.length === 0) return null;

    const polygons = data.polygons ?? [];
    const polygonHeights = data.polygon_heights ?? [];
    const lines = data.lines ?? [];
    const lineHeights = data.line_heights ?? [];

    const zLo = minZ ?? Math.min(...heights);
    const zHi = maxZ ?? Math.max(...heights);
    const zSpan = Math.max(1e-9, zHi - zLo);

    const colorAtHeight = (h: number) => {
        const t = (h - zLo) / zSpan;
        return interpolateContourColor(startColor, endColor, Math.max(0, Math.min(1, t)));
    };

    // Render polygons in height-ascending order so that higher contours overlay
    // lower ones, building up a smooth elevation gradient similar to a
    // topographic map. Each polygon was already closed and clipped to the wall
    // polygon on the backend, so we can fill it directly.
    const polygonOrder = polygons
        .map((_, i) => i)
        .sort((a, b) => (polygonHeights[a] ?? 0) - (polygonHeights[b] ?? 0));

    return (
        <Layer listening={false} opacity={1}>
            {showFill && polygonOrder.map((idx) => {
                const poly = polygons[idx];
                const h = polygonHeights[idx];
                if (!poly || h === undefined) return null;
                const color = colorAtHeight(h);
                const rings = Array.isArray(poly) ? [poly] : (poly.rings ?? []);
                return (
                    <Shape
                        key={`poly-${idx}`}
                        listening={false}
                        perfectDrawEnabled={false}
                        opacity={fillOpacity}
                        sceneFunc={(ctx) => {
                            const native = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
                            native.beginPath();
                            for (const ring of rings) {
                                const flat = ringToFlat(ring);
                                if (flat.length < 6) continue;
                                native.moveTo(flat[0], flat[1]);
                                for (let i = 2; i < flat.length; i += 2) {
                                    native.lineTo(flat[i], flat[i + 1]);
                                }
                                native.closePath();
                            }
                            native.fillStyle = color;
                            native.fill("evenodd");
                        }}
                        fill={color}
                    />
                );
            })}

            {/* Draw all contour lines in one canvas pass for performance. */}
            <Shape
                listening={false}
                perfectDrawEnabled={false}
                sceneFunc={(ctx) => {
                    const native = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
                    native.save();
                    native.globalAlpha = lineOpacity;
                    native.lineWidth = lineWidth;
                    native.lineCap = "round";
                    native.lineJoin = "round";
                    for (let li = 0; li < lines.length; li++) {
                        const line = lines[li];
                        if (!line || line.length < 2) continue;
                        const pts = ringToFlat(line);
                        if (pts.length < 4) continue;
                        const h = lineHeights[li];
                        const color = showFill && h !== undefined ? colorAtHeight(h) : "#111111";
                        native.beginPath();
                        native.moveTo(pts[0], pts[1]);
                        if (lineTension > 0) {
                            for (let i = 2; i < pts.length; i += 2) native.lineTo(pts[i], pts[i + 1]);
                        } else {
                            for (let i = 2; i < pts.length; i += 2) native.lineTo(pts[i], pts[i + 1]);
                        }
                        native.strokeStyle = color;
                        native.stroke();
                    }
                    native.restore();
                }}
            />
        </Layer>
    );
}


export default ContourLayer;
