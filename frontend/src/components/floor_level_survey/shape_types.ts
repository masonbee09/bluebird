export type Tool = "select" | "draw_wall" | "draw_point" | "draw_boundary";

export interface FloorMaterial {
    id: string;
    name: string;
    /** Elevation offset (in survey units) subtracted from raw measured Z for
     * points that fall inside this material's boundary region. */
    offset: number;
    color: string;
    /** Alpha (0–1) for the region fill. Stroke is always fully opaque.
     * Default: 0.25. */
    fillOpacity: number;
}

export interface PointShape {
    type: "point";
    x: number;
    y: number;
    z: number;
    radius: number;
    fill: string;
    tieid: string;
    selected?: boolean;
}

export interface WallShape {
    type: "wall";
    points: number[];
    stroke: string;
    strokeWidth: number;
    temporary?: boolean;
    selected?: boolean;
}

export interface LabelShape {
    type: "label";
    x: number;
    y: number;
    z: number;
    text: string;
    fontSize: number;
    fill: string;
    fontFamily: string;
    stroke: string;
    strokeWidth: number;
    draggable: boolean;
    tieid: string;
    selected?: boolean;
}

export interface MaterialBoundaryShape {
    type: "boundary";
    /** Flat [x0,y0, x1,y1, ...] polygon vertices (closed). */
    points: number[];
    materialId: string;
    name: string;
    offset: number;
    color: string;
    /** Alpha (0–1) for the region fill. Mirrored from FloorMaterial.fillOpacity. */
    fillOpacity: number;
    temporary?: boolean;
    selected?: boolean;
}

export type Shape = PointShape | WallShape | LabelShape | MaterialBoundaryShape;
