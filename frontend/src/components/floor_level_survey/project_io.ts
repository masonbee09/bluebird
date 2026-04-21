import type { Shape } from "./shape_types";
import { jsPDF } from "jspdf";
import { interpolateContourColor } from "./contour_colors";
import { emptyProjectInfo, type FLSProjectInfo } from "./project_info_modal";


export const FLS_PROJECT_SCHEMA = "blue-bird.fls.project";
export const FLS_PROJECT_VERSION = 2;


export interface FLSProjectSettings {
    contourSpacing: number | null;
    pointHeight: number | null;
    showMajorGrid: boolean;
    showMinimap: boolean;
    contourStartColor: string;
    contourEndColor: string;
    contourFill: boolean;
    projectInfo?: FLSProjectInfo;
}


export interface FLSProjectFile {
    schema: typeof FLS_PROJECT_SCHEMA;
    version: number;
    savedAt: string;
    settings: FLSProjectSettings;
    shapes: Shape[];
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


function formatDateMMDDYYYY(isoDate: string): string {
    // Input: "YYYY-MM-DD" (from <input type="date">) or empty -> fallback to today.
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        const [y, m, d] = isoDate.split("-");
        return `${m}/${d}/${y}`;
    }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}


function formatProjectDateShort(isoDate: string): string {
    // Matches screenshot: "MM/YYYY"
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        const [y, m] = isoDate.split("-");
        return `${m}/${y}`;
    }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
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
    const rawSettings = (data.settings as FLSProjectSettings | undefined) ?? {
        contourSpacing: 0.1,
        pointHeight: 0,
        showMajorGrid: true,
        showMinimap: true,
        contourStartColor: "#1e40af",
        contourEndColor: "#dc2626",
        contourFill: true,
    };
    const settings: FLSProjectSettings = {
        ...rawSettings,
        projectInfo: rawSettings.projectInfo
            ? { ...emptyProjectInfo(), ...rawSettings.projectInfo }
            : emptyProjectInfo(),
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
    /** Contour level range from last solve; falls back to point Z range when omitted. */
    legendRange?: { minZ: number; maxZ: number } | null;
    filenameBase?: string;
}


function hexToRgb(hex: string): [number, number, number] {
    let clean = hex.trim().replace("#", "");
    if (clean.length === 3) {
        clean = clean.split("").map(c => c + c).join("");
    }
    if (clean.length !== 6) return [0, 0, 0];
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
    ];
}


function legendRangeFromShapes(shapes: Shape[]): { minZ: number; maxZ: number } | null {
    const zs = shapes.filter((s): s is Extract<Shape, { type: "point" }> => s.type === "point").map(s => s.z);
    if (zs.length === 0) return null;
    const lo = Math.min(...zs);
    const hi = Math.max(...zs);
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return null;
    return { minZ: lo, maxZ: hi };
}


/** Vertical color bar + tick labels (matches on-screen legend: low at bottom, high at top). */
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
    const { x, y, width, height, minZ, maxZ, startColor, endColor, tickCount = 6 } = opts;
    const strips = 96;
    for (let i = 0; i < strips; i++) {
        const tFromBottom = (strips - 1 - i) / Math.max(1, strips - 1);
        const col = interpolateContourColor(startColor, endColor, tFromBottom);
        const [r, g, b] = hexToRgb(col);
        const stripH = height / strips;
        pdf.setFillColor(r, g, b);
        pdf.rect(x, y + i * stripH, width, stripH + 0.6, "F");
    }
    pdf.setDrawColor(55);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, width, height, "S");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(0);
    const labelX = x + width + 8;
    pdf.text("z", labelX, y - 4);

    for (let ti = 0; ti < tickCount; ti++) {
        const t = tickCount === 1 ? 0 : ti / (tickCount - 1);
        const z = minZ + t * (maxZ - minZ);
        const tickY = y + height - t * height;
        pdf.setDrawColor(80);
        pdf.line(x + width, tickY, x + width + 5, tickY);
        pdf.text(z.toFixed(1), labelX, tickY + 3);
    }
}


/** Draw a circled letter (e.g. "H" / "L") as a legend glyph. */
function drawCircledLetter(
    pdf: jsPDF,
    cx: number,
    cy: number,
    letter: string,
) {
    pdf.setDrawColor(30);
    pdf.setLineWidth(0.8);
    pdf.circle(cx, cy, 7, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(20);
    pdf.text(letter, cx, cy + 3.3, { align: "center" });
}


interface TitleBlockOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    projectInfo: FLSProjectInfo;
    differential: number | null;
}


function drawLegendCell(
    pdf: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    units: string,
    differential: number | null,
) {
    const headerH = 20;
    pdf.setDrawColor(30);
    pdf.setLineWidth(0.5);
    pdf.line(x, y + headerH, x + w, y + headerH);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(20);
    pdf.text("LEGEND", x + 10, y + 13);

    const bodyTop = y + headerH;
    const lineHeight = (h - headerH) / 4;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(20);
    const diffText = differential !== null
        ? `Total Differential = ${differential.toFixed(1)} ${units || "inches"}`
        : `Total Differential = — ${units || "inches"}`;
    pdf.text(diffText, x + 12, bodyTop + lineHeight - 4);

    const itemY1 = bodyTop + lineHeight * 2 + 2;
    drawCircledLetter(pdf, x + 20, itemY1, "H");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("High Point of Elevation Readings", x + 34, itemY1 + 3.5);

    const itemY2 = bodyTop + lineHeight * 3 + 2;
    drawCircledLetter(pdf, x + 20, itemY2, "L");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Low Point of Elevation Readings", x + 34, itemY2 + 3.5);
}


function drawTitleCell(
    pdf: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    info: FLSProjectInfo,
) {
    const titleRowH = h * 0.44;
    const detailRowH = h * 0.30;

    pdf.setDrawColor(30);
    pdf.setLineWidth(0.5);
    pdf.line(x, y + titleRowH, x + w, y + titleRowH);
    pdf.line(x, y + titleRowH + detailRowH, x + w, y + titleRowH + detailRowH);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(20);
    pdf.text("Floor Level", x + w / 2, y + titleRowH / 2 - 2, { align: "center" });
    pdf.text("Survey", x + w / 2, y + titleRowH / 2 + 12, { align: "center" });

    const midTop = y + titleRowH;
    const midMid = midTop + detailRowH / 2;
    pdf.line(x + w / 2, midTop, x + w / 2, midTop + detailRowH);
    pdf.line(x, midMid, x + w, midMid);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(20);
    pdf.text("Project:", x + w / 4, midTop + detailRowH / 4 + 3, { align: "center" });
    pdf.text("Date:", x + (3 * w) / 4, midTop + detailRowH / 4 + 3, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(
        info.projectNumber || "—",
        x + w / 4,
        midMid + detailRowH / 4 + 3,
        { align: "center" },
    );
    pdf.text(
        formatProjectDateShort(info.surveyDate),
        x + (3 * w) / 4,
        midMid + detailRowH / 4 + 3,
        { align: "center" },
    );

    const bottomTop = y + titleRowH + detailRowH;
    const bottomH = h - titleRowH - detailRowH;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(
        info.drawingNumber || "Figure 1",
        x + w / 2,
        bottomTop + bottomH / 2 + 3,
        { align: "center" },
    );
}


function logoFormat(url: string): string {
    const m = url.match(/^data:image\/([a-zA-Z0-9+]+);/);
    if (!m) return "PNG";
    const t = m[1].toLowerCase();
    if (t === "jpeg" || t === "jpg") return "JPEG";
    if (t === "webp") return "WEBP";
    if (t === "png") return "PNG";
    return "PNG";
}


function drawLogoCell(
    pdf: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    info: FLSProjectInfo,
) {
    const pad = 6;
    if (info.companyLogo) {
        try {
            const props = pdf.getImageProperties(info.companyLogo);
            const aspect = props.width / Math.max(1, props.height);
            const maxW = w - pad * 2;
            const maxH = h - pad * 2;
            let imgW = maxW;
            let imgH = imgW / aspect;
            if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH * aspect;
            }
            const ix = x + (w - imgW) / 2;
            const iy = y + (h - imgH) / 2;
            pdf.addImage(info.companyLogo, logoFormat(info.companyLogo), ix, iy, imgW, imgH, undefined, "FAST");
        } catch {
            // If the image format can't be determined, fall back to company name text.
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            pdf.setTextColor(40);
            pdf.text(info.companyName || "Logo", x + w / 2, y + h / 2, { align: "center" });
        }
    } else if (info.companyName) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(40);
        pdf.text(info.companyName, x + w / 2, y + h / 2, { align: "center", maxWidth: w - pad * 2 });
    }
}


function drawAddressCell(
    pdf: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    info: FLSProjectInfo,
) {
    const lines: string[] = [];
    if (info.projectName) lines.push(info.projectName);
    const addressLines = info.projectAddress
        ? info.projectAddress.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : [];
    lines.push(...addressLines);

    if (lines.length === 0) {
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(10);
        pdf.setTextColor(130);
        pdf.text("No project name or address", x + w / 2, y + h / 2, { align: "center" });
        return;
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(20);
    const lineHeight = 14;
    const totalH = lines.length * lineHeight;
    let textY = y + (h - totalH) / 2 + lineHeight - 3;
    for (const line of lines) {
        pdf.text(line, x + w / 2, textY, { align: "center", maxWidth: w - 12 });
        textY += lineHeight;
    }
}


function drawTitleBlock(pdf: jsPDF, opts: TitleBlockOptions) {
    const { x, y, width, height, projectInfo, differential } = opts;

    pdf.setDrawColor(30);
    pdf.setLineWidth(0.8);
    pdf.rect(x, y, width, height, "S");

    // Column widths
    const colLegend = width * 0.36;
    const colTitle = width * 0.22;
    const colLogo = width * 0.17;
    const colAddr = width - colLegend - colTitle - colLogo;

    const x1 = x + colLegend;
    const x2 = x1 + colTitle;
    const x3 = x2 + colLogo;

    pdf.setLineWidth(0.8);
    pdf.line(x1, y, x1, y + height);
    pdf.line(x2, y, x2, y + height);
    pdf.line(x3, y, x3, y + height);

    drawLegendCell(pdf, x, y, colLegend, height, projectInfo.units, differential);
    drawTitleCell(pdf, x1, y, colTitle, height, projectInfo);
    drawLogoCell(pdf, x2, y, colLogo, height, projectInfo);
    drawAddressCell(pdf, x3, y, colAddr, height, projectInfo);
}


export function exportCanvasAsPDF(opts: ExportPDFOptions) {
    const {
        dataUrl,
        stageWidth,
        stageHeight,
        shapes,
        settings,
        legendRange: legendRangeOpt,
        filenameBase = "floor-level-survey",
    } = opts;

    const projectInfo: FLSProjectInfo = settings.projectInfo
        ? { ...emptyProjectInfo(), ...settings.projectInfo }
        : emptyProjectInfo();

    const landscape = stageWidth >= stageHeight;
    const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 24;

    const titleBlockH = 128;
    const surveyDateH = 18;
    const gapBeforeTitle = 10;

    const imgTop = margin + 8;
    const reservedBottom = margin + titleBlockH + surveyDateH + gapBeforeTitle;
    const imgAreaH = pageH - imgTop - reservedBottom;

    const legendColWidth = 78;
    const rawLegend = legendRangeOpt ?? legendRangeFromShapes(shapes);
    const legend = settings.contourFill ? rawLegend : null;
    const imgAreaW = pageW - margin * 2 - (legend ? legendColWidth : 0);

    // Fit canvas image preserving aspect ratio
    const aspect = stageWidth / Math.max(1, stageHeight);
    let imgW = imgAreaW;
    let imgH = imgW / aspect;
    if (imgH > imgAreaH) {
        imgH = imgAreaH;
        imgW = imgH * aspect;
    }
    const imgX = margin + Math.max(0, (imgAreaW - imgW) / 2);
    const imgY = imgTop;

    // Canvas snapshot with a soft border
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.5);
    pdf.rect(imgX - 1, imgY - 1, imgW + 2, imgH + 2);
    pdf.addImage(dataUrl, "PNG", imgX, imgY, imgW, imgH, undefined, "FAST");

    if (legend) {
        const barW = 14;
        const barTopPad = 10;
        const barBottomPad = 10;
        const barX = margin + imgAreaW + 12;
        const barY = imgY + barTopPad;
        const barH = Math.max(72, imgH - barTopPad - barBottomPad);
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

    // Survey Date line (top-right of title block)
    const tbX = margin;
    const tbW = pageW - margin * 2;
    const tbY = pageH - margin - titleBlockH;
    const surveyDateY = tbY - gapBeforeTitle - 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(20);
    pdf.text(
        `Survey Date: ${formatDateMMDDYYYY(projectInfo.surveyDate)}`,
        tbX + tbW,
        surveyDateY,
        { align: "right" },
    );

    // Title block
    const points = shapes.filter((s): s is Extract<Shape, { type: "point" }> => s.type === "point");
    const zs = points.map(p => p.z);
    const diff = zs.length >= 2 ? Math.max(...zs) - Math.min(...zs) : null;

    drawTitleBlock(pdf, {
        x: tbX,
        y: tbY,
        width: tbW,
        height: titleBlockH,
        projectInfo,
        differential: diff,
    });

    pdf.save(`${filenameBase}-${timestampString()}.pdf`);
}
