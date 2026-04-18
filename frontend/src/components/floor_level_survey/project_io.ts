import type { Shape } from "./shape_types";
import { jsPDF } from "jspdf";
import { interpolateContourColor } from "./contour_colors";


export const FLS_PROJECT_SCHEMA = "blue-bird.fls.project";
export const FLS_PROJECT_VERSION = 1;


export interface FLSProjectFile {
    schema: typeof FLS_PROJECT_SCHEMA;
    version: number;
    savedAt: string;
    settings: {
        contourSpacing: number | null;
        pointHeight: number | null;
        showMajorGrid: boolean;
        showMinimap: boolean;
        contourStartColor: string;
        contourEndColor: string;
        contourFill: boolean;
    };
    shapes: Shape[];
}


export interface FLSProjectSettings {
    contourSpacing: number | null;
    pointHeight: number | null;
    showMajorGrid: boolean;
    showMinimap: boolean;
    contourStartColor: string;
    contourEndColor: string;
    contourFill: boolean;
}


function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


function timestampString() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}


export function saveProjectFile(shapes: Shape[], settings: FLSProjectSettings, filenameBase = "floor-level-survey") {
    const payload: FLSProjectFile = {
        schema: FLS_PROJECT_SCHEMA,
        version: FLS_PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        settings,
        shapes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${filenameBase}-${timestampString()}.json`);
}


export function readProjectFile(file: File): Promise<FLSProjectFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => {
            try {
                const raw = String(reader.result ?? "");
                const json = JSON.parse(raw);
                const validated = validateProject(json);
                resolve(validated);
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        };
        reader.readAsText(file);
    });
}


function validateProject(obj: unknown): FLSProjectFile {
    if (!obj || typeof obj !== "object") {
        throw new Error("Project file is not a valid JSON object");
    }
    const data = obj as Record<string, unknown>;
    if (data.schema !== FLS_PROJECT_SCHEMA) {
        throw new Error("Project file schema does not match Floor Level Survey");
    }
    if (!Array.isArray(data.shapes)) {
        throw new Error("Project file is missing a valid 'shapes' array");
    }
    const settings = (data.settings as FLSProjectSettings | undefined) ?? {
        contourSpacing: 0.1,
        pointHeight: 0,
        showMajorGrid: true,
        showMinimap: true,
        contourStartColor: "#1e40af",
        contourEndColor: "#dc2626",
        contourFill: true,
    };
    return {
        schema: FLS_PROJECT_SCHEMA,
        version: Number(data.version) || 1,
        savedAt: String(data.savedAt ?? ""),
        settings,
        shapes: data.shapes as Shape[],
    };
}


export interface ExportPDFOptions {
    dataUrl: string;
    stageWidth: number;
    stageHeight: number;
    shapes: Shape[];
    settings: FLSProjectSettings;
    /** Optional z-range for the contour color legend. If null/omitted, the
     *  legend will fall back to the point z range, and if there are no
     *  points either, the legend is skipped. */
    legendRange?: { minZ: number; maxZ: number } | null;
    filenameBase?: string;
}


function hexToRgb(hex: string): [number, number, number] {
    let c = hex.trim();
    if (c.startsWith("#")) c = c.slice(1);
    if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
    if (c.length !== 6) return [0, 0, 0];
    return [
        parseInt(c.slice(0, 2), 16),
        parseInt(c.slice(2, 4), 16),
        parseInt(c.slice(4, 6), 16),
    ];
}


interface LegendLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    minZ: number;
    maxZ: number;
    startColor: string;
    endColor: string;
}


function drawContourLegend(pdf: jsPDF, layout: LegendLayout) {
    const { x, y, width, height, minZ, maxZ, startColor, endColor } = layout;

    // Render the gradient as many thin horizontal strips so it prints smoothly
    // at any DPI. maxZ should appear at the top, minZ at the bottom.
    const strips = 128;
    const stripH = height / strips;
    for (let i = 0; i < strips; i++) {
        const tFromTop = i / (strips - 1); // 0 at top, 1 at bottom
        const tContour = 1 - tFromTop;     // 1 (maxZ) at top, 0 (minZ) at bottom
        const hex = interpolateContourColor(startColor, endColor, tContour);
        const [r, g, b] = hexToRgb(hex);
        pdf.setFillColor(r, g, b);
        pdf.rect(x, y + i * stripH, width, stripH + 0.4, "F");
    }

    // Border around the bar.
    pdf.setDrawColor(120);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, width, height);

    // Tick marks and labels.
    const ticks = 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(40);
    pdf.setDrawColor(80);
    for (let i = 0; i < ticks; i++) {
        const tFromTop = i / (ticks - 1);
        const ty = y + tFromTop * height;
        const z = maxZ - tFromTop * (maxZ - minZ);
        pdf.setLineWidth(0.3);
        pdf.line(x + width, ty, x + width + 3, ty);
        pdf.text(z.toFixed(2), x + width + 5, ty + 2.8);
    }

    // Caption above the bar.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(60);
    pdf.text("z", x + width / 2 - 2, y - 4);
    pdf.setTextColor(0);
}


function resolveLegendRange(
    legendRange: { minZ: number; maxZ: number } | null | undefined,
    shapes: Shape[],
): { minZ: number; maxZ: number } | null {
    if (legendRange && isFinite(legendRange.minZ) && isFinite(legendRange.maxZ) && legendRange.maxZ > legendRange.minZ) {
        return legendRange;
    }
    const zs = shapes
        .filter(s => s.type === "point")
        .map(p => (p as { z: number }).z)
        .filter(z => typeof z === "number" && isFinite(z));
    if (zs.length >= 2) {
        const lo = Math.min(...zs);
        const hi = Math.max(...zs);
        if (hi > lo) return { minZ: lo, maxZ: hi };
    }
    return null;
}


export function exportCanvasAsPDF(opts: ExportPDFOptions) {
    const {
        dataUrl,
        stageWidth,
        stageHeight,
        shapes,
        settings,
        legendRange,
        filenameBase = "floor-level-survey",
    } = opts;

    const landscape = stageWidth >= stageHeight;
    const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 32;

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Floor Level Survey", margin, margin + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text(`Exported ${new Date().toLocaleString()}`, margin, margin + 20);
    pdf.setTextColor(0);

    const legend = resolveLegendRange(legendRange, shapes);
    // Column reserved on the right of the canvas snapshot for the color bar.
    const legendColWidth = legend ? 70 : 0;

    // Image area: reserve space at the top for the header, at the bottom for a
    // summary, and at the right for the color legend.
    const imgTop = margin + 36;
    const summaryHeight = 88;
    const imgAreaW = pageW - margin * 2 - legendColWidth;
    const imgAreaH = pageH - imgTop - margin - summaryHeight;

    const aspect = stageWidth / Math.max(1, stageHeight);
    let imgW = imgAreaW;
    let imgH = imgW / aspect;
    if (imgH > imgAreaH) {
        imgH = imgAreaH;
        imgW = imgH * aspect;
    }
    const imgX = margin + (imgAreaW - imgW) / 2;
    const imgY = imgTop;

    // Canvas snapshot with a soft border
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.5);
    pdf.rect(imgX - 1, imgY - 1, imgW + 2, imgH + 2);
    pdf.addImage(dataUrl, "PNG", imgX, imgY, imgW, imgH, undefined, "FAST");

    // Contour color legend (bar + tick labels), mirroring the on-screen legend.
    if (legend) {
        const barX = pageW - margin - legendColWidth + 8;
        const barW = 14;
        const barTopPad = 14;
        const barBottomPad = 14;
        const barY = imgY + barTopPad;
        const barH = Math.max(60, imgH - barTopPad - barBottomPad);
        drawContourLegend(pdf, {
            x: barX,
            y: barY,
            width: barW,
            height: barH,
            minZ: legend.minZ,
            maxZ: legend.maxZ,
            startColor: settings.contourStartColor,
            endColor: settings.contourEndColor,
        });
    }

    // Summary table
    const summaryY = imgY + imgH + 18;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Summary", margin, summaryY);

    const points = shapes.filter(s => s.type === "point");
    const walls = shapes.filter(s => s.type === "wall");
    const zs = points.map(p => (p as { z: number }).z);
    const zMin = zs.length ? Math.min(...zs) : 0;
    const zMax = zs.length ? Math.max(...zs) : 0;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const lines: string[] = [
        `Points: ${points.length}    Walls: ${walls.length}`,
        `Z range: ${zs.length ? `${zMin.toFixed(3)} → ${zMax.toFixed(3)}` : "—"}    Contour spacing: ${settings.contourSpacing ?? "—"}`,
        `Colors: start ${settings.contourStartColor.toUpperCase()}, end ${settings.contourEndColor.toUpperCase()}    Color fill: ${settings.contourFill ? "On" : "Off"}`,
    ];
    let lineY = summaryY + 14;
    for (const line of lines) {
        pdf.text(line, margin, lineY);
        lineY += 13;
    }

    pdf.save(`${filenameBase}-${timestampString()}.pdf`);
}
