export interface ShapeData {
    id: string;
    type: "rect" | "circle" | "line" | "text";
    x?: number;
    y?: number;
    x2?: number;
    y2?: number;
    points?: any[];
    width?: number;
    height?: number;
    radius?: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    draggable?: boolean;
}

export class PointTool {
    create(x: number, y: number, radius: number, fill: string = "White"): ShapeData {
        return {
            id: crypto.randomUUID(),
            type: "circle",
            x,
            y,
            radius: radius,
            fill: fill
        }
    }
}


export class LineTool {
    create(points: any[], stroke: string = "white", strokeWidth: number = 5): ShapeData {
        return {
            id: crypto.randomUUID(),
            type: "line",
            points: points,
            stroke: stroke,
            strokeWidth: strokeWidth
        }
    }
}


export class TextTool {
    create(
        x: number,
        y: number,
        text: string,
        fontSize: number = 24,
        fill: string = "white",
        draggable: boolean = false,
        stroke?: string,
        strokeWidth?: number,
        fontFamily?: string
    ): ShapeData {
        return {
            id: crypto.randomUUID(),
            type: "text",
            x,
            y,
            text: text,
            fontSize: fontSize,
            fill: fill,
            draggable: draggable,
            stroke: stroke,
            strokeWidth: strokeWidth,
            fontFamily: fontFamily,
        }
    }
}


export default { PointTool, LineTool, TextTool }
