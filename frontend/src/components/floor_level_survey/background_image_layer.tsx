import { useEffect, useRef, useState } from "react";
import { Layer, Image as KonvaImage, Transformer, Rect } from "react-konva";
import type Konva from "konva";
import type { FLSBackgroundImage } from "./project_io";


export interface BackgroundImageLayerProps {
    background: FLSBackgroundImage | null;
    /** When true, the image is draggable/transformable; otherwise it's locked
     * and non-interactive so the user can trace on top of it freely. */
    adjustMode: boolean;
    /** Called after a user drag/scale/rotate gesture commits. */
    onChange: (patch: Partial<FLSBackgroundImage>) => void;
}


function BackgroundImageLayer({ background, adjustMode, onChange }: BackgroundImageLayerProps) {
    const imageRef = useRef<Konva.Image | null>(null);
    const trRef = useRef<Konva.Transformer | null>(null);
    const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

    // Load / reload the image whenever the data URL changes.
    useEffect(() => {
        if (!background) { setImgEl(null); return; }
        const img = new Image();
        img.onload = () => setImgEl(img);
        img.onerror = () => setImgEl(null);
        img.src = background.dataUrl;
        return () => { img.onload = null; img.onerror = null; };
    }, [background?.dataUrl]);

    // Attach / detach Transformer
    useEffect(() => {
        const tr = trRef.current;
        if (!tr) return;
        if (adjustMode && imageRef.current) {
            tr.nodes([imageRef.current]);
        } else {
            tr.nodes([]);
        }
        tr.getLayer()?.batchDraw();
    }, [adjustMode, imgEl, background?.dataUrl]);

    if (!background || !background.visible || !imgEl) return null;

    const handleTransformEnd = () => {
        const node = imageRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const newWidth = Math.max(4, node.width() * scaleX);
        const newHeight = Math.max(4, node.height() * scaleY);
        // Reset scale after bake
        node.scaleX(1);
        node.scaleY(1);
        onChange({
            x: node.x(),
            y: node.y(),
            width: newWidth,
            height: newHeight,
            rotation: node.rotation(),
        });
    };

    const handleDragEnd = () => {
        const node = imageRef.current;
        if (!node) return;
        onChange({ x: node.x(), y: node.y() });
    };

    return (
        <Layer listening={adjustMode}>
            {/* Subtle dashed highlight frame when adjusting */}
            {adjustMode && (
                <Rect
                    x={background.x}
                    y={background.y}
                    width={background.width}
                    height={background.height}
                    rotation={background.rotation}
                    stroke="#2563eb"
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    dash={[6, 4]}
                    listening={false}
                    perfectDrawEnabled={false}
                />
            )}
            <KonvaImage
                ref={imageRef as React.Ref<Konva.Image>}
                image={imgEl}
                x={background.x}
                y={background.y}
                width={background.width}
                height={background.height}
                rotation={background.rotation}
                opacity={background.opacity}
                draggable={adjustMode}
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
                perfectDrawEnabled={false}
                listening={adjustMode}
            />
            {adjustMode && (
                <Transformer
                    ref={trRef as React.Ref<Konva.Transformer>}
                    rotateEnabled={true}
                    keepRatio={false}
                    ignoreStroke={true}
                    anchorSize={10}
                    anchorStroke="#2563eb"
                    anchorFill="#ffffff"
                    anchorCornerRadius={2}
                    borderStroke="#2563eb"
                    borderDash={[4, 3]}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 8 || newBox.height < 8) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </Layer>
    );
}


export default BackgroundImageLayer;
