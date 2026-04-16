




export default class LineGraphLine {
    xs: number[];
    ys: number[];
    color: string;
    linewidth: number;

    constructor(xs: number[], ys: number[], color:string="white", linewidth:number=3) {
        if (xs.length !== ys.length) {throw new Error("xs and ys must have same length.")}
        this.xs = xs;
        this.ys = ys;
        this.color = color;
        this.linewidth = linewidth;
    }


    getBounds() {
        return [Math.min(...this.xs), Math.max(...this.xs), Math.min(...this.ys), Math.max(...this.ys)]
    }
}