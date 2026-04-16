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
