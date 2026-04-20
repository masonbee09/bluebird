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
    /** Contour legend Z range from last solve; if omitted, derived from point heights when possible. */
    legendRange?: { minZ: number; maxZ: number } | null;
    filenameBase?: string;
}


function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    if (full.length !== 6 || Number.isNaN(n)) return [30, 64, 175];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}


function drawContourLegend(
    pdf: jsPDF,
    opts: {
        x: number;
        y: number;
        width: number;
        height: number;
        minZ: number;
        maxZ: number;
        startColor: string;
        endColor: string;
        tickCount?: number;
    },
) {
    const {
        x,
        y,
        width,
        height,
        minZ,
        maxZ,
        startColor,
        endColor,
        tickCount = 6,
    } = opts;
    const strips = Math.max(48, Math.floor(height));
    const stripH = height / strips;
    for (let j = 0; j < strips; j++) {
        const t = strips <= 1 ? 0 : j / (strips - 1);
        const hex = interpolateContourColor(startColor, endColor, t);
        const [r, g, b] = hexToRgb(hex);
        pdf.setFillColor(r, g, b);
        const y0 = y + height - (j + 1) * stripH;
        pdf.rect(x, y0, width, stripH, "F");
    }
    pdf.setDrawColor(180);
    pdf.setLineWidth(0.35);
    pdf.rect(x, y, width, height, "S");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(40);
    const labelX = x + width + 5;
    for (let i = 0; i < tickCount; i++) {
        const t = tickCount === 1 ? 0 : i / (tickCount - 1);
        const z = minZ + t * (maxZ - minZ);
        const ty = y + height - t * height + 3;
        pdf.text(z.toFixed(1), labelX, ty);
    }
    pdf.setTextColor(0);
}


function resolveLegendRange(
    explicit: { minZ: number; maxZ: number } | null | undefined,
    shapes: Shape[],
): { minZ: number; maxZ: number } | null {
    if (explicit && isFinite(explicit.minZ) && isFinite(explicit.maxZ) && explicit.maxZ > explicit.minZ) {
        return explicit;
    }
    const zs = shapes.filter(s => s.type === "point").map(p => (p as { z: number }).z);
    if (zs.length === 0) return null;
    const lo = Math.min(...zs);
    const hi = Math.max(...zs);
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return null;
    return { minZ: lo, maxZ: hi };
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

    const legend =
        settings.contourFill ? resolveLegendRange(legendRange ?? null, shapes) : null;
    const legendColWidth = legend ? 72 : 0;

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Floor Level Survey", margin, margin + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text(`Exported ${new Date().toLocaleString()}`, margin, margin + 20);
    pdf.setTextColor(0);

    // Image area: reserve space at the top for the header and at the bottom for a summary
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

    if (legend) {
        const barW = 14;
        const barTopPad = 18;
        const barBottomPad = 12;
        const barX = pageW - margin - legendColWidth + 10;
        const barY = imgY + barTopPad;
        const barH = Math.max(80, imgH - barTopPad - barBottomPad);
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(10);
        pdf.text("z", barX + barW / 2 - 2, barY - 6);
        pdf.setFont("helvetica", "normal");
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
