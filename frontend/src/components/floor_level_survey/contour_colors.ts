export function hexToHsl(hex: string): [number, number, number] {
    let clean = hex.trim();
    if (clean.startsWith("#")) clean = clean.slice(1);
    if (clean.length === 3) {
        clean = clean.split("").map(c => c + c).join("");
    }
    if (clean.length !== 6) return [0, 0, 0];
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return [h, s, l];
}


export function hslToHex(h: number, s: number, l: number): string {
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => {
        const n = Math.round((v + m) * 255);
        return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
}


// Long-way HSL interpolation between two hex colors. This produces a natural
// rainbow sweep when the two endpoints are far apart on the color wheel (e.g.
// blue -> red goes through cyan, green, yellow instead of through purple).
export function interpolateContourColor(startHex: string, endHex: string, t: number): string {
    const clampedT = Math.max(0, Math.min(1, t));
    const [h1, s1, l1] = hexToHsl(startHex);
    const [h2, s2, l2] = hexToHsl(endHex);

    const forward = ((h2 - h1) % 360 + 360) % 360;
    const backward = 360 - forward;

    let hue: number;
    if (forward === 0 && backward === 360) {
        hue = h1;
    } else if (forward >= backward) {
        hue = h1 + forward * clampedT;
    } else {
        hue = h1 - backward * clampedT;
    }

    const s = s1 + (s2 - s1) * clampedT;
    const l = l1 + (l2 - l1) * clampedT;
    return hslToHex(hue, s, l);
}
