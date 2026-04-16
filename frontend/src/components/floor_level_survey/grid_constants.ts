export const GRID_MINOR = 20;
export const GRID_MAJOR = 100;

export function snapToGrid(x: number, y: number): { x: number; y: number } {
    return {
        x: Math.round(x / GRID_MINOR) * GRID_MINOR,
        y: Math.round(y / GRID_MINOR) * GRID_MINOR,
    };
}
