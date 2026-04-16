




class MathHelper {

    point_line_dist(x: number, y: number, l1x: number, l1y: number, l2x: number, l2y: number): number {
        let numerator = x * (l2y - l1y) + l1x * (y - l2y) + l2x * (l1y - y)
        let denominator = Math.sqrt(Math.pow(l2x - l1x, 2) + Math.pow(l2y - l1y, 2))
        return Math.abs(numerator / denominator)
    }

    point_line_dist_end_constrained(x: number, y: number, l1x: number, l1y: number, l2x: number, l2y: number): number {
        let t1 = (new MathHelper).point_line_t1(x, y, l1x, l1y, l2x, l2y)
        if (t1 <= 1 && t1 >= 0) {
            return (new MathHelper).point_line_dist(x, y, l1x, l1y, l2x, l2y)
        } else {
            let d1 = Math.sqrt(Math.pow(x - l1x, 2) + Math.pow(y - l1y, 2))
            let d2 = Math.sqrt(Math.pow(x - l2x, 2) + Math.pow(y - l2y, 2))
            return Math.min(d1, d2)
        }
    }

    point_line_closest_end_constrained(x: number, y: number, l1x: number, l1y: number, l2x: number, l2y: number): number[] {
        let t1 = (new MathHelper).point_line_t1(x, y, l1x, l1y, l2x, l2y)
        if (t1 <= 1 && t1 >= 0) {
            return (new MathHelper).line_point_from_t(t1, l1x, l1y, l2x, l2y)
        } else {
            let d1 = Math.sqrt(Math.pow(x - l1x, 2) + Math.pow(y - l1y, 2))
            let d2 = Math.sqrt(Math.pow(x - l2x, 2) + Math.pow(y - l2y, 2))
            if (d1 < d2) {
                return [l1x, l1y]
            } else {
                return [l2x, l2y]
            }
        }
    }

    point_line_t1(x: number, y: number, l1x: number, l1y: number, l2x: number, l2y: number): number {
        return ((l2x - l1x) * (x - l1x) + (l2y - l1y) * (y - l1y)) / (Math.pow(l2x - l1x, 2) + Math.pow(l2y - l1y, 2))
    }

    point_line_closest(x: number, y: number, l1x: number, l1y: number, l2x: number, l2y: number): number[] {
        let t1 = (new MathHelper).point_line_t1(x, y, l1x, l1y, l2x, l2y)
        return (new MathHelper).line_point_from_t(t1, l1x, l1y, l2x, l2y)
    }

    line_point_from_t(t: number, l1x: number, l1y: number, l2x: number, l2y: number): number[] {
        let newx = (l2x - l1x) * t + l1x
        let newy = (l2y - l1y) * t + l1y
        return [newx, newy]
    }

    line_length(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    }

}



export default MathHelper;
