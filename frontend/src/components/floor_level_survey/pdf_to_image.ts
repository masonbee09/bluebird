/**
 * Rasterize the first page of a PDF file (or pass-through an image file) to a
 * PNG data URL for use as a background tracing reference.
 */

import * as pdfjsLib from "pdfjs-dist";
// pdfjs-dist ships its worker as a separate ESM file. Vite can bundle it via
// the ?url import suffix — this gives us a URL string that works in dev and
// production without requiring explicit CORS/static-hosting setup.
// @ts-expect-error — ?url is a Vite-specific asset import pattern.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";


// Configure the worker once, lazily.
let _workerConfigured = false;
function ensureWorker() {
    if (_workerConfigured) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc as string;
    _workerConfigured = true;
}


export interface BackgroundRasterResult {
    /** PNG data URL (base64). */
    dataUrl: string;
    /** Natural pixel width of the raster. */
    width: number;
    /** Natural pixel height of the raster. */
    height: number;
}


/**
 * Convert the first page of a PDF file into a PNG data URL.
 *
 * @param file The user-selected File (must be a PDF).
 * @param targetPixelWidth Approximate output width in pixels; determines the
 *     render scale so the image is crisp when displayed.
 */
export async function rasterizePdfFirstPage(
    file: File,
    targetPixelWidth = 1600,
): Promise<BackgroundRasterResult> {
    ensureWorker();

    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    try {
        const page = await pdf.getPage(1);
        // Base viewport at scale 1 gives us the PDF's native size in points.
        const viewportAt1 = page.getViewport({ scale: 1 });
        const scale = Math.max(0.5, targetPixelWidth / viewportAt1.width);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas not supported");

        // Fill white so transparent PDFs become opaque reference images.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        return {
            dataUrl: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height,
        };
    } finally {
        try { await pdf.cleanup(); } catch { /* ignore */ }
        try { await pdf.destroy(); } catch { /* ignore */ }
    }
}


/** Read an image file directly into a PNG/JPEG data URL. */
export function readImageAsDataUrl(file: File): Promise<BackgroundRasterResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.onload = () => {
            const dataUrl = String(reader.result ?? "");
            const img = new Image();
            img.onerror = () => reject(new Error("Invalid image"));
            img.onload = () => {
                resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}


/**
 * Unified import: accepts a PDF or an image file and returns a raster result.
 */
export async function importBackgroundFile(file: File): Promise<BackgroundRasterResult> {
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    if (isPdf) return rasterizePdfFirstPage(file);
    if (file.type.startsWith("image/")) return readImageAsDataUrl(file);
    throw new Error("Unsupported file type. Please choose a PDF or image.");
}
