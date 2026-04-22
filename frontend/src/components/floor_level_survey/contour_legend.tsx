import { interpolateContourColor } from "./contour_colors";
import "./contour_legend.css";


interface ContourLegendProps {
    startColor: string;
    endColor: string;
    minZ: number;
    maxZ: number;
    /** Contour level values. When provided (length >= 2), the legend is rendered
     * as discrete color bands with a label at each level (matching the drawing). */
    levels?: number[] | null;
    /** Only used when `levels` is not provided; number of evenly-spaced ticks. */
    tickCount?: number;
}


function ContourLegend({
    startColor,
    endColor,
    minZ,
    maxZ,
    levels,
    tickCount = 6,
}: ContourLegendProps) {
    if (!isFinite(minZ) || !isFinite(maxZ) || minZ === maxZ) return null;

    // Discretized mode ------------------------------------------------------
    // When we know the actual contour levels, render one colored band per
    // interval. The contour drawing itself is filled the same way (one color
    // per band midpoint), so this legend reads 1:1 with the drawing.
    if (Array.isArray(levels) && levels.length >= 2) {
        const sorted = [...levels].sort((a, b) => a - b);
        const lo = sorted[0];
        const hi = sorted[sorted.length - 1];
        const span = Math.max(1e-9, hi - lo);

        // Build bands from HIGH -> LOW so they stack top-to-bottom in the DOM.
        const bands = [];
        for (let i = sorted.length - 2; i >= 0; i--) {
            const bandLo = sorted[i];
            const bandHi = sorted[i + 1];
            const mid = (bandLo + bandHi) / 2;
            const color = interpolateContourColor(startColor, endColor, (mid - lo) / span);
            const heightPct = ((bandHi - bandLo) / span) * 100;
            bands.push(
                <div
                    key={`band-${i}`}
                    className="fls-contour-legend-band"
                    style={{ backgroundColor: color, flexBasis: `${heightPct}%` }}
                />,
            );
        }

        return (
            <div className="fls-contour-legend" aria-label="Contour height legend">
                <div className="fls-contour-legend-bar is-discrete">{bands}</div>
                <div className="fls-contour-legend-ticks">
                    {sorted.map((v, i) => {
                        const t = (v - lo) / span;
                        return (
                            <span
                                key={`tick-${i}`}
                                className="fls-contour-legend-tick"
                                style={{ bottom: `${(t * 100).toFixed(2)}%` }}>
                                {v.toFixed(1)}
                            </span>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Smooth-gradient fallback (no contour levels known yet) ---------------
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
