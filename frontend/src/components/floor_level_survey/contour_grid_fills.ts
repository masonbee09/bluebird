import type { Shape } from "./shape_types";

/** One elevation band: flattened quads, each quad is 8 numbers [x1,y1,…,x4,y4]. */
export interface GridBandFill {
    lo: number;
    hi: number;
    /** Concatenated quads (4 corners × 2 coords). Winding: (i,j)-(i,j+1)-(i+1,j+1)-(i+1,j). */
    flatQuads: number[];
}

function isFiniteNum(v: number | null | undefined): v is number {
    return v != null && typeof v === "number" && Number.isFinite(v);
}

export function pointInPolygon(x: number, y: number, ring: { x: number; y: number }[]): boolean {
    if (ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x;
        const yi = ring[i].y;
        const xj = ring[j].x;
        const yj = ring[j].y;
        const intersect =
            (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** True if every corner lies inside the same closed ring (no painting outside walls). */
function quadFullyInsideAnyWall(
    corners: { x: number; y: number }[],
    wallRings: { x: number; y: number }[][],
): boolean {
    if (wallRings.length === 0) return false;
    return wallRings.some(ring =>
        corners.every(c => pointInPolygon(c.x, c.y, ring)),
    );
}

/** Extract closed rings from completed wall shapes (polygon vertices in order). */
export function wallRingsFromShapes(shapes: Shape[]): { x: number; y: number }[][] {
    const rings: { x: number; y: number }[][] = [];
    for (const s of shapes) {
        if (s.type !== "wall" || s.temporary) continue;
        const pts = s.points;
        if (pts.length < 6) continue;
        const ring: { x: number; y: number }[] = [];
        for (let i = 0; i < pts.length; i += 2) {
            ring.push({ x: pts[i], y: pts[i + 1] });
        }
        if (ring.length >= 3) rings.push(ring);
    }
    return rings;
}

function bandIndexForZ(z: number, heights: number[]): number {
    const h = heights;
    if (h.length < 2) return -1;
    if (z <= h[0]) return 0;
    const last = h[h.length - 1];
    if (z >= last) return h.length - 2;
    for (let k = 0; k < h.length - 1; k++) {
        if (z >= h[k] && z < h[k + 1]) return k;
    }
    return h.length - 2;
}

/**
 * Builds filled quads between contour levels from the interpolated grid (Xi, Yi, Zi).
 * Only includes a quad if all four corners lie inside the same wall ring (no bleed outside walls).
 * Returns no fills when there are no completed walls.
 */
export function buildGridBandFills(params: {
    Xi: number[][];
    Yi: number[][];
    Zi: (number | null)[][];
    heights: number[];
    wallRings: { x: number; y: number }[][];
}): GridBandFill[] {
    const { Xi, Yi, Zi, heights, wallRings } = params;
    const sortedH = [...heights].sort((a, b) => a - b);
    if (sortedH.length < 2) return [];

    const n = Xi.length;
    const m = Xi[0]?.length ?? 0;
    if (n < 2 || m < 2) return [];

    const numBands = sortedH.length - 1;
    const buckets: number[][] = Array.from({ length: numBands }, () => []);

    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < m - 1; j++) {
            const z00 = Zi[i]?.[j];
            const z01 = Zi[i]?.[j + 1];
            const z10 = Zi[i + 1]?.[j];
            const z11 = Zi[i + 1]?.[j + 1];
            if (!isFiniteNum(z00) || !isFiniteNum(z01) || !isFiniteNum(z10) || !isFiniteNum(z11)) continue;

            const x00 = Xi[i][j];
            const y00 = Yi[i][j];
            const x01 = Xi[i][j + 1];
            const y01 = Yi[i][j + 1];
            const x11 = Xi[i + 1][j + 1];
            const y11 = Yi[i + 1][j + 1];
            const x10 = Xi[i + 1][j];
            const y10 = Yi[i + 1][j];

            const corners = [
                { x: x00, y: y00 },
                { x: x01, y: y01 },
                { x: x11, y: y11 },
                { x: x10, y: y10 },
            ];
            if (!quadFullyInsideAnyWall(corners, wallRings)) continue;

            const zc = (z00 + z01 + z10 + z11) / 4;
            const bi = bandIndexForZ(zc, sortedH);
            if (bi < 0) continue;

            const flat = buckets[bi];
            flat.push(x00, y00, x01, y01, x11, y11, x10, y10);
        }
    }

    const out: GridBandFill[] = [];
    for (let b = 0; b < numBands; b++) {
        const flatQuads = buckets[b];
        if (flatQuads.length === 0) continue;
        out.push({
            lo: sortedH[b],
            hi: sortedH[b + 1],
            flatQuads,
        });
    }
    return out;
}
