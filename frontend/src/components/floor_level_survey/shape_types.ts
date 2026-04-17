export type Tool = "select" | "draw_wall" | "draw_point";

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

export type Shape = PointShape | WallShape | LabelShape;

/**
 * Contour lines are derived from the input points by the backend (TIN-based
 * extraction) and are not user-editable, so they live outside the main Shape
 * union. Each polyline is stored as a flat [x0, y0, x1, y1, ...] array so it
 * can be fed straight to a Konva Line.
 */
export interface ContourPolyline {
    height: number;
    points: number[];
}

/**
 * A filled "band" of the contour map: the region where the interpolated
 * surface sits between `low` and `high`. Each band is returned as a list
 * of polygon fragments (one per TIN triangle piece, already clipped to
 * the wall polygon server-side). `colorHeight` is the representative z
 * value the frontend hands to the gradient ramp.
 *
 * `low` is null for the "below everything" band; `high` is null for the
 * "above everything" band.
 */
export interface ContourFillBand {
    low: number | null;
    high: number | null;
    colorHeight: number;
    fragments: number[][];  // each fragment is a flat [x0, y0, x1, y1, ...]
}

