import { PointTool, LineTool, TextTool } from "../canvas2d/drawing_tools";
import type { ShapeData } from "../canvas2d/drawing_tools";
import {
    wallStyle,
    pointStyle,
    selectedWallStyle,
    selectedPointStyle,
    heightLabelStyle,
    selectedHeightLabelStyle,
} from "./style_presets";
import MathHelper from "../../utils/math_helper";
import Communicator from "./communicator";
import type { Shape, PointShape, LabelShape, MaterialBoundaryShape } from "./shape_types";


const HISTORY_LIMIT = 100;
const COALESCE_MS = 400;


/** Ray-casting point-in-polygon. pts is flat [x0,y0, x1,y1, ...]. */
function pointInPolygon(px: number, py: number, pts: number[]): boolean {
    const n = pts.length / 2;
    if (n < 3) return false;
    let inside = false;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
        const xi = pts[i * 2], yi = pts[i * 2 + 1];
        const xj = pts[j * 2], yj = pts[j * 2 + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}


class FLSController {
    shapes: Shape[];
    OnUpdate: () => void;
    selectedIndex: number = -1;
    getContourSpacing: () => number;
    communicator: Communicator;
    version: number = 0;

    private history: string[] = [];
    private future: string[] = [];
    private lastNudgeAt: number = 0;
    private lastHeightAdjustAt: number = 0;

    constructor(OnUpdate: () => void, getContourSpacing: () => number) {
        this.shapes = [];
        this.OnUpdate = OnUpdate;
        this.getContourSpacing = getContourSpacing;
        this.communicator = new Communicator(this);
    }

    private notify() {
        this.version++;
        this.OnUpdate();
    }

    private isTemporary(s: Shape): boolean {
        return (s.type === "wall" || s.type === "boundary") && s.temporary === true;
    }

    private snapshot() {
        const nonTemp = this.shapes.filter(s => !this.isTemporary(s));
        this.history.push(JSON.stringify(nonTemp));
        if (this.history.length > HISTORY_LIMIT) {
            this.history.shift();
        }
        this.future = [];
    }

    canUndo(): boolean {
        return this.history.length > 0;
    }

    canRedo(): boolean {
        return this.future.length > 0;
    }

    undo() {
        if (this.history.length === 0) return;
        const current = JSON.stringify(this.shapes.filter(s => !this.isTemporary(s)));
        const prev = this.history.pop()!;
        this.future.push(current);
        this.shapes = JSON.parse(prev) as Shape[];
        this.selectedIndex = -1;
        this.notify();
    }

    redo() {
        if (this.future.length === 0) return;
        const current = JSON.stringify(this.shapes.filter(s => !this.isTemporary(s)));
        const next = this.future.pop()!;
        this.history.push(current);
        this.shapes = JSON.parse(next) as Shape[];
        this.selectedIndex = -1;
        this.notify();
    }

    addShape(shape: Shape) {
        if (!this.isTemporary(shape)) {
            this.snapshot();
        }
        this.shapes.push(shape);
        this.notify();
    }

    /** Replace the current scene with the supplied shapes. Clears selection and history. */
    loadShapes(shapes: Shape[]) {
        this.shapes = shapes
            .filter(s => !this.isTemporary(s))
            .map(s => {
                const copy: Shape = { ...s, selected: false };
                if (copy.type === "wall") copy.temporary = false;
                return copy;
            });
        this.selectedIndex = -1;
        this.history = [];
        this.future = [];
        this.notify();
    }

    addShapes(shapes: Shape[]) {
        const anyPersistent = shapes.some(s => !this.isTemporary(s));
        if (anyPersistent) {
            this.snapshot();
        }
        this.shapes.push(...shapes);
        this.notify();
    }

    removeShape(index: number) {
        this.snapshot();
        this.shapes.splice(index, 1);
        this.notify();
    }

    removeTemporaryShapes() {
        this.shapes = this.shapes.filter(s => !this.isTemporary(s));
    }

    removeSelectedShapes() {
        const tieidsToDrop = new Set<string>();
        for (const s of this.shapes) {
            if (s.selected && (s.type === "point" || s.type === "label")) {
                tieidsToDrop.add(s.tieid);
            }
        }
        this.snapshot();
        this.shapes = this.shapes.filter(s => {
            if (s.selected) return false;
            if ((s.type === "point" || s.type === "label") && tieidsToDrop.has(s.tieid)) {
                return false;
            }
            return true;
        });
        this.selectedIndex = -1;
        this.notify();
    }

    clearSelection() {
        let changed = false;
        for (const shape of this.shapes) {
            if (!shape.selected) continue;
            changed = true;
            switch (shape.type) {
                case "wall":
                    shape.stroke = wallStyle.stroke;
                    shape.strokeWidth = wallStyle.strokeWidth;
                    break;
                case "point":
                    shape.fill = pointStyle.fill;
                    shape.radius = pointStyle.radius;
                    break;
                case "label":
                    shape.fill = heightLabelStyle.fill!;
                    shape.stroke = heightLabelStyle.stroke!;
                    shape.strokeWidth = heightLabelStyle.strokeWidth!;
                    shape.draggable = heightLabelStyle.draggable!;
                    shape.fontSize = heightLabelStyle.fontsize!;
                    shape.fontFamily = heightLabelStyle.fontFamily!;
                    break;
                case "boundary":
                    // No special deselection styling for boundaries
                    break;
            }
            shape.selected = false;
        }
        this.selectedIndex = -1;
        if (changed) this.notify();
    }

    nudgeSelected(dx: number, dy: number) {
        const now = Date.now();
        if (now - this.lastNudgeAt > COALESCE_MS) {
            this.snapshot();
        }
        this.lastNudgeAt = now;

        const tieids = new Set<string>();
        for (const shape of this.shapes) {
            if (shape.selected && shape.type === "point") {
                shape.x += dx;
                shape.y += dy;
                tieids.add(shape.tieid);
            }
        }
        for (const shape of this.shapes) {
            if (shape.type === "label" && tieids.has(shape.tieid)) {
                shape.x += dx;
                shape.y += dy;
            }
        }
        this.notify();
    }

    bumpSelectedHeight(direction: 1 | -1, step: number = 0.1) {
        const now = Date.now();
        if (now - this.lastHeightAdjustAt > COALESCE_MS) {
            this.snapshot();
        }
        this.lastHeightAdjustAt = now;

        const delta = direction * step;
        const tieids = new Map<string, number>();
        for (const shape of this.shapes) {
            if (shape.selected && shape.type === "point") {
                const next = Math.round((shape.z + delta) * 1000) / 1000;
                shape.z = next;
                tieids.set(shape.tieid, next);
            }
        }
        for (const shape of this.shapes) {
            if (shape.type === "label" && tieids.has(shape.tieid)) {
                const z = tieids.get(shape.tieid)!;
                shape.z = z;
                shape.text = z.toFixed(1);
            }
        }
        this.notify();
    }

    hasSelectedPoint(): boolean {
        return this.shapes.some(s => s.selected && s.type === "point");
    }

    adjustSelectedHeights(deltaY: number, coarse: boolean) {
        const spacing = this.getContourSpacing();
        const fine = Math.min(Math.max(spacing / 10, 0.01), 1.0);
        const step = coarse ? spacing : fine;
        const direction = deltaY < 0 ? 1 : -1;
        const delta = direction * step;

        const now = Date.now();
        if (now - this.lastHeightAdjustAt > COALESCE_MS) {
            this.snapshot();
        }
        this.lastHeightAdjustAt = now;

        const tieids = new Map<string, number>();
        for (const shape of this.shapes) {
            if (shape.selected && shape.type === "point") {
                const next = Math.round((shape.z + delta) * 1000) / 1000;
                shape.z = next;
                tieids.set(shape.tieid, next);
            }
        }
        for (const shape of this.shapes) {
            if (shape.type === "label" && tieids.has(shape.tieid)) {
                const z = tieids.get(shape.tieid)!;
                shape.z = z;
                shape.text = z.toFixed(1);
            }
        }
        this.notify();
    }

    getFirstSelectedHeight(): number | null {
        for (const shape of this.shapes) {
            if (shape.selected && shape.type === "point") {
                return shape.z;
            }
        }
        return null;
    }

    hasSelection(): boolean {
        return this.shapes.some(s => s.selected);
    }

    getAdjustedPointZ(point: PointShape): number {
        return this.getAdjustedZ(point.x, point.y, point.z);
    }

    /**
     * Build the wall polygon (flat [x0,y0, x1,y1, ...]) from the committed
     * wall segments, mirroring the order used by
     * {@link Communicator.getWallPoints} so the frontend outside-wall check
     * matches what the backend will clip against.
     *
     * Returns null when there aren't enough walls to form a polygon.
     */
    buildWallPolygonFlat(): number[] | null {
        const walls = this.shapes.filter(
            (s): s is Extract<Shape, { type: "wall" }> => s.type === "wall" && !this.isTemporary(s),
        );
        if (walls.length === 0) return null;

        const sorted = [...walls].sort((a, b) => b.points.length - a.points.length);
        const out: number[] = [];
        for (const wall of sorted) {
            for (let i = 0; i + 1 < wall.points.length; i += 2) {
                out.push(wall.points[i], wall.points[i + 1]);
            }
        }
        return out.length >= 6 ? out : null;
    }

    /** Check if (x,y) is inside the current wall polygon. If no walls exist
     * yet, the scene is unconstrained and we treat everything as inside. */
    isInsideWall(x: number, y: number): boolean {
        const poly = this.buildWallPolygonFlat();
        if (!poly) return true;
        return pointInPolygon(x, y, poly);
    }

    /** Return every committed point that currently sits outside the wall polygon. */
    getPointsOutsideWall(): PointShape[] {
        const poly = this.buildWallPolygonFlat();
        if (!poly) return [];
        const outside: PointShape[] = [];
        for (const s of this.shapes) {
            if (s.type !== "point") continue;
            if (!pointInPolygon(s.x, s.y, poly)) outside.push(s);
        }
        return outside;
    }

    findWallIndexAt(x: number, y: number, tolerance: number): number {
        let best = -1;
        let bestDist = tolerance;
        const mh = new MathHelper();
        for (let i = 0; i < this.shapes.length; i++) {
            const s = this.shapes[i];
            if (s.type !== "wall") continue;
            if (this.isTemporary(s)) continue;
            const p = s.points;
            const d = mh.point_line_dist_end_constrained(x, y, p[0], p[1], p[2], p[3]);
            if (Number.isNaN(d)) continue;
            if (d <= bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    /**
     * Propagate updated material properties to every committed boundary that
     * was drawn with the given materialId. Called after the user edits a
     * material so drawn regions update in real-time.
     */
    updateBoundaryMaterial(
        materialId: string,
        name: string,
        offset: number,
        color: string,
        fillOpacity: number,
    ) {
        let changed = false;
        for (const s of this.shapes) {
            if (s.type !== "boundary" || this.isTemporary(s)) continue;
            if (s.materialId !== materialId) continue;
            s.name = name;
            s.offset = offset;
            s.color = color;
            s.fillOpacity = fillOpacity;
            changed = true;
        }
        if (changed) this.notify();
    }

    findBoundaryIndexAt(x: number, y: number, tolerance: number): number {
        const mh = new MathHelper();
        let best = -1;
        let bestDist = tolerance;
        for (let i = 0; i < this.shapes.length; i++) {
            const s = this.shapes[i];
            if (s.type !== "boundary" || this.isTemporary(s)) continue;
            const pts = s.points;
            const n = pts.length / 2;
            if (n < 2) continue;
            for (let k = 0; k < n; k++) {
                const ax = pts[k * 2];
                const ay = pts[k * 2 + 1];
                const bx = pts[((k + 1) % n) * 2];
                const by = pts[((k + 1) % n) * 2 + 1];
                const d = mh.point_line_dist_end_constrained(x, y, ax, ay, bx, by);
                if (!Number.isNaN(d) && d < bestDist) {
                    bestDist = d;
                    best = i;
                }
            }
        }
        return best;
    }

    /**
     * Return the adjusted Z for a point at (px, py) with raw measurement rawZ.
     * If the point falls inside any closed material boundary, the boundary's
     * offset is subtracted (rawZ − offset). Returns rawZ unchanged otherwise.
     * When multiple boundaries overlap, the first matching one wins.
     */
    getAdjustedZ(px: number, py: number, rawZ: number): number {
        for (const s of this.shapes) {
            if (s.type !== "boundary" || this.isTemporary(s)) continue;
            if (pointInPolygon(px, py, s.points)) {
                return rawZ - s.offset;
            }
        }
        return rawZ;
    }

    findPointIndexAt(x: number, y: number, tolerance: number): number {
        let best = -1;
        let bestDist = tolerance;
        for (let i = 0; i < this.shapes.length; i++) {
            const s = this.shapes[i];
            if (s.type !== "point") continue;
            if (this.isTemporary(s)) continue;
            const d = Math.hypot(x - s.x, y - s.y);
            if (d <= bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    selectPointByIndex(index: number) {
        if (index < 0 || index >= this.shapes.length) return;
        const target = this.shapes[index];
        if (target.type !== "point") return;

        for (const s of this.shapes) {
            if (!s.selected) continue;
            switch (s.type) {
                case "wall":
                    s.stroke = wallStyle.stroke;
                    s.strokeWidth = wallStyle.strokeWidth;
                    break;
                case "point":
                    s.fill = pointStyle.fill;
                    s.radius = pointStyle.radius;
                    break;
                case "label":
                    s.fill = heightLabelStyle.fill!;
                    s.stroke = heightLabelStyle.stroke!;
                    s.strokeWidth = heightLabelStyle.strokeWidth!;
                    s.draggable = heightLabelStyle.draggable!;
                    s.fontSize = heightLabelStyle.fontsize!;
                    s.fontFamily = heightLabelStyle.fontFamily!;
                    break;
            }
            s.selected = false;
        }

        target.selected = true;
        target.radius = selectedPointStyle.radius;
        target.fill = selectedPointStyle.fill;
        this.selectedIndex = index;

        for (const s of this.shapes) {
            if (s.type === "label" && s.tieid === target.tieid) {
                s.selected = true;
                s.fill = selectedHeightLabelStyle.fill!;
                s.stroke = selectedHeightLabelStyle.stroke!;
                s.strokeWidth = selectedHeightLabelStyle.strokeWidth!;
                s.draggable = selectedHeightLabelStyle.draggable!;
                s.fontSize = selectedHeightLabelStyle.fontsize!;
                s.fontFamily = selectedHeightLabelStyle.fontFamily!;
                break;
            }
        }
        this.notify();
    }

    selectShapeByIndex(index: number) {
        if (index < 0 || index >= this.shapes.length) return;
        const target = this.shapes[index];
        if (target.type !== "wall" && target.type !== "point") return;

        for (const s of this.shapes) {
            if (!s.selected) continue;
            switch (s.type) {
                case "wall":
                    s.stroke = wallStyle.stroke;
                    s.strokeWidth = wallStyle.strokeWidth;
                    break;
                case "point":
                    s.fill = pointStyle.fill;
                    s.radius = pointStyle.radius;
                    break;
                case "label":
                    s.fill = heightLabelStyle.fill!;
                    s.stroke = heightLabelStyle.stroke!;
                    s.strokeWidth = heightLabelStyle.strokeWidth!;
                    s.draggable = heightLabelStyle.draggable!;
                    s.fontSize = heightLabelStyle.fontsize!;
                    s.fontFamily = heightLabelStyle.fontFamily!;
                    break;
                case "boundary":
                    break;
            }
            s.selected = false;
        }

        if (target.type === "point") {
            this.selectPointByIndex(index);
            return;
        }

        target.selected = true;
        target.stroke = selectedWallStyle.stroke;
        target.strokeWidth = selectedWallStyle.strokeWidth;
        this.selectedIndex = index;
        this.notify();
    }

    snapshotForUndo() {
        this.snapshot();
    }

    movePointTo(index: number, x: number, y: number) {
        if (index < 0 || index >= this.shapes.length) return;
        const p = this.shapes[index];
        if (p.type !== "point") return;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx === 0 && dy === 0) return;
        p.x = x;
        p.y = y;
        for (const s of this.shapes) {
            if (s.type === "label" && s.tieid === p.tieid) {
                s.x += dx;
                s.y += dy;
            }
        }
        this.notify();
    }

    getRawShapeData(): (ShapeData | undefined)[] {
        return this.shapes.map((shape): ShapeData | undefined => {
            switch (shape.type) {
                case "point":
                    return (new PointTool).create(shape.x, shape.y, shape.radius, shape.fill);
                case "wall":
                    return (new LineTool).create(shape.points, shape.stroke, shape.strokeWidth);
                case "label":
                    const tiedPoint = this.shapes.find(
                        (other): other is PointShape => other.type === "point" && other.tieid === shape.tieid,
                    );
                    const adjusted = tiedPoint ? this.getAdjustedZ(tiedPoint.x, tiedPoint.y, tiedPoint.z) : shape.z;
                    const labelText = adjusted.toFixed(1);
                    return (new TextTool).create(
                        shape.x,
                        shape.y,
                        labelText,
                        shape.fontSize,
                        shape.fill,
                        shape.draggable,
                        shape.stroke,
                        shape.strokeWidth,
                        shape.fontFamily,
                    );
            }
        });
    }

    getShapesAsShapeData(): (ShapeData | undefined)[] {
        return this.getRawShapeData();
    }


    selectNearest = (sx: number, sy: number, threshold: number = 10) => {

        for (let i = 0; i < this.shapes.length; i++) {
            const s = this.shapes[i];
            if (s.selected) {
                switch (s.type) {
                    case "wall":
                        s.stroke = wallStyle.stroke;
                        s.strokeWidth = wallStyle.strokeWidth;
                        break;
                    case "point":
                        s.fill = pointStyle.fill;
                        s.radius = pointStyle.radius;
                        break;
                    case "label":
                        s.fill = heightLabelStyle.fill!;
                        s.stroke = heightLabelStyle.stroke!;
                        s.strokeWidth = heightLabelStyle.strokeWidth!;
                        s.draggable = heightLabelStyle.draggable!;
                        s.fontSize = heightLabelStyle.fontsize!;
                        s.fontFamily = heightLabelStyle.fontFamily!;
                        break;
                }
                s.selected = false;
            }
        }

        let mindist = 100000;
        let mini = -1;

        for (let i = 0; i < this.shapes.length; i++) {
            const s = this.shapes[i];
            if (this.isTemporary(s)) continue;
            let newdist = 100000;
            switch (s.type) {
                case "wall": {
                    const p = s.points;
                    newdist = (new MathHelper).point_line_dist_end_constrained(
                        sx, sy, p[0], p[1], p[2], p[3]
                    );
                    break;
                }
                case "point":
                    newdist = Math.sqrt(Math.pow(sx - s.x, 2) + Math.pow(sy - s.y, 2));
                    break;
                default:
                    continue;
            }
            if (Number.isNaN(newdist)) continue;
            if (newdist < mindist || mini === -1) {
                mindist = newdist;
                mini = i;
            }
        }

        if (mini !== -1 && mindist <= threshold) {
            this.selectedIndex = mini;
            const sel = this.shapes[mini];
            sel.selected = true;
            switch (sel.type) {
                case "wall":
                    sel.stroke = selectedWallStyle.stroke;
                    sel.strokeWidth = selectedWallStyle.strokeWidth;
                    break;
                case "point": {
                    sel.radius = selectedPointStyle.radius;
                    sel.fill = selectedPointStyle.fill;
                    for (let j = 0; j < this.shapes.length; j++) {
                        const other = this.shapes[j];
                        if (other.type === "label" && other.tieid === (sel as PointShape).tieid) {
                            other.selected = true;
                            (other as LabelShape).fill = selectedHeightLabelStyle.fill!;
                            (other as LabelShape).stroke = selectedHeightLabelStyle.stroke!;
                            (other as LabelShape).strokeWidth = selectedHeightLabelStyle.strokeWidth!;
                            (other as LabelShape).draggable = selectedHeightLabelStyle.draggable!;
                            (other as LabelShape).fontSize = selectedHeightLabelStyle.fontsize!;
                            (other as LabelShape).fontFamily = selectedHeightLabelStyle.fontFamily!;
                            break;
                        }
                    }
                    break;
                }
            }
        } else {
            this.selectedIndex = -1;
        }
        this.notify();
    }


    solveContours = async () => {
        const contourData = await this.communicator.fetchContours();
        return contourData;
    }

}


export default FLSController;
