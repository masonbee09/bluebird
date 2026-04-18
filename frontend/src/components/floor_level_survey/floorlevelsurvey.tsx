import { useRef, useState, useEffect, useCallback } from "react";
import type React from "react";
import { Stage, Layer, Line, Circle, Text } from "react-konva";
import type Konva from "konva";
import FLSController from "./flscontroller";
import { wallStyle, pointStyle, heightLabelStyle } from "./style_presets";
import type { Tool, Shape } from "./shape_types";
import GridLayer from "./grid_layer";
import ShortcutGuide from "./shortcut_guide";
import Minimap from "./minimap";
import ZoomControl from "./zoom_control";
import ContextMenu, { type ContextMenuItem } from "./context_menu";
import { UndoIcon, RedoIcon } from "./tool_icons";
import { snapToGrid } from "./grid_constants";
import ContourLayer, { type ContourData } from "./contour_layer";
import ContourLegend from "./contour_legend";
import "./floorlevelsurvey.css";


export interface FLSApi {
    getShapes: () => Shape[];
    loadShapes: (shapes: Shape[]) => void;
    getStageDataURL: (pixelRatio?: number) => string | null;
    getStageSize: () => { width: number; height: number };
    getLegendRange: () => { minZ: number; maxZ: number } | null;
}


interface FLSProps {
    apiRef?: React.MutableRefObject<FLSApi | null>;
    tool: Tool;
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
}


const MIN_SCALE = 0.05;
const MAX_SCALE = 20;


function FloorLevelSurvey({
    apiRef,
    tool,
    getContourSpacing,
    getPointHeight,
    solveTrigger,
    showMajorGrid,
    setShowMajorGrid,
    showMinimap,
    setShowMinimap,
    guideOpen,
    setGuideOpen,
    contourStartColor,
    contourEndColor,
    contourFill,
    setContourFill,
    onActiveHeightChange,
}: FLSProps) {

    const [, setTick] = useState(0);
    const [controller] = useState(() => new FLSController(() => setTick(t => t + 1), getContourSpacing));

    const [wallPoly, setWallPoly] = useState<{ x: number; y: number }[]>([]);
    const lastWallClickRef = useRef<{ t: number; x: number; y: number } | null>(null);
    const [contourData, setContourData] = useState<ContourData | null>(null);
    const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
    const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    const panStateRef = useRef<{
        active: boolean;
        moved: boolean;
        startClientX: number;
        startClientY: number;
        startStageX: number;
        startStageY: number;
        triggeredBy: "middle" | "select";
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
        } else if (tool === "draw_point" || tool === "draw_wall") {
            container.style.cursor = "crosshair";
        } else {
            container.style.cursor = "default";
        }
    }, [tool, stageDimensions]);


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

    // Mouse down / move / up

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const evt = e.evt;

        if (evt.button === 1) {
            evt.preventDefault();
            panStateRef.current = {
                active: true,
                moved: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startStageX: stage.x(),
                startStageY: stage.y(),
                triggeredBy: "middle",
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
    };

    const restoreCursor = () => {
        const stage = stageRef.current;
        if (!stage) return;
        const container = stage.container();
        if (tool === "draw_point" || tool === "draw_wall") {
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


    // Wheel zoom

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

        const anchor = stage.getPointerPosition();
        if (!anchor) return;
        const factor = Math.exp(-e.evt.deltaY * 0.0015);
        applyZoom(stage, factor, anchor);
    };


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


    // Live height readout shown while a point is selected

    const selectedZ = controller.getFirstSelectedHeight();

    useEffect(() => {
        if (!onActiveHeightChange) return;
        if (selectedZ === null) return;
        onActiveHeightChange(selectedZ);
    }, [selectedZ, onActiveHeightChange]);

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
            getLegendRange: () => {
                if (contourData && Array.isArray(contourData.heights) && contourData.heights.length > 0) {
                    const hs = contourData.heights;
                    const lo = Math.min(...hs);
                    const hi = Math.max(...hs);
                    if (isFinite(lo) && isFinite(hi) && hi > lo) return { minZ: lo, maxZ: hi };
                }
                return null;
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
                    title="Undo"
                    aria-label="Undo">
                    <UndoIcon />
                </button>
                <button
                    type="button"
                    className="fls-icon-btn"
                    onClick={() => controller.redo()}
                    disabled={!controller.canRedo()}
                    title="Redo"
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
            </Stage>

            {contourData && contourData.heights?.length > 0 && (
                <ContourLegend
                    startColor={contourStartColor}
                    endColor={contourEndColor}
                    minZ={Math.min(...contourData.heights)}
                    maxZ={Math.max(...contourData.heights)}
                />
            )}

            {selectedZ !== null && pointerScreen && (
                <div
                    className="fls-height-readout"
                    style={{ left: pointerScreen.x + 14, top: pointerScreen.y + 14 }}>
                    z = {selectedZ.toFixed(2)}
                    <span className="fls-height-hint">selected point</span>
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
