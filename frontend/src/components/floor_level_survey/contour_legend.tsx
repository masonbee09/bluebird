import { interpolateContourColor } from "./contour_colors";
import "./contour_legend.css";


interface ContourLegendProps {
    startColor: string;
    endColor: string;
    minZ: number;
    maxZ: number;
    tickCount?: number;
}


function ContourLegend({ startColor, endColor, minZ, maxZ, tickCount = 6 }: ContourLegendProps) {
    if (!isFinite(minZ) || !isFinite(maxZ) || minZ === maxZ) return null;

    const stops: { t: number; color: string }[] = [];
    const STOP_COUNT = 12;
    for (let i = 0; i <= STOP_COUNT; i++) {
        const t = i / STOP_COUNT;
        stops.push({ t, color: interpolateContourColor(startColor, endColor, t) });
    }
    const gradientCss = `linear-gradient(to top, ${stops.map(s => `${s.color} ${(s.t * 100).toFixed(1)}%`).join(", ")})`;

    const ticks: { t: number; z: number }[] = [];
    for (let i = 0; i < tickCount; i++) {
        const t = tickCount === 1 ? 0 : i / (tickCount - 1);
        ticks.push({ t, z: minZ + t * (maxZ - minZ) });
    }

    return (
        <div className="fls-contour-legend" aria-label="Contour height legend">
            <div className="fls-contour-legend-bar" style={{ backgroundImage: gradientCss }} />
            <div className="fls-contour-legend-ticks">
                {ticks.map((tk, i) => (
                    <span
                        key={i}
                        className="fls-contour-legend-tick"
                        style={{ bottom: `${(tk.t * 100).toFixed(2)}%` }}>
                        {tk.z.toFixed(1)}
                    </span>
                ))}
            </div>
        </div>
    );
}


export default ContourLegend;
