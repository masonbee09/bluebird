import FLSController from "./flscontroller"


// Polygon-aware contour endpoint. Unlike the previous line-only endpoint, this
// returns filled polygons clipped to the wall boundary so we can colour-fill
// the floor plan directly on the canvas.
const url = "http://127.0.0.1:8001/fls_get_contour_polygons"


class Communicator {
    parent: FLSController;

    constructor(parent: FLSController) {
        this.parent = parent;
    }



    getBounds() {
        if (this.parent.shapes.length === 0) {
            return [0, 0, 0, 0];
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        this.parent.shapes.forEach((shape) => {
            if (shape.type === "point") {
                minX = Math.min(minX, shape.x - shape.radius);
                minY = Math.min(minY, shape.y - shape.radius);
                maxX = Math.max(maxX, shape.x + shape.radius);
                maxY = Math.max(maxY, shape.y + shape.radius);
            } else if (shape.type === "wall") {
                for (let i = 0; i < shape.points.length; i += 2) {
                    const x = shape.points[i];
                    const y = shape.points[i + 1];
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        });

        return [minX, minY, maxX, maxY];
    }

    getPoints() {
        if (this.checkForDuplicatePoints()) {
            throw new Error("Duplicate points detected. Please ensure all points have unique coordinates.");
        }
        const points: { x: number; y: number; z: number }[] = [];

        this.parent.shapes.forEach((shape) => {
            if (shape.type === "point") {
                points.push({ x: shape.x, y: shape.y, z: shape.z });
            }
        });

        return points;
    }

    checkForDuplicatePoints() {
        const pointSet = new Set<string>();
        for (const shape of this.parent.shapes) {
            if (shape.type === "point") {
                const key = `${shape.x},${shape.y}`;
                if (pointSet.has(key)) {
                    return true;
                }
                pointSet.add(key);
            }
        }
        return false;
    }

    getHeights() {
        let minz: number = Infinity;
        let maxz: number = -Infinity;

        this.parent.shapes.forEach((shape) => {
            if (shape.type === "point") {
                minz = Math.min(minz, shape.z);
                maxz = Math.max(maxz, shape.z);
            }
        });

        const heights: number[] = [];
        const step = this.parent.getContourSpacing();
        for (let h = minz - step * .5; h <= maxz + step * .5; h += step) {
            heights.push(h);
        }

        return heights;
    }

    /**
     * Build an ordered list of wall vertices forming the floor-plan polygon.
     *
     * The polygon-aware backend expects a single ordered polyline (``wall_points``).
     * The user's wall-drawing flow stores each drawn wall as a ``WallShape`` whose
     * ``points`` array is a flattened ``[x0, y0, x1, y1, ...]`` polyline (the
     * polygon tool finalises one connected polyline per double-click).
     *
     * Strategy:
     *   - Prefer the longest wall shape as the enclosing boundary.
     *   - Concatenate subsequent wall shapes onto the tail so multi-part walls
     *     still reach the backend (the backend will ``make_valid`` it).
     *   - If no walls exist, return an empty list so the backend falls back to
     *     the bounding rectangle.
     */
    getWallPoints(): { x: number; y: number; z: number }[] {
        const walls = this.parent.shapes.filter(
            (s): s is Extract<typeof s, { type: "wall" }> => s.type === "wall",
        );
        if (walls.length === 0) return [];

        const sorted = [...walls].sort((a, b) => b.points.length - a.points.length);
        const out: { x: number; y: number; z: number }[] = [];
        for (const wall of sorted) {
            for (let i = 0; i + 1 < wall.points.length; i += 2) {
                out.push({ x: wall.points[i], y: wall.points[i + 1], z: 0 });
            }
        }
        return out;
    }

    createJsonData() {
        const bounds = this.getBounds();
        const points = this.getPoints();
        const heights = this.getHeights();
        const wall_points = this.getWallPoints();
        return {
            bounds,
            points,
            wall_points,
            heights,
            resolution: 150,
        };
    }


    async fetchContours() {
        const data = this.createJsonData();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    }
}


export default Communicator;
