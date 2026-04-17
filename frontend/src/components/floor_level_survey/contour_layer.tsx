import { Layer, Line, Shape } from "react-konva";
import { interpolateContourColor } from "./contour_colors";


export type ContourPoint = { x: number; y: number } | [number, number];
export type ContourPolyline = ContourPoint[];
export type ContourLinesAtHeight = ContourPolyline[];


export interface ContourBandPolygon {
    rings: ContourPoint[][];
}

export interface ContourBand {
    lo: number;
    hi: number;
    polygons: ContourBandPolygon[];
}


export interface ContourData {
    status?: string;
    heights: number[];
    lines: ContourLinesAtHeight[];
    fills?: ContourBand[];
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
    fillOpacity = 0.45,
    lineOpacity = 0.9,
    lineTension = 0.5,
}: ContourLayerProps) {
    if (!data) return null;
    const heights = data.heights ?? [];
    if (heights.length === 0) return null;

    const zLo = minZ ?? Math.min(...heights);
    const zHi = maxZ ?? Math.max(...heights);
    const zSpan = Math.max(1e-9, zHi - zLo);

    const colorAtHeight = (h: number) => {
        const t = (h - zLo) / zSpan;
        return interpolateContourColor(startColor, endColor, Math.max(0, Math.min(1, t)));
    };

    return (
        <Layer listening={false} opacity={1}>
            {/* Filled bands: draw first so line contours sit on top. */}
            {(data.fills ?? []).map((band, bi) => {
                const mid = (band.lo + band.hi) / 2;
                const color = colorAtHeight(mid);
                return band.polygons.map((poly, pi) => {
                    if (!poly.rings || poly.rings.length === 0) return null;
                    return (
                        <Shape
                            key={`fill-${bi}-${pi}`}
                            listening={false}
                            perfectDrawEnabled={false}
                            opacity={fillOpacity}
                            sceneFunc={(ctx) => {
                                const native = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
                                native.beginPath();
                                for (const ring of poly.rings) {
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
                });
            })}

            {/* Contour outlines: smooth via Konva tension. */}
            {data.lines.map((linesAtH, hi) => {
                const h = heights[hi];
                if (h === undefined) return null;
                const color = colorAtHeight(h);
                if (!linesAtH) return null;
                return linesAtH.map((line, li) => {
                    if (!line || line.length < 2) return null;
                    const pts: number[] = ringToFlat(line);
                    if (pts.length < 4) return null;
                    const isClosed =
                        pts.length >= 6 &&
                        Math.abs(pts[0] - pts[pts.length - 2]) < 1e-6 &&
                        Math.abs(pts[1] - pts[pts.length - 1]) < 1e-6;
                    return (
                        <Line
                            key={`c-${hi}-${li}`}
                            points={pts}
                            stroke={color}
                            strokeWidth={lineWidth}
                            opacity={lineOpacity}
                            tension={lineTension}
                            closed={isClosed}
                            lineCap="round"
                            lineJoin="round"
                            perfectDrawEnabled={false}
                            shadowForStrokeEnabled={false}
                            hitStrokeWidth={0}
                        />
                    );
                });
            })}
        </Layer>
    );
}


export default ContourLayer;
