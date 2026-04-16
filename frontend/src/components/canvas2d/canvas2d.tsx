import { useRef, useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { Stage, Layer, Rect, Line, Circle, Text } from "react-konva";
// import { CanvasController } from "./canvas_controller";




interface Canvas2DProps {
    onClick?: (sx: number, sy: number) => any;
    zoomFunctionality?: boolean;
    Shapes?: any[];
    forceScale?: boolean;
    style?: CSSProperties;
}


export default function Canvas2D({ onClick, zoomFunctionality = true, Shapes, forceScale = false, style }: Canvas2DProps) {
    const stageRef = useRef(null);

    if (zoomFunctionality && forceScale) { zoomFunctionality = false }

    const [shapes, setShapes] = useState<any[]>([]);
    // const [scale, setScale] = useState(1);
    // const [centerX, setCenterX] = useState(0);
    // const [centerY, setCenterY] = useState(0);

    const enforcedStyles = {
        height: "100%",
        width: "100%"
    }

    useEffect(() => {
        if (Shapes !== undefined) {
            setShapes(Shapes);
        }
    }, [Shapes])

    const handleClick = (_e: any) => {
        const stage = stageRef.current as any;
        // const pointer = stage.getPointerPosition();
        const pointer = stage.getRelativePointerPosition();

        // let [newX, newY] = screenToWorld(pointer.x, pointer.y, stage.scaleX(), stage.x(), stage.y())

        // Example: Add a small square where the user clicked
        if (onClick) {
            setShapes(prev => [...prev, onClick(pointer.x, pointer.y)]);
        }
    };


    const containerRef = useRef<HTMLDivElement>(null);
    const [stageDimensions, setStageDimensions] = useState({
        width: 0,
        height: 0,
    });

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

        return () => {
            window.removeEventListener('resize', checkSize);
        };
    }, []);




    return (
        <div style={{...style, ...enforcedStyles}} ref={containerRef}>
            <Stage
                width={stageDimensions.width}
                height={stageDimensions.height}
                onMouseDown={handleClick}
                ref={stageRef}
                style={style}
                onWheel={(e) => {
                    if (zoomFunctionality) {
                        e.evt.preventDefault();
                        const scaleBy = 1.05;
                        const stage = e.target.getStage();
                        if (stage !== null) {
                            const oldScale = stage.scaleX();

                            const mousePointTo = {
                                x: stage.getPointerPosition()!.x / oldScale - stage.x() / oldScale,
                                y: stage.getPointerPosition()!.y / oldScale - stage.y() / oldScale,
                            };

                            const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
                            stage.scale({ x: newScale, y: newScale });

                            stage.position({
                                x: -(mousePointTo.x - stage.getPointerPosition()!.x / newScale) * newScale,
                                y: -(mousePointTo.y - stage.getPointerPosition()!.y / newScale) * newScale,
                            });

                            stage.batchDraw();
                        }
                    }
                }}
            >
                <Layer>
                    {shapes.map((shape) => {
                        // console.log(shape)
                        // console.log(scaleX)
                        switch (shape.type) {
                            case "rect":
                                return <Rect key={shape.id} {...shape} />
                            case "circle":
                                return <Circle key={shape.id} {...shape} />
                            case "line":
                                return <Line key={shape.id} x={0} y={0} points={shape.points} {...shape} />
                            case "text":
                                return <Text key={shape.id} {...shape} />
                        }
                    })}
                </Layer>
            </Stage>
        </div>
    );
}



// function screenToWorld(screenX: number, screenY: number, scale: number, centerX: number, centerY: number) {
//         let newX = screenX / scale + centerX;
//         let newY = screenY / scale + centerY;
//         return [newX, newY];
//     }

// function worldToScreen(worldX: number, worldY: number, scale: number, centerX: number, centerY: number) {
//     let newX = scale * (worldX - centerX);
//     let newY = scale * (worldY - centerY);
//     return [newX, newY];
// }