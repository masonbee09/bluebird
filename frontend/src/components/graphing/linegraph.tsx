import { useState, useMemo, useRef, useEffect } from "react";
import LineGraphLine from "./linegraphline"
import { LineTool, TextTool } from "../canvas2d/drawing_tools";
import Canvas2D from "../canvas2d/canvas2d";



interface LineGraphProps {
    lines: LineGraphLine[];
    minx?: number | null;
    maxx?: number | null;
    miny?: number | null;
    maxy?: number | null;
    margin?: number | null;
    axisWidth?: number;
    axisTextSize?: number;
    xTickSpacing?: number | null;
    yTickSpacing?: number | null;
    tickLength?: number;
    decimals?: number;
}



export default function LineGraph({ lines, minx = null, maxx = null, miny = null, maxy = null, margin = 50, 
                                    axisWidth = 2, xTickSpacing = null, yTickSpacing = null, tickLength = 10, 
                                    decimals: sigFigs = 2, axisTextSize = 24 }: LineGraphProps) {

    const containerRef = useRef<HTMLDivElement>(null)

    const [stageDimensions, setStageDimensions] = useState({
        width: 0,
        height: 0,
    });

    const checkSize = () => {
        if (containerRef.current) {
            const width = containerRef.current.offsetWidth;
            const height = containerRef.current.offsetHeight;
            setStageDimensions({ width, height });
        }
    };

    const [forceRenderer, setForceRenderer] = useState(0);

    useEffect(() => {
        checkSize();
        setForceRenderer(v => v + 1)

        window.addEventListener('resize', checkSize);

        return () => {
            window.removeEventListener('resize', checkSize);
        };
    }, []);

    let bounds = getBoundsMultiple(lines)
    if (minx !== null) { bounds[0] = minx }
    if (maxx !== null) { bounds[1] = maxx }
    if (miny !== null) { bounds[2] = miny }
    if (maxy !== null) { bounds[3] = maxy }

    const newShapes = useMemo(() => {
        let s = []
        let w = stageDimensions.width
        let h = stageDimensions.height
        let offset = 0
        if (margin != null) {
            w -= 2 * margin;
            h -= 2 * margin;
            offset = margin
        }
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            let points = []
            for (let j = 0; j < line.xs.length; j++) {

                let newx = (line.xs[j] - bounds[0]) / (bounds[1] - bounds[0]) * w + offset
                let newy = (1 - (line.ys[j] - bounds[2]) / (bounds[3] - bounds[2])) * h + offset

                points.push(newx)
                points.push(newy)
            }
            s.push((new LineTool).create(points, line.color, line.linewidth))
        }

        let xAxisLoc = (1 - (Math.max(Math.min(0, bounds[3]), bounds[2]) - bounds[2]) / (bounds[3] - bounds[2])) * h + offset
        let yAxisLoc = (0 - bounds[0]) / (bounds[1] - bounds[0]) * w + offset

        let horiAxis = [offset, xAxisLoc, w + offset, xAxisLoc]
        s.push((new LineTool).create(horiAxis, "white", axisWidth))

        let vertAxis = [yAxisLoc, offset, yAxisLoc, h + offset]
        s.push((new LineTool).create(vertAxis, "white", axisWidth))

        if (xTickSpacing == null) {
            xTickSpacing = (bounds[1] - bounds[0]) / 10
        }
        if (yTickSpacing == null) {
            yTickSpacing = (bounds[3] - bounds[2]) / 10
        }

        let xCount = Math.floor((bounds[1] - bounds[0]) / xTickSpacing)
        let yCount = Math.floor((bounds[3] - bounds[2]) / yTickSpacing)

        for (let i = 0; i < xCount; i++) {
            s.push((new LineTool).create([i / xCount * w + offset, xAxisLoc + tickLength, i / xCount * w + offset, xAxisLoc], "white", axisWidth))
            s.push((new TextTool).create(i / xCount * w + offset, xAxisLoc + tickLength, (i * xTickSpacing + bounds[0]).toFixed(sigFigs), axisTextSize, "white"))
        }
        for (let i = 0; i < yCount; i++) {
            s.push((new LineTool).create([yAxisLoc - tickLength, (1 - i / yCount) * h + offset, yAxisLoc, (1 - i / xCount) * h + offset], "white", axisWidth))
            s.push((new TextTool).create(yAxisLoc + tickLength, (1 - i / yCount) * h + offset, (i * yTickSpacing + bounds[2]).toFixed(sigFigs), axisTextSize, "white"))
        }
        if (xCount == (bounds[1] - bounds[0]) / xTickSpacing) {
            s.push((new LineTool).create([1 * w + offset, xAxisLoc + tickLength, 1 * w + offset, xAxisLoc], "white", axisWidth))
            s.push((new TextTool).create(w + offset, xAxisLoc + tickLength, (xCount * xTickSpacing + bounds[0]).toFixed(sigFigs), axisTextSize, "white"))
        }
        if (yCount == (bounds[3] - bounds[2]) / yTickSpacing) {
            s.push((new LineTool).create([yAxisLoc - tickLength, offset, yAxisLoc, offset], "white", axisWidth))
            s.push((new TextTool).create(yAxisLoc + tickLength, offset, (yCount * yTickSpacing + bounds[2]).toFixed(sigFigs), axisTextSize, "white"))
        }

        return s
    }, [lines, forceRenderer])

    // let widthaspect = Math.min((bounds[1] - bounds[0]) / (bounds[3] - bounds[2]) * 100, 100).toFixed(4) + "%"
    // let heightaspect = Math.min((bounds[3] - bounds[2]) / (bounds[1] - bounds[0]) * 100, 100).toFixed(4) + "%"
    // console.log(widthaspect, heightaspect)



    // return Canvas2D({ Shapes: newShapes, zoomFunctionality: false })
    return (
        <div style={{ alignContent: "center", flex: 1 }} ref={containerRef}>
            <Canvas2D Shapes={newShapes} zoomFunctionality={false} forceScale={true} />
        </div>
    )
}





function getBoundsMultiple(lines: LineGraphLine[]) {
    let bounds1 = lines[0].getBounds();
    let xmin = bounds1[0];
    let xmax = bounds1[1];
    let ymin = bounds1[2];
    let ymax = bounds1[3];

    for (let i = 0; i < lines.length; i++) {
        let temp = lines[i].getBounds();
        if (temp[0] < xmin) { xmin = temp[0] };
        if (temp[1] > xmax) { xmax = temp[1] };
        if (temp[2] < ymin) { ymin = temp[2] };
        if (temp[3] > ymax) { ymax = temp[3] };
    }
    return [xmin, xmax, ymin, ymax]
}