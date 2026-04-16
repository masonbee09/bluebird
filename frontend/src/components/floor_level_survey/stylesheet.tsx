





export class LineStyle {
    stroke: string
    strokeWidth: number

    constructor(stroke: string, strokeWidth: number) {
        this.stroke = stroke
        this.strokeWidth = strokeWidth
    }
}

export class PointStyle {
    radius: number
    fill: string

    constructor(radius: number, fill: string) {
        this.radius = radius
        this.fill = fill
    }
}

interface TextStyleProps {
    fontsize?: number;
    fontFamily?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    draggable?: boolean;
}

export class TextStyle {
    fontsize?: number;
    fontFamily?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    draggable?: boolean;

    constructor({fontsize=12, fontFamily="Calibri", fill="rgb(146, 146, 146)", 
                stroke="rgb(255, 255, 255)", strokeWidth=1, draggable=false}: TextStyleProps) {
        this.fontsize = fontsize
        this.fontFamily = fontFamily
        this.fill = fill
        this.stroke = stroke
        this.strokeWidth = strokeWidth
        this.draggable = draggable
    }
}


export default { LineStyle, PointStyle, TextStyle }