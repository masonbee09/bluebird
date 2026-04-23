import { useRef, useState, useEffect, useCallback } from "react";
import type React from "react";
import { Stage, Layer, Line, Circle, Text, Group } from "react-konva";
import type Konva from "konva";
import FLSController from "./flscontroller";
import { wallStyle, pointStyle, heightLabelStyle } from "./style_presets";
import type { Tool, Shape, PointShape, FloorMaterial, MaterialBoundaryShape } from "./shape_types";
import GridLayer from "./grid_layer";
import ShortcutGuide from "./shortcut_guide";
import Minimap from "./minimap";
import ZoomControl from "./zoom_control";
import ContextMenu, { type ContextMenuItem } from "./context_menu";
import { UndoIcon, RedoIcon } from "./tool_icons";
import { snapToGrid } from "./grid_constants";

function hexToRgba(hex: string, alpha: number): string {
    let h = hex.trim().replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
import ContourLayer, { type ContourData } from "./contour_layer";
import ContourLegend from "./contour_legend";
import "./floorlevelsurvey.css";


export interface FLSExportImage {
    dataUrl: string;
    /** CSS-pixel width of the captured region (used as aspect source for the PDF). */
    width: number;
    /** CSS-pixel height of the captured region. */
    height: number;
}


export interface FLSApi {
    getShapes: () => Shape[];
    loadShapes: (shapes: Shape[]) => void;
    getStageDataURL: (pixelRatio?: number) => string | null;
    getStageSize: () => { width: number; height: number };
    /** Capture the drawing for PDF export: grid is hidden, stage is temporarily
     * reframed so all content fits, and only the content bounding box is
     * rasterized. Returns null when the stage is not mounted. */
    getExportImage: (pixelRatio?: number) => FLSExportImage | null;
    /** Min/max contour level from last solve; null if contours were not computed. */
    getLegendRange: () => { minZ: number; maxZ: number } | null;
    /** All contour level values from the last solve (ascending); null if none. */
    getLegendLevels: () => number[] | null;
    /** Sync updated material properties to every drawn boundary that uses this materialId. */
    updateBoundaryMaterial: (materialId: string, name: string, offset: number, color: string, fillOpacity: number) => void;
    /** Highest- and lowest-elevation point shapes currently in the scene. */
    getHighLow: () => { high: PointShape | null; low: PointShape | null; differential: number | null };
}


interface FLSProps {
    apiRef?: React.MutableRefObject<FLSApi | null>;
    tool: Tool;
    setTool: (t: Tool) => void;
    getContourSpacing: () => number;
    getPointHeight?: () => number;
    solveTrigger?: number;
    showMajorGrid: boolean;
    setShowMajorGrid: (v: boolean) => void;
    showMinimap: boolean;
    setShowMinimap: (v: boolean) => void;
    guideOpen: boolean;
    setGuideOpen: (v: boolean) => void;
    contourStartColor: string;
    contourEndColor: string;
    contourFill: boolean;
    setContourFill: (v: boolean) => void;
    onActiveHeightChange?: (z: number | null) => void;
    /** Called whenever the highest/lowest/differential values change. */
    onHighLowChange?: (high: PointShape | null, low: PointShape | null, differential: number | null) => void;
    /** Currently selected floor material (used when drawing boundaries). */
    selectedMaterial?: FloorMaterial | null;
    /** Whether the floor material boundary regions layer is visible. Default true. */
    showBoundaries?: boolean;
}


const MIN_SCALE = 0.05;
const MAX_SCALE = 20;


function FloorLevelSurvey({ apiRef, tool, setTool, getContourSpacing, getPointHeight, solveTrigger, showMajorGrid, setShowMajorGrid, showMinimap, setShowMinimap, guideOpen, setGuideOpen, contourStartColor, contourEndColor, contourFill, setContourFill, onActiveHeightChange, onHighLowChange, selectedMaterial, showBoundaries = true }: FLSProps) {

    const [, setTick] = useState(0);
    const [controller] = useState(() => new FLSController(() => setTick(t => t + 1), getContourSpacing));

    const [wallPoly, setWallPoly] = useState<{ x: number; y: number }[]>([]);
    const lastWallClickRef = useRef<{ t: number; x: number; y: number } | null>(null);

    const [boundaryPoly, setBoundaryPoly] = useState<{ x: number; y: number }[]>([]);
    const lastBoundaryClickRef = useRef<{ t: number; x: number; y: number } | null>(null);
    const [exampleInjected, setExampleInjected] = useState(false);
    const [contourData, setContourData] = useState<ContourData | null>(null);

    const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    const panStateRef = useRef<{
        active: boolean;
        moved: boolean;
        startClientX: number;
        startClientY: number;
        startStageX: number;
        startStageY: number;
        triggeredBy: "space" | "middle" | "select";
    } | null>(null);

    const pointDragRef = useRef<{
        active: boolean;
        index: number;
        startClientX: number;
        startClientY: number;
        moved: boolean;
        snapshotted: boolean;
    } | null>(null);

    const DRAG_THRESHOLD_PX = 3;
    const HIT_TOLERANCE_WORLD = 12;

    const stageRef = useRef<Konva.Stage | null>(null);

    useEffect(() => {
        if (solveTrigger === undefined || solveTrigger === 0) return;
        let cancelled = false;
            (async () => {
            try {
                const data = await controller.solveContours();
                if (cancelled) return;
                setContourData(data as ContourData);
            } catch (err) {
                console.error("Failed to solve contours:", err);
                if (!cancelled) setContourData(null);
            }
            })();
        return () => { cancelled = true; };
    }, [solveTrigger, controller]);


    // Resize

    const containerRef = useRef<HTMLDivElement>(null);
    const [stageDimensions, setStageDimensions] = useState({ width: 0, height: 0 });

    const checkSize = () => {
        if (containerRef.current) {
            const width = containerRef.current.offsetWidth;
            const height = containerRef.current.offsetHeight;
            setStageDimensions({ width, height });
        }
    };

    useEffect(() => {
        checkSize();
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);


    // Cursor

    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const container = stage.container();
        if (panStateRef.current?.active || pointDragRef.current?.active) {
            container.style.cursor = "grabbing";
        } else if (spaceHeld) {
            container.style.cursor = "grab";
        } else if (tool === "draw_point" || tool === "draw_wall" || tool === "draw_boundary") {
            container.style.cursor = "crosshair";
        } else {
            container.style.cursor = "default";
        }
    }, [tool, spaceHeld, stageDimensions]);


    // Shape creation

    const addPoint = useCallback((x: number, y: number, z: number, autoSelect: boolean = true) => {
        const tieid = crypto.randomUUID();
        const pointShape: Shape = {
            type: "point",
            x,
            y,
            z,
            radius: pointStyle.radius,
            fill: pointStyle.fill,
            tieid,
        };
        const labelShape: Shape = {
            type: "label",
            x: x + 10,
            y: y - 10,
            z,
            text: z.toFixed(1),
            fontSize: heightLabelStyle.fontsize!,
            fill: heightLabelStyle.fill!,
            fontFamily: heightLabelStyle.fontFamily!,
            stroke: heightLabelStyle.stroke!,
            strokeWidth: heightLabelStyle.strokeWidth!,
            draggable: true,
            tieid,
        };
        const newPointIndex = controller.shapes.length;
        controller.addShapes([pointShape, labelShape]);
        if (autoSelect) {
            controller.selectPointByIndex(newPointIndex);
        }
    }, [controller]);


    const DBL_CLICK_MS = 300;
    const DBL_CLICK_DIST = 6;

    const handleWallClick = (wx: number, wy: number) => {
        const snapped = snapToGrid(wx, wy);

        const last = lastWallClickRef.current;
        const now = Date.now();
        if (
            last &&
            now - last.t < DBL_CLICK_MS &&
            Math.hypot(snapped.x - last.x, snapped.y - last.y) <= DBL_CLICK_DIST
        ) {
            controller.removeTemporaryShapes();
            setWallPoly([]);
            lastWallClickRef.current = null;
            setTick(t => t + 1);
            return;
        }

        lastWallClickRef.current = { t: now, x: snapped.x, y: snapped.y };

        if (wallPoly.length === 0) {
            setWallPoly([snapped]);
        } else {
            const prev = wallPoly[wallPoly.length - 1];
            controller.removeTemporaryShapes();
            controller.addShape({
                type: "wall",
                points: [prev.x, prev.y, snapped.x, snapped.y],
                stroke: wallStyle.stroke,
                strokeWidth: wallStyle.strokeWidth,
            });
            setWallPoly(poly => [...poly, snapped]);
        }
    };

    const handleBoundaryClick = (bx: number, by: number) => {
        if (!selectedMaterial) return;

        const last = lastBoundaryClickRef.current;
        const now = Date.now();
        if (
            last &&
            now - last.t < DBL_CLICK_MS &&
            Math.hypot(bx - last.x, by - last.y) <= DBL_CLICK_DIST
        ) {
            controller.removeTemporaryShapes();
            if (boundaryPoly.length >= 3) {
                const pts: number[] = [];
                for (const v of boundaryPoly) { pts.push(v.x, v.y); }
                controller.addShape({
                    type: "boundary",
                    points: pts,
                    materialId: selectedMaterial.id,
                    name: selectedMaterial.name,
                    offset: selectedMaterial.offset,
                    color: selectedMaterial.color,
                    fillOpacity: selectedMaterial.fillOpacity ?? 0.25,
                });
            }
            setBoundaryPoly([]);
            lastBoundaryClickRef.current = null;
            setTick(t => t + 1);
            return;
        }

        lastBoundaryClickRef.current = { t: now, x: bx, y: by };
        setBoundaryPoly(poly => [...poly, { x: bx, y: by }]);
    };


    // Mouse down / move / up

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const evt = e.evt;

        if (evt.button === 1 || spaceHeld) {
            evt.preventDefault();
            panStateRef.current = {
                active: true,
                moved: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startStageX: stage.x(),
                startStageY: stage.y(),
                triggeredBy: evt.button === 1 ? "middle" : "space",
            };
            stage.container().style.cursor = "grabbing";
            return;
        }

        if (evt.button !== 0) return;

        const pointerPosition = stage.getRelativePointerPosition();
        if (!pointerPosition) return;

        switch (tool) {
            case "draw_point": {
                const target = evt.altKey
                    ? snapToGrid(pointerPosition.x, pointerPosition.y)
                    : { x: pointerPosition.x, y: pointerPosition.y };
                const existing = controller.findPointIndexAt(target.x, target.y, HIT_TOLERANCE_WORLD);
                if (existing !== -1) {
                    controller.selectPointByIndex(existing);
                } else {
                    addPoint(target.x, target.y, getPointHeight ? getPointHeight() : 0);
                }
                break;
            }
            case "draw_wall":
                handleWallClick(pointerPosition.x, pointerPosition.y);
                break;
            case "draw_boundary":
                if (selectedMaterial) {
                    const target = evt.altKey
                        ? snapToGrid(pointerPosition.x, pointerPosition.y)
                        : { x: pointerPosition.x, y: pointerPosition.y };
                    handleBoundaryClick(target.x, target.y);
                }
                break;
            case "select": {
                const scale = stage.scaleX() || 1;
                const hitTolerance = Math.max(HIT_TOLERANCE_WORLD, 10 / scale);
                const idx = controller.findPointIndexAt(pointerPosition.x, pointerPosition.y, hitTolerance);
                if (idx !== -1) {
                    controller.selectPointByIndex(idx);
                    pointDragRef.current = {
                        active: true,
                        index: idx,
                        startClientX: evt.clientX,
                        startClientY: evt.clientY,
                        moved: false,
                        snapshotted: false,
                    };
                    stage.container().style.cursor = "grabbing";
                } else {
                    panStateRef.current = {
                        active: true,
                        moved: false,
                        startClientX: evt.clientX,
                        startClientY: evt.clientY,
                        startStageX: stage.x(),
                        startStageY: stage.y(),
                        triggeredBy: "select",
                    };
                    stage.container().style.cursor = "grabbing";
                }
                break;
        }
    }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const evt = e.evt;

        setPointerScreen({ x: evt.clientX, y: evt.clientY });

        const pointDrag = pointDragRef.current;
        if (pointDrag?.active) {
            const ddx = evt.clientX - pointDrag.startClientX;
            const ddy = evt.clientY - pointDrag.startClientY;
            if (!pointDrag.moved && Math.hypot(ddx, ddy) < DRAG_THRESHOLD_PX) {
                return;
            }
            if (!pointDrag.snapshotted) {
                controller.snapshotForUndo();
                pointDrag.snapshotted = true;
            }
            pointDrag.moved = true;
            const pointer = stage.getRelativePointerPosition();
            if (!pointer) return;
            const target = evt.altKey
                ? snapToGrid(pointer.x, pointer.y)
                : { x: pointer.x, y: pointer.y };
            controller.movePointTo(pointDrag.index, target.x, target.y);
            return;
        }

        const pan = panStateRef.current;
        if (pan?.active) {
            const dx = evt.clientX - pan.startClientX;
            const dy = evt.clientY - pan.startClientY;
            if (!pan.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
                pan.moved = true;
            }
            stage.position({ x: pan.startStageX + dx, y: pan.startStageY + dy });
            stage.batchDraw();
            setViewport({ scale: stage.scaleX(), x: stage.x(), y: stage.y() });
            return;
        }

        const pointerPosition = stage.getRelativePointerPosition();
        if (!pointerPosition) return;

        if (tool === "draw_wall" && wallPoly.length > 0) {
            const prev = wallPoly[wallPoly.length - 1];
            const snapped = snapToGrid(pointerPosition.x, pointerPosition.y);
            controller.removeTemporaryShapes();
            controller.shapes.push({
                type: "wall",
                points: [prev.x, prev.y, snapped.x, snapped.y],
                stroke: wallStyle.stroke,
                strokeWidth: wallStyle.strokeWidth,
                temporary: true,
            });
            setTick(t => t + 1);
        }

        if (tool === "draw_boundary" && boundaryPoly.length > 0 && selectedMaterial) {
            const rawCursor = pointerPosition;
            const cursor = evt.altKey
                ? snapToGrid(rawCursor.x, rawCursor.y)
                : rawCursor;
            const pts: number[] = [];
            for (const v of boundaryPoly) { pts.push(v.x, v.y); }
            pts.push(cursor.x, cursor.y);
            controller.removeTemporaryShapes();
            controller.shapes.push({
                type: "boundary",
                points: pts,
                materialId: selectedMaterial.id,
                name: selectedMaterial.name,
                offset: selectedMaterial.offset,
                color: selectedMaterial.color,
                fillOpacity: selectedMaterial.fillOpacity ?? 0.25,
                temporary: true,
            });
            setTick(t => t + 1);
        }
    };

    const restoreCursor = () => {
        const stage = stageRef.current;
        if (!stage) return;
        const container = stage.container();
        if (spaceHeld) {
            container.style.cursor = "grab";
        } else if (tool === "draw_point" || tool === "draw_wall" || tool === "draw_boundary") {
            container.style.cursor = "crosshair";
        } else {
            container.style.cursor = "default";
        }
    };

    const handleMouseUp = () => {
        const pointDrag = pointDragRef.current;
        if (pointDrag?.active) {
            pointDragRef.current = null;
            restoreCursor();
            return;
        }

        const pan = panStateRef.current;
        if (pan?.active) {
            const wasSelect = pan.triggeredBy === "select";
            const moved = pan.moved;
            panStateRef.current = null;
            if (wasSelect && !moved) {
                controller.clearSelection();
            }
            restoreCursor();
        }
    };


    // Wheel: zoom or height adjust

    const applyZoom = useCallback((stage: Konva.Stage, factor: number, anchorScreen: { x: number; y: number }) => {
        const oldScale = stage.scaleX();
        let newScale = oldScale * factor;
        newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        if (newScale === oldScale) return;

        const mousePointTo = {
            x: anchorScreen.x / oldScale - stage.x() / oldScale,
            y: anchorScreen.y / oldScale - stage.y() / oldScale,
        };

        stage.scale({ x: newScale, y: newScale });
        const newPos = {
            x: -(mousePointTo.x - anchorScreen.x / newScale) * newScale,
            y: -(mousePointTo.y - anchorScreen.y / newScale) * newScale,
        };
        stage.position(newPos);
        stage.batchDraw();
        setViewport({ scale: newScale, x: newPos.x, y: newPos.y });
    }, []);

    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;

        if (controller.hasSelectedPoint()) {
            const direction: 1 | -1 = e.evt.deltaY < 0 ? 1 : -1;
            controller.bumpSelectedHeight(direction, 0.1);
            return;
        }

        const anchor = stage.getPointerPosition();
        if (!anchor) return;
        const factor = Math.exp(-e.evt.deltaY * 0.0015);
        applyZoom(stage, factor, anchor);
    };


    // Keyboard

    const frameAll = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const [minX, minY, maxX, maxY] = controller.communicator.getBounds();
        if (!isFinite(minX) || !isFinite(maxX) || minX === maxX) {
            stage.scale({ x: 1, y: 1 });
            stage.position({ x: 0, y: 0 });
            stage.batchDraw();
            setViewport({ scale: 1, x: 0, y: 0 });
            return;
        }
        const margin = 40;
        const w = stageDimensions.width;
        const h = stageDimensions.height;
        if (w <= 0 || h <= 0) return;
        const scaleX = (w - margin * 2) / (maxX - minX);
        const scaleY = (h - margin * 2) / (maxY - minY);
        let scale = Math.min(scaleX, scaleY);
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const posX = w / 2 - cx * scale;
        const posY = h / 2 - cy * scale;
        stage.scale({ x: scale, y: scale });
        stage.position({ x: posX, y: posY });
        stage.batchDraw();
        setViewport({ scale, x: posX, y: posY });
    }, [controller, stageDimensions]);

    const zoomCenter = useCallback((factor: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        applyZoom(stage, factor, { x: stageDimensions.width / 2, y: stageDimensions.height / 2 });
    }, [applyZoom, stageDimensions]);

    const setScaleAbsolute = useCallback((newScale: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        const anchor = { x: stageDimensions.width / 2, y: stageDimensions.height / 2 };
        const oldScale = stage.scaleX() || 1;
        const mousePointTo = {
            x: anchor.x / oldScale - stage.x() / oldScale,
            y: anchor.y / oldScale - stage.y() / oldScale,
        };
        stage.scale({ x: clamped, y: clamped });
        const newPos = {
            x: -(mousePointTo.x - anchor.x / clamped) * clamped,
            y: -(mousePointTo.y - anchor.y / clamped) * clamped,
        };
        stage.position(newPos);
        stage.batchDraw();
        setViewport({ scale: clamped, x: newPos.x, y: newPos.y });
    }, [stageDimensions]);

    const panToWorld = useCallback((worldX: number, worldY: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        const scale = stage.scaleX() || 1;
        const newX = stageDimensions.width / 2 - worldX * scale;
        const newY = stageDimensions.height / 2 - worldY * scale;
        stage.position({ x: newX, y: newY });
        stage.batchDraw();
        setViewport({ scale, x: newX, y: newY });
    }, [stageDimensions]);

    const handleContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        const scale = stage.scaleX() || 1;

        const boundaryTol = Math.max(6, 10 / scale);
        const boundaryIdx = controller.findBoundaryIndexAt(pointer.x, pointer.y, boundaryTol);
        if (boundaryIdx !== -1) {
            const b = controller.shapes[boundaryIdx] as MaterialBoundaryShape;
            setContextMenu({
                x: e.evt.clientX,
                y: e.evt.clientY,
                items: [
                    {
                        id: "delete-boundary",
                        label: `Delete boundary (${b.name})`,
                        destructive: true,
                        onSelect: () => { controller.removeShape(boundaryIdx); },
                    },
                ],
            });
            return;
        }

        const wallTol = Math.max(6, 8 / scale);
        const wallIdx = controller.findWallIndexAt(pointer.x, pointer.y, wallTol);

        if (wallIdx !== -1) {
            setContextMenu({
                x: e.evt.clientX,
                y: e.evt.clientY,
                items: [
                    {
                        id: "delete-wall",
                        label: "Delete wall",
                        destructive: true,
                        onSelect: () => {
                            controller.removeShape(wallIdx);
                        },
                    },
                ],
            });
            return;
        }

        const pointTol = Math.max(HIT_TOLERANCE_WORLD, 10 / scale);
        const pointIdx = controller.findPointIndexAt(pointer.x, pointer.y, pointTol);
        if (pointIdx !== -1) {
            setContextMenu({
                x: e.evt.clientX,
                y: e.evt.clientY,
                items: [
                    {
                        id: "delete-point",
                        label: "Delete point",
                        destructive: true,
                        onSelect: () => {
                            controller.selectPointByIndex(pointIdx);
                            controller.removeSelectedShapes();
                        },
                    },
                ],
            });
            return;
        }

        setContextMenu(null);
    };

    const isTypingInField = (): boolean => {
        const el = document.activeElement;
        if (!el) return false;
        if (el instanceof HTMLInputElement) return true;
        if (el instanceof HTMLTextAreaElement) return true;
        const tag = (el as HTMLElement).tagName;
        return tag === "INPUT" || tag === "TEXTAREA";
    };

    const injectExampleShapes = useCallback(() => {
        if (exampleInjected) return;

        const examplePoints: number[][] = [
            [820.37, 776.40, 2.7], [789.55, 741.55, 2.7], [833.77, 720.11, 2.7],
            [756.05, 704.03, 2.4], [777.49, 661.15, 2.4], [836.45, 649.09, 2.4],
            [802.95, 598.16, 2.4], [725.23, 610.23, 2.4], [691.72, 669.19, 2.4],
            [675.64, 728.15, 2.4], [734.61, 783.10, 2.4],
            [644.82, 603.52, 2.1], [737.29, 541.88, 2.1], [690.38, 476.22, 2.1],
            [674.30, 531.16, 2.1], [607.30, 549.92, 2.1], [481.33, 511.06, 2.1],
            [443.81, 423.95, 2.1], [516.17, 385.09, 2.1], [588.54, 389.11, 2.1],
            [638.12, 434.67, 2.1], [739.97, 498.99, 2.1], [824.39, 557.96, 2.1],
            [640.80, 768.36, 2.1], [596.58, 679.91, 2.1], [564.41, 623.63, 2.1],
            [484.01, 561.98, 2.1], [404.94, 494.98, 2.1], [367.42, 417.25, 2.1],
            [331.24, 460.13, 2.1], [339.28, 517.76, 2.1], [382.16, 549.92, 2.1],
            [445.15, 600.84, 2.1], [486.69, 653.11, 2.1], [508.13, 724.13, 2.1],
            [559.05, 793.82, 2.1], [634.10, 292.62, 2.1], [831.09, 500.34, 2.1],
            [786.87, 465.49, 2.1], [743.99, 426.63, 2.1], [656.88, 379.73, 2.1],
            [643.48, 346.23, 2.1], [564.41, 272.52, 2.1], [514.83, 320.76, 2.1],
            [461.23, 367.67, 2.1], [327.22, 385.09, 2.1], [102.08, 318.08, 2.1],
            [250.83, 319.42, 2.1], [308.46, 293.96, 2.1], [358.04, 328.80, 2.1],
            [433.08, 306.02, 2.1], [536.27, 155.93, 2.1], [484.01, 210.88, 2.1],
            [572.45, 218.92, 2.1], [623.38, 204.18, 2.1], [623.38, 134.49, 2.1],
            [623.38, 74.19, 2.1],
            [548.33, 496.32, 1.7], [580.50, 456.11, 1.7], [596.58, 489.62, 1.7],
            [502.77, 484.26, 1.7], [492.05, 445.39, 1.7], [536.27, 431.99, 1.7],
            [829.75, 440.03, 1.7], [770.79, 410.55, 1.7], [689.04, 343.55, 1.7],
            [668.94, 251.08, 1.7], [540.29, 91.61, 1.7], [411.64, 252.42, 1.7],
            [178.47, 296.64, 1.7], [250.83, 571.36, 1.7], [359.38, 598.16, 1.7],
            [407.62, 675.89, 1.7], [442.47, 758.98, 1.7], [446.49, 776.40, 1.7],
            [262.89, 655.79, 1.7],
            [457.21, 74.19, 1.6], [431.74, 134.49, 1.6], [390.20, 177.37, 1.6],
            [319.18, 224.28, 1.6], [266.91, 244.38, 1.6], [166.41, 261.80, 1.6],
            [90.02, 268.50, 1.6], [383.50, 54.09, 1.6], [367.42, 88.93, 1.6],
            [344.64, 123.77, 1.6], [311.14, 155.93, 1.6], [272.27, 189.43, 1.6],
            [190.53, 208.20, 1.6], [84.66, 221.60, 1.6], [844.49, 375.71, 1.6],
            [781.51, 359.63, 1.6], [749.35, 338.19, 1.6], [726.57, 284.58, 1.6],
            [711.82, 249.74, 1.6], [79.30, 571.36, 1.6], [146.30, 596.82, 1.6],
            [209.29, 608.88, 1.6], [282.99, 620.95, 1.6], [331.24, 655.79, 1.6],
            [356.70, 734.85, 1.6], [352.68, 783.10, 1.6], [307.12, 780.42, 1.6],
            [292.37, 730.83, 1.6], [265.57, 694.65, 1.6], [187.85, 667.85, 1.6],
            [107.44, 646.41, 1.6],
            [161.05, 779.08, 1.3], [218.67, 788.46, 1.3], [203.93, 761.66, 1.3],
            [165.07, 724.13, 1.3], [107.44, 704.03, 1.3], [91.36, 754.96, 1.3],
            [98.06, 792.48, 1.3], [781.51, 316.74, 1.3], [836.45, 324.78, 1.3],
            [806.97, 276.54, 1.3], [749.35, 253.76, 1.3], [829.75, 241.70, 1.3],
            [270.93, 109.03, 1.3], [161.05, 68.83, 1.3], [273.61, 48.72, 1.3],
            [195.89, 90.27, 1.3], [155.69, 150.57, 1.3], [88.68, 174.69, 1.3],
            [90.02, 117.07, 1.3], [104.76, 52.75, 1.3],
        ];

        for (const p of examplePoints) {
            addPoint(p[0], p[1], p[2], false);
        }

        const exampleWallPoints: number[][] = [
            [60, 820, 860, 820], [860, 820, 860, 220], [860, 220, 660, 220],
            [660, 220, 660, 20], [660, 20, 60, 20], [60, 20, 60, 340],
            [60, 340, 300, 340], [300, 340, 300, 540], [300, 540, 60, 540],
            [60, 540, 60, 820],
        ];

        for (const w of exampleWallPoints) {
            controller.addShape({
                type: "wall",
                points: w,
                stroke: wallStyle.stroke,
                strokeWidth: wallStyle.strokeWidth,
            });
        }

        setExampleInjected(true);
    }, [exampleInjected, controller, addPoint]);


    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.code === "Space" && !spaceHeld && !isTypingInField()) {
            e.preventDefault();
            setSpaceHeld(true);
        }

        if (isTypingInField()) return;

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            controller.undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            controller.redo();
            return;
        }

        if (e.ctrlKey || e.metaKey) return;

        if (e.key === "Escape") {
            if (tool === "draw_wall" && wallPoly.length > 0) {
                setWallPoly([]);
                lastWallClickRef.current = null;
                controller.removeTemporaryShapes();
                setTick(t => t + 1);
            } else if (tool === "draw_boundary" && boundaryPoly.length > 0) {
                setBoundaryPoly([]);
                lastBoundaryClickRef.current = null;
                controller.removeTemporaryShapes();
                setTick(t => t + 1);
            } else {
                controller.clearSelection();
            }
            return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
            if (tool === "draw_wall" && wallPoly.length > 0) {
                e.preventDefault();
                if (wallPoly.length >= 2) {
                    const lastWallIdx = (() => {
                        for (let i = controller.shapes.length - 1; i >= 0; i--) {
                            const s = controller.shapes[i];
                            if (s.type === "wall" && !s.temporary) return i;
                        }
                        return -1;
                    })();
                    if (lastWallIdx !== -1) {
                        controller.removeShape(lastWallIdx);
                    }
                    setWallPoly(poly => poly.slice(0, -1));
                    const newLast = wallPoly[wallPoly.length - 2];
                    lastWallClickRef.current = { t: 0, x: newLast.x, y: newLast.y };
                } else {
                    setWallPoly([]);
                    lastWallClickRef.current = null;
                }
                controller.removeTemporaryShapes();
                setTick(t => t + 1);
                return;
            }
            if (tool === "draw_boundary" && boundaryPoly.length > 0) {
                e.preventDefault();
                if (boundaryPoly.length >= 2) {
                    setBoundaryPoly(poly => poly.slice(0, -1));
                    const newLast = boundaryPoly[boundaryPoly.length - 2];
                    lastBoundaryClickRef.current = { t: 0, x: newLast.x, y: newLast.y };
                } else {
                    setBoundaryPoly([]);
                    lastBoundaryClickRef.current = null;
                }
                controller.removeTemporaryShapes();
                setTick(t => t + 1);
                return;
            }
            controller.removeSelectedShapes();
            return;
        }

        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            if (controller.hasSelectedPoint()) {
                const direction: 1 | -1 =
                    (e.key === "ArrowUp" || e.key === "ArrowRight") ? 1 : -1;
                controller.bumpSelectedHeight(direction, 0.1);
            }
            return;
        }

        if (e.key === "?" || (e.shiftKey && e.key === "/")) {
            e.preventDefault();
            setGuideOpen(!guideOpen);
            return;
        }

        const lower = e.key.toLowerCase();
        if (lower === "v" || lower === "s") { setTool("select"); return; }
        if (lower === "w") { setTool("draw_wall"); return; }
        if (lower === "p") { setTool("draw_point"); return; }
        if (lower === "b") { setTool("draw_boundary"); return; }
        if (lower === "g") { setShowMajorGrid(!showMajorGrid); return; }
        if (lower === "m") { setShowMinimap(!showMinimap); return; }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomCenter(1.1); return; }
        if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomCenter(1 / 1.1); return; }
        if (lower === "f" || e.key === "0") { e.preventDefault(); frameAll(); return; }

        if (e.key === '\\') {
            injectExampleShapes();
        }
    }, [tool, wallPoly, boundaryPoly, controller, setTool, zoomCenter, frameAll, spaceHeld, showMajorGrid, setShowMajorGrid, showMinimap, setShowMinimap, guideOpen, setGuideOpen, injectExampleShapes]);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.code === "Space") {
            setSpaceHeld(false);
            if (panStateRef.current?.active && panStateRef.current.triggeredBy === "space") {
                panStateRef.current = null;
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    useEffect(() => {
        const onBlur = () => {
            setSpaceHeld(false);
        };
        window.addEventListener('blur', onBlur);
        return () => window.removeEventListener('blur', onBlur);
    }, []);


    // Live height readout shown while a point is selected

    const selectedZ = controller.getFirstSelectedHeight();

    useEffect(() => {
        if (!onActiveHeightChange) return;
        if (selectedZ === null) return;
        onActiveHeightChange(selectedZ);
    }, [selectedZ, onActiveHeightChange]);


    // Compute highest / lowest elevation points from the current scene.
    const highLow = (() => {
        let high: PointShape | null = null;
        let low: PointShape | null = null;
        for (const s of controller.shapes) {
            if (s.type !== "point") continue;
            if (high === null || s.z > high.z) high = s;
            if (low === null || s.z < low.z) low = s;
        }
        const differential = high && low ? high.z - low.z : null;
        return { high, low, differential };
    })();

    useEffect(() => {
        if (!onHighLowChange) return;
        onHighLowChange(highLow.high, highLow.low, highLow.differential);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highLow.high?.tieid, highLow.low?.tieid, highLow.high?.z, highLow.low?.z, onHighLowChange]);

    useEffect(() => {
        if (!apiRef) return;
        apiRef.current = {
            getShapes: () => controller.shapes.filter(s => !(s.type === "wall" && s.temporary)),
            loadShapes: (shapes: Shape[]) => controller.loadShapes(shapes),
            getStageDataURL: (pixelRatio = 2) => {
                const stage = stageRef.current;
                if (!stage) return null;
                return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
            },
            getStageSize: () => ({
                width: stageDimensions.width,
                height: stageDimensions.height,
            }),
            getExportImage: (pixelRatio = 3) => {
                const stage = stageRef.current;
                if (!stage) return null;

                const layers = stage.getLayers();
                const gridLayer = layers[0];
                const gridWasVisible = gridLayer?.visible() ?? true;

                const prevScale = stage.scaleX() || 1;
                const prevX = stage.x();
                const prevY = stage.y();

                try {
                    if (gridLayer) gridLayer.visible(false);

                    const [minX, minY, maxX, maxY] = controller.communicator.getBounds();
                    const w = stageDimensions.width;
                    const h = stageDimensions.height;

                    const hasContent =
                        isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY) &&
                        maxX > minX && maxY > minY && w > 0 && h > 0;

                    if (!hasContent) {
                        stage.batchDraw();
                        const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
                        return { dataUrl, width: w || 1, height: h || 1 };
                    }

                    const margin = 24;
                    const bboxW = maxX - minX;
                    const bboxH = maxY - minY;
                    const fitScaleX = (w - margin * 2) / bboxW;
                    const fitScaleY = (h - margin * 2) / bboxH;
                    const fitScale = Math.min(
                        MAX_SCALE,
                        Math.max(MIN_SCALE, Math.min(fitScaleX, fitScaleY)),
                    );
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;
                    const posX = w / 2 - cx * fitScale;
                    const posY = h / 2 - cy * fitScale;

                    stage.scale({ x: fitScale, y: fitScale });
                    stage.position({ x: posX, y: posY });
                    stage.draw();

                    const padPx = 16;
                    const sxRaw = minX * fitScale + posX - padPx;
                    const syRaw = minY * fitScale + posY - padPx;
                    const swRaw = bboxW * fitScale + padPx * 2;
                    const shRaw = bboxH * fitScale + padPx * 2;
                    const sx = Math.max(0, sxRaw);
                    const sy = Math.max(0, syRaw);
                    const sw = Math.max(1, Math.min(w - sx, swRaw - (sx - sxRaw)));
                    const sh = Math.max(1, Math.min(h - sy, shRaw - (sy - syRaw)));

                    const dataUrl = stage.toDataURL({
                        x: sx,
                        y: sy,
                        width: sw,
                        height: sh,
                        pixelRatio,
                        mimeType: "image/png",
                    });
                    return { dataUrl, width: sw, height: sh };
                } finally {
                    stage.scale({ x: prevScale, y: prevScale });
                    stage.position({ x: prevX, y: prevY });
                    if (gridLayer) gridLayer.visible(gridWasVisible);
                    stage.batchDraw();
                }
            },
            getLegendRange: () => {
                if (contourData && Array.isArray(contourData.heights) && contourData.heights.length > 0) {
                    const hs = contourData.heights;
                    const lo = Math.min(...hs);
                    const hi = Math.max(...hs);
                    if (isFinite(lo) && isFinite(hi) && hi > lo) return { minZ: lo, maxZ: hi };
                }
                return null;
            },
            getLegendLevels: () => {
                if (contourData && Array.isArray(contourData.heights) && contourData.heights.length > 0) {
                    const hs = [...contourData.heights].filter(v => isFinite(v));
                    if (hs.length < 2) return null;
                    hs.sort((a, b) => a - b);
                    return hs;
                }
                return null;
            },
            getHighLow: () => {
                let high: PointShape | null = null;
                let low: PointShape | null = null;
                for (const s of controller.shapes) {
                    if (s.type !== "point") continue;
                    if (high === null || s.z > high.z) high = s;
                    if (low === null || s.z < low.z) low = s;
                }
                const differential = high && low ? high.z - low.z : null;
                return { high, low, differential };
            },
            updateBoundaryMaterial: (materialId, name, offset, color, fillOpacity) => {
                controller.updateBoundaryMaterial(materialId, name, offset, color, fillOpacity);
            },
        };
        return () => {
            if (apiRef) apiRef.current = null;
        };
    }, [apiRef, controller, contourData, stageDimensions.width, stageDimensions.height]);


    // Render

    return (
        <div
            ref={containerRef}
            className="fls-canvas-wrapper"
            style={{ width: '100%', height: '100%', minHeight: 360 }}>

            <div className="fls-floating-toolbar" role="toolbar" aria-label="History">
                <button
                    type="button"
                    className="fls-icon-btn"
                    onClick={() => controller.undo()}
                    disabled={!controller.canUndo()}
                    title="Undo (Ctrl+Z)"
                    aria-label="Undo">
                    <UndoIcon />
                </button>
                <button
                    type="button"
                    className="fls-icon-btn"
                    onClick={() => controller.redo()}
                    disabled={!controller.canRedo()}
                    title="Redo (Ctrl+Y)"
                    aria-label="Redo">
                    <RedoIcon />
                </button>
            </div>

            {showMinimap && (
                <Minimap
                    shapes={controller.shapes}
                    viewport={{
                        width: stageDimensions.width,
                        height: stageDimensions.height,
                        scale: viewport.scale,
                        offsetX: viewport.x,
                        offsetY: viewport.y,
                    }}
                    onPanTo={panToWorld}
                    version={controller.version}
                />
            )}

            <ZoomControl
                scale={viewport.scale}
                minScale={MIN_SCALE}
                maxScale={MAX_SCALE}
                onZoomBy={zoomCenter}
                onSetScale={setScaleAbsolute}
                onFrameAll={frameAll}
            />

            <Stage
                ref={stageRef as React.Ref<Konva.Stage>}
                width={stageDimensions.width}
                height={stageDimensions.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
                onWheel={handleWheel}>

                <GridLayer
                    width={stageDimensions.width}
                    height={stageDimensions.height}
                    scale={viewport.scale}
                    offsetX={viewport.x}
                    offsetY={viewport.y}
                    showMajor={showMajorGrid}
                />

                <ContourLayer
                    data={contourData}
                    startColor={contourStartColor}
                    endColor={contourEndColor}
                    showFill={contourFill}
                />

                {/* Material boundary regions — rendered below walls/points */}
                <Layer listening={false} visible={showBoundaries}>
                    {(controller.shapes.filter((s): s is MaterialBoundaryShape => s.type === "boundary")).map((b, i) => {
                        const invScale = 1 / Math.max(0.01, viewport.scale);
                        const strokeW = 1.4 * invScale;
                        const dashLen = 6 * invScale;
                        const dashGap = 4 * invScale;
                        const pts = b.points;
                        const n = pts.length / 2;
                        let cx = 0, cy = 0;
                        for (let k = 0; k < n; k++) { cx += pts[k * 2]; cy += pts[k * 2 + 1]; }
                        cx /= Math.max(1, n);
                        cy /= Math.max(1, n);
                        const fs = 11 * invScale;
                        const isClosed = !b.temporary;
                        return (
                            <Group key={`b-${i}`} listening={false}>
                                <Line
                                    points={pts}
                                    closed={isClosed}
                                    stroke={b.color}
                                    strokeWidth={strokeW}
                                    dash={[dashLen, dashGap]}
                                    fill={isClosed
                                        ? hexToRgba(b.color, b.fillOpacity)
                                        : "transparent"}
                                    opacity={isClosed ? 1 : 0.7}
                                    fillEnabled={isClosed}
                                    strokeScaleEnabled={false}
                                    listening={false}
                                    perfectDrawEnabled={false}
                                />
                                {isClosed && (
                                    <Group x={cx} y={cy} listening={false}>
                                        <Text
                                            text={b.name}
                                            fontSize={fs}
                                            fill={b.color}
                                            align="center"
                                            offsetX={0}
                                            offsetY={fs * 0.6}
                                            fontStyle="bold"
                                            fontFamily="Arial, Helvetica, sans-serif"
                                            listening={false}
                                            opacity={0.85}
                                        />
                                        <Text
                                            text={`offset: ${b.offset >= 0 ? "+" : ""}${b.offset.toFixed(2)}`}
                                            fontSize={fs * 0.82}
                                            fill={b.color}
                                            align="center"
                                            offsetX={0}
                                            offsetY={-fs * 0.2}
                                            fontFamily="Arial, Helvetica, sans-serif"
                                            listening={false}
                                            opacity={0.75}
                                        />
                                    </Group>
                                )}
                            </Group>
                        );
                    })}
                </Layer>

                <Layer>
                    {controller.getShapesAsShapeData().map((shape, index) => {
                        if (!shape) return null;
                        switch (shape.type) {
                            case "circle":
                                return <Circle key={index} x={shape.x} y={shape.y} radius={shape.radius} fill={shape.fill} />;
                            case "line":
                                return <Line key={index} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
                            case "text":
                                return (
                                    <Text
                                        key={index}
                                        x={shape.x}
                                        y={shape.y}
                                        text={shape.text}
                                        fontSize={shape.fontSize}
                                        fill={shape.fill}
                                        fontFamily={shape.fontFamily}
                                        stroke={shape.stroke}
                                        strokeWidth={shape.strokeWidth}
                                        fillAfterStrokeEnabled
                                    />
                                );
                        }
                    })}
                </Layer>

                <Layer listening={false}>
                    {(() => {
                        const invScale = 1 / Math.max(0.001, viewport.scale);
                        const markers: React.ReactNode[] = [];
                        const renderMarker = (
                            p: PointShape,
                            letter: "H" | "L",
                            fill: string,
                            stroke: string,
                            text: string,
                            key: string,
                        ) => {
                            const radius = 13;
                            const offsetY = -26;
                            markers.push(
                                <Group key={key} x={p.x} y={p.y} listening={false}>
                                    <Line
                                        points={[0, offsetY * invScale, 0, -2 * invScale]}
                                        stroke={stroke}
                                        strokeWidth={1.5 * invScale}
                                        dash={[3 * invScale, 2 * invScale]}
                                        listening={false}
                                        perfectDrawEnabled={false}
                                    />
                                    <Group
                                        x={0}
                                        y={offsetY * invScale}
                                        scaleX={invScale}
                                        scaleY={invScale}
                                        listening={false}>
                                        <Circle
                                            radius={radius}
                                            fill={fill}
                                            stroke={stroke}
                                            strokeWidth={2}
                                            shadowColor="rgba(15,23,42,0.25)"
                                            shadowBlur={4}
                                            shadowOffsetY={1}
                                            shadowOpacity={0.9}
                                            listening={false}
                                            perfectDrawEnabled={false}
                                        />
                                        <Text
                                            x={-radius}
                                            y={-radius}
                                            width={radius * 2}
                                            height={radius * 2}
                                            align="center"
                                            verticalAlign="middle"
                                            text={letter}
                                            fontSize={15}
                                            fontStyle="bold"
                                            fontFamily="Arial, Helvetica, sans-serif"
                                            fill={text}
                                            listening={false}
                                        />
                                    </Group>
                                </Group>,
                            );
                        };
                        if (highLow.high && highLow.low && highLow.high.tieid !== highLow.low.tieid) {
                            renderMarker(highLow.high, "H", "#fee2e2", "#b91c1c", "#7f1d1d", "hl-high");
                            renderMarker(highLow.low, "L", "#dbeafe", "#1d4ed8", "#1e3a8a", "hl-low");
                        }
                        return markers;
                    })()}
                </Layer>
            </Stage>

            {contourFill && contourData && contourData.heights?.length > 0 && (
                <ContourLegend
                    startColor={contourStartColor}
                    endColor={contourEndColor}
                    minZ={Math.min(...contourData.heights)}
                    maxZ={Math.max(...contourData.heights)}
                    levels={contourData.heights}
                />
            )}

            {selectedZ !== null && pointerScreen && (
                <div
                    className="fls-height-readout"
                    style={{ left: pointerScreen.x + 14, top: pointerScreen.y + 14 }}>
                    z = {selectedZ.toFixed(2)}
                    <span className="fls-height-hint">scroll to adjust</span>
                </div>
            )}

            <div className="fls-view-toggles" role="group" aria-label="View toggles">
                <label className="fls-view-toggle">
                    <input
                        type="checkbox"
                        checked={showMinimap}
                        onChange={e => setShowMinimap(e.target.checked)}
                    />
                    <span>Show map</span>
                </label>
                <label className="fls-view-toggle">
                    <input
                        type="checkbox"
                        checked={showMajorGrid}
                        onChange={e => setShowMajorGrid(e.target.checked)}
                    />
                    <span>Show major grid</span>
                </label>
                <label className="fls-view-switch" title="Toggle contour color fill">
                    <span className="fls-view-switch-label">Color fill</span>
                    <span
                        className={`fls-view-switch-track${contourFill ? " is-on" : ""}`}
                        aria-hidden="true">
                        <input
                            type="checkbox"
                            className="fls-view-switch-input"
                            checked={contourFill}
                            onChange={e => setContourFill(e.target.checked)}
                            aria-label="Toggle contour color fill"
                        />
                        <span className="fls-view-switch-thumb" />
                    </span>
                </label>
            </div>

            <ShortcutGuide open={guideOpen} onOpenChange={setGuideOpen} />

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
}


export default FloorLevelSurvey;
