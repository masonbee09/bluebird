import { PlusIcon, MinusIcon, FrameIcon } from "./tool_icons";
import "./zoom_control.css";


interface ZoomControlProps {
    scale: number;
    minScale: number;
    maxScale: number;
    onZoomBy: (factor: number) => void;
    onSetScale: (scale: number) => void;
    onFrameAll: () => void;
}


function scaleToSlider(scale: number, min: number, max: number): number {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    const t = (Math.log(scale) - logMin) / (logMax - logMin);
    return Math.max(0, Math.min(1, t)) * 100;
}


function sliderToScale(pct: number, min: number, max: number): number {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return Math.exp(logMin + t * (logMax - logMin));
}


function ZoomControl({ scale, minScale, maxScale, onZoomBy, onSetScale, onFrameAll }: ZoomControlProps) {
    const pct = scaleToSlider(scale, minScale, maxScale);
    const label = Math.round(scale * 100);

    return (
        <div className="fls-zoom-control" role="group" aria-label="Zoom controls">
            <button
                type="button"
                className="fls-zoom-btn"
                onClick={() => onZoomBy(1 / 1.1)}
                title="Zoom out (-)">
                <MinusIcon />
            </button>
            <input
                type="range"
                className="fls-zoom-slider"
                min={0}
                max={100}
                step={0.5}
                value={pct}
                onChange={e => onSetScale(sliderToScale(parseFloat(e.target.value), minScale, maxScale))}
                aria-label="Zoom level"
            />
            <button
                type="button"
                className="fls-zoom-btn"
                onClick={() => onZoomBy(1.1)}
                title="Zoom in (+)">
                <PlusIcon />
            </button>
            <div className="fls-zoom-divider" />
            <div className="fls-zoom-readout" aria-live="polite">{label}%</div>
            <button
                type="button"
                className="fls-zoom-btn"
                onClick={onFrameAll}
                title="Frame all (F or 0)">
                <FrameIcon />
            </button>
        </div>
    );
}


export default ZoomControl;
