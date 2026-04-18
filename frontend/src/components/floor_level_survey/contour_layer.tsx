import { useMemo } from "react";
import { Layer, Line, Image as KonvaImage } from "react-konva";
import { interpolateContourColor } from "./contour_colors";


export type ContourPoint = { x: number; y: number } | [number, number];
export type ContourPolyline = ContourPoint[];
export type ContourLinesAtHeight = ContourPolyline[];


export interface ContourData {
    status?: string;
    heights: number[];
    lines: ContourLinesAtHeight[];
    // Raw interpolated grid returned by the backend. Values in Zi may be null
    // where the surface is undefined (NaN serialised as null, e.g. outside
    // the wall polygon).
    Xi?: number[][];
    Yi?: number[][];
    Zi?: (number | null)[][];
}


interface ContourLayerProps {
    data: ContourData | null;
    startColor: string;
    endColor: string;
    lineWidth?: number;
    minZ?: number | null;
    maxZ?: number | null;
    lineOpacity?: number;
    lineTension?: number;
    fillOpacity?: number;
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


function hexToRgb(hex: string): [number, number, number] {
    let c = hex.trim();
    if (c.startsWith("#")) c = c.slice(1);
    if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
    if (c.length !== 6) return [0, 0, 0];
    return [
        parseInt(c.slice(0, 2), 16),
        parseInt(c.slice(2, 4), 16),
        parseInt(c.slice(4, 6), 16),
    ];
}


// Number of entries in the color lookup table used to colour the Zi raster.
// 512 is plenty smooth and cheap to build.
const LUT_SIZE = 512;


function buildColorLut(startColor: string, endColor: string): Uint8ClampedArray {
    const lut = new Uint8ClampedArray(LUT_SIZE * 3);
    for (let i = 0; i < LUT_SIZE; i++) {
        const t = i / (LUT_SIZE - 1);
        const hex = interpolateContourColor(startColor, endColor, t);
        const [r, g, b] = hexToRgb(hex);
        lut[i * 3] = r;
        lut[i * 3 + 1] = g;
        lut[i * 3 + 2] = b;
    }
    return lut;
}


interface FillRaster {
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    width: number;
    height: number;
}


function buildFillRaster(
    Xi: number[][],
    Yi: number[][],
    Zi: (number | null)[][],
    zLo: number,
    zSpan: number,
    lut: Uint8ClampedArray,
): FillRaster | null {
    const rows = Zi.length;
    if (rows === 0) return null;
    const cols = Zi[0]?.length ?? 0;
    if (cols === 0) return null;
    if (Xi.length !== rows || Yi.length !== rows) return null;

    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const img = ctx.createImageData(cols, rows);
    const data = img.data;

    for (let r = 0; r < rows; r++) {
        const rowZ = Zi[r];
        for (let c = 0; c < cols; c++) {
            const z = rowZ[c];
            const idx = (r * cols + c) * 4;
            if (z === null || z === undefined || !isFinite(z as number)) {
                data[idx + 3] = 0;
                continue;
            }
            let t = (z - zLo) / zSpan;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            const li = Math.round(t * (LUT_SIZE - 1)) * 3;
            data[idx] = lut[li];
            data[idx + 1] = lut[li + 1];
            data[idx + 2] = lut[li + 2];
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    // Xi[r][c] = xi[c], Yi[r][c] = yi[r]; linspace spans [xMin,xMax] / [yMin,yMax].
    const xMin = Xi[0][0];
    const xMax = Xi[0][cols - 1];
    const yMin = Yi[0][0];
    const yMax = Yi[rows - 1][0];

    return {
        canvas,
        x: xMin,
        y: yMin,
        width: xMax - xMin,
        height: yMax - yMin,
    };
}


function ContourLayer({
    data,
    startColor,
    endColor,
    lineWidth = 1.2,
    minZ = null,
    maxZ = null,
    lineOpacity = 0.95,
    lineTension = 0.5,
    fillOpacity = 0.75,
    showFill = true,
}: ContourLayerProps) {
    const heights = data?.heights ?? [];
    const zLo = minZ ?? (heights.length ? Math.min(...heights) : 0);
    const zHi = maxZ ?? (heights.length ? Math.max(...heights) : 1);
    const zSpan = Math.max(1e-9, zHi - zLo);

    const colorLut = useMemo(
        () => buildColorLut(startColor, endColor),
        [startColor, endColor],
    );

    const fillRaster = useMemo<FillRaster | null>(() => {
        if (!showFill) return null;
        if (!data || !data.Xi || !data.Yi || !data.Zi) return null;
        return buildFillRaster(data.Xi, data.Yi, data.Zi, zLo, zSpan, colorLut);
    }, [data, showFill, zLo, zSpan, colorLut]);

    if (!data) return null;
    if (heights.length === 0) return null;

    const colorAtHeight = (h: number) => {
        const t = (h - zLo) / zSpan;
        return interpolateContourColor(startColor, endColor, Math.max(0, Math.min(1, t)));
    };

    return (
        <Layer listening={false} opacity={1}>
            {/* Fill: Zi raster, only where Zi is defined (inside the wall). */}
            {fillRaster && (
                <KonvaImage
                    image={fillRaster.canvas}
                    x={fillRaster.x}
                    y={fillRaster.y}
                    width={fillRaster.width}
                    height={fillRaster.height}
                    opacity={fillOpacity}
                    listening={false}
                    perfectDrawEnabled={false}
                />
            )}

            {/* Contour outlines: smooth via Konva tension. */}
            {data.lines.map((linesAtH, hi) => {
                const h = heights[hi];
                if (h === undefined) return null;
                const color = showFill ? colorAtHeight(h) : "#111111";
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
