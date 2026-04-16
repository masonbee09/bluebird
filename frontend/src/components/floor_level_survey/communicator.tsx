import FLSController from "./flscontroller"



const url = "http://127.0.0.1:8000/fls_get_contours"



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
                    let x = shape.points[i];
                    let y = shape.points[i + 1];
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
        } else {
            console.log("No duplicate points detected.");
        }
        let points: { x: number; y: number; z: number }[] = [];

        this.parent.shapes.forEach((shape) => {
            if (shape.type === "point") {
                points.push({ x: shape.x, y: shape.y, z: shape.z });
            }
        });

        return points;
    }

    checkForDuplicatePoints() {
        let pointSet = new Set<string>();
        for (let shape of this.parent.shapes) {
            if (shape.type === "point") {
                let key = `${shape.x},${shape.y}`;
                if (pointSet.has(key)) {
                    return true; // Duplicate found
                }
                pointSet.add(key);
            }
        }
        return false; // No duplicates
    }

    getHeights() {
        let minz: number = Infinity;
        let maxz: number = -Infinity;

        //find the minimum and maximum z among the points

        this.parent.shapes.forEach((shape) => {
            if (shape.type === "point") {
                minz = Math.min(minz, shape.z);
                maxz = Math.max(maxz, shape.z);
            }
        });

        //use the min and max z to create contour heights
        let heights: number[] = [];
        let step = this.parent.getContourSpacing();
        for (let h = minz - step * .5; h <= maxz + step * .5; h += step) {
            heights.push(h);
        }

        return heights;
    }

    createJsonData() {
        let bounds = this.getBounds();
        let points = this.getPoints();
        let heights = this.getHeights();
        return {
            bounds: bounds,
            points: points,
            heights: heights,
            resolution: 50
        };
    }


    async fetchContours() {
        let data = this.createJsonData();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', // Required for the server to recognize JSON
                'Accept': 'application/json'        // Optional: Tells the server you expect JSON back
            },
            body: JSON.stringify(data)            // Convert your object to a JSON string
        });

        // 3. Check if the request was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 4. Parse the JSON response
        // Note: response.json() returns 'Promise<any>', so cast it to your interface
        const result = await response.json();
        return result;
    }
}


export default Communicator;