import { Layer, Circle, Line } from "react-konva";
import { GRID_MINOR, GRID_MAJOR } from "./grid_constants";


interface GridLayerProps {
    width: number;
    height: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    showMajor: boolean;
}


function GridLayer({ width, height, scale, offsetX, offsetY, showMajor }: GridLayerProps) {
    if (scale < 0.05 || width <= 0 || height <= 0) {
        return <Layer listening={false} />;
    }

    const x0 = -offsetX / scale;
    const y0 = -offsetY / scale;
    const x1 = x0 + width / scale;
    const y1 = y0 + height / scale;

    const majorStart = (v: number) => Math.floor(v / GRID_MAJOR) * GRID_MAJOR - GRID_MAJOR;
    const majorEnd = (v: number) => Math.ceil(v / GRID_MAJOR) * GRID_MAJOR + GRID_MAJOR;

    const majorLines: { key: string; points: number[] }[] = [];
    if (showMajor && scale >= 0.15) {
        for (let x = majorStart(x0); x <= majorEnd(x1); x += GRID_MAJOR) {
            majorLines.push({ key: `mx${x}`, points: [x, majorStart(y0), x, majorEnd(y1)] });
        }
        for (let y = majorStart(y0); y <= majorEnd(y1); y += GRID_MAJOR) {
            majorLines.push({ key: `my${y}`, points: [majorStart(x0), y, majorEnd(x1), y] });
        }
    }

    const dots: { key: string; x: number; y: number }[] = [];
    if (scale >= 0.25) {
        const mStart = (v: number) => Math.floor(v / GRID_MINOR) * GRID_MINOR;
        const mEnd = (v: number) => Math.ceil(v / GRID_MINOR) * GRID_MINOR;

        const xStart = mStart(x0) - GRID_MINOR;
        const xEnd = mEnd(x1) + GRID_MINOR;
        const yStart = mStart(y0) - GRID_MINOR;
        const yEnd = mEnd(y1) + GRID_MINOR;

        const cols = Math.ceil((xEnd - xStart) / GRID_MINOR) + 1;
        const rows = Math.ceil((yEnd - yStart) / GRID_MINOR) + 1;
        const projected = cols * rows;
        const stride = projected > 4000 ? GRID_MAJOR : GRID_MINOR;

        for (let x = xStart; x <= xEnd; x += stride) {
            for (let y = yStart; y <= yEnd; y += stride) {
                dots.push({ key: `d${x}_${y}`, x, y });
            }
        }
    }

    const dotRadius = Math.max(0.5, 1 / scale);
    const majorStrokeWidth = 1 / scale;

    return (
        <Layer listening={false}>
            {majorLines.map(l => (
                <Line
                    key={l.key}
                    points={l.points}
                    stroke="#dde1e7"
                    strokeWidth={majorStrokeWidth}
                />
            ))}
            {dots.map(d => (
                <Circle
                    key={d.key}
                    x={d.x}
                    y={d.y}
                    radius={dotRadius}
                    fill="#c9ced6"
                />
            ))}
        </Layer>
    );
}


export default GridLayer;
