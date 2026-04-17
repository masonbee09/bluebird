"""
Geometry-based contour extraction on a Triangulated Irregular Network (TIN).

Given scattered (x, y, z) samples and a target height h, we:
  1. Build a Delaunay triangulation of the 2D points.
  2. For each triangle, intersect the plane z = h with the triangle; because
     a plane cuts a triangle in at most one line segment, we get 0, 1, or 2
     crossing points per triangle by linearly interpolating on the triangle's
     edges.
  3. Stitch segments that share an endpoint (adjacent triangles share an
     edge, so their crossings coincide exactly) into continuous polylines.

The result is a list of polylines, each polyline being a list of (x, y)
tuples; continuity is exact at the TIN level (unlike marching-squares on
an interpolated raster).
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Iterable, List, Sequence, Tuple

import numpy as np
from scipy.spatial import Delaunay


Point = Tuple[float, float]
Segment = Tuple[Point, Point]
Polyline = List[Point]
Vertex3 = Tuple[float, float, float]
Triangle3 = Tuple[Vertex3, Vertex3, Vertex3]


_EPS = 1e-9


# --- Wall densification & IDW z-interpolation ----------------------------
#
# The Delaunay triangulation of a scatter of survey points only covers the
# convex hull of those points, so for concave rooms contour polylines stop
# short of the walls on one side and bulge outside the walls in the notch.
# By sampling points along every wall segment and assigning them a z value
# interpolated from existing measurements (inverse distance weighting), we
# turn the TIN into something that extends exactly to every wall edge;
# shapely clipping then shaves off any convex-hull bleeding that remains.

def densify_walls(walls: Sequence[Sequence[float]], spacing: float = 15.0) -> List[Point]:
    """Return points sampled along every wall segment at approximately `spacing`."""
    seen: set = set()
    out: List[Point] = []
    for w in walls:
        if len(w) < 4:
            continue
        x1, y1, x2, y2 = float(w[0]), float(w[1]), float(w[2]), float(w[3])
        length = math.hypot(x2 - x1, y2 - y1)
        if length < _EPS:
            continue
        n = max(1, int(math.ceil(length / max(spacing, _EPS))))
        for i in range(n + 1):
            t = i / n
            x = x1 + t * (x2 - x1)
            y = y1 + t * (y2 - y1)
            key = (round(x, 6), round(y, 6))
            if key in seen:
                continue
            seen.add(key)
            out.append((x, y))
    return out


def idw_interpolate(
    x: float,
    y: float,
    xs: Sequence[float],
    ys: Sequence[float],
    zs: Sequence[float],
    power: float = 2.0,
) -> float:
    """Inverse distance weighted interpolation at (x, y). Falls back to 0 if no samples."""
    if not xs:
        return 0.0
    weighted = 0.0
    weight_sum = 0.0
    half_power = power * 0.5
    for xi, yi, zi in zip(xs, ys, zs):
        dx = xi - x
        dy = yi - y
        d2 = dx * dx + dy * dy
        if d2 < 1e-12:
            return float(zi)
        w = 1.0 / (d2 ** half_power)
        weighted += w * zi
        weight_sum += w
    if weight_sum <= 0.0:
        return 0.0
    return weighted / weight_sum


def extend_with_wall_samples(
    xs: Sequence[float],
    ys: Sequence[float],
    zs: Sequence[float],
    walls: Sequence[Sequence[float]],
    spacing: float = 15.0,
) -> Tuple[List[float], List[float], List[float]]:
    """Append IDW-interpolated samples along walls so the TIN reaches them."""
    if not walls:
        return list(xs), list(ys), list(zs)

    existing = set((round(float(x), 6), round(float(y), 6)) for x, y in zip(xs, ys))
    new_xs = list(xs)
    new_ys = list(ys)
    new_zs = list(zs)
    for sx, sy in densify_walls(walls, spacing=spacing):
        key = (round(sx, 6), round(sy, 6))
        if key in existing:
            continue
        z = idw_interpolate(sx, sy, xs, ys, zs)
        new_xs.append(sx)
        new_ys.append(sy)
        new_zs.append(z)
        existing.add(key)
    return new_xs, new_ys, new_zs


# --- Chaikin smoothing ---------------------------------------------------
#
# Two passes of Chaikin's corner-cutting algorithm round sharp triangle
# edges into visibly smooth curves while staying strictly inside the convex
# hull of the input vertices. That in-hull property is important because it
# means a smoothed contour never crosses the straight contour on the other
# side of a triangle, so lines and fills still tile consistently.

def chaikin_smooth(
    pts: Sequence[Point],
    iterations: int = 2,
    closed: bool = False,
) -> List[Point]:
    """Chaikin corner-cutting. Endpoints are kept fixed when `closed` is False."""
    if len(pts) < 3 or iterations <= 0:
        return [tuple(p) for p in pts]
    current: List[Point] = [tuple(p) for p in pts]
    for _ in range(iterations):
        n = len(current)
        new: List[Point] = []
        if not closed:
            new.append(current[0])
            for i in range(n - 1):
                p = current[i]
                q = current[i + 1]
                new.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
                new.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
            new.append(current[-1])
        else:
            for i in range(n):
                p = current[i]
                q = current[(i + 1) % n]
                new.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
                new.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        current = new
    return current


def _edge_crossing(
    ax: float, ay: float, az: float,
    bx: float, by: float, bz: float,
    h: float,
) -> Point | None:
    """Return the (x, y) where the segment (a → b) crosses z = h, or None.

    Endpoints exactly on h are treated as crossings of the *edge*, which may
    cause duplicate points for triangles that have a vertex on h; the caller
    de-duplicates.
    """
    da = az - h
    db = bz - h
    # No crossing if both strictly on the same side.
    if da > _EPS and db > _EPS:
        return None
    if da < -_EPS and db < -_EPS:
        return None
    denom = bz - az
    if abs(denom) < _EPS:
        # Flat edge sitting on h: the caller handles the two endpoints
        # separately via the vertex path.
        return None
    t = (h - az) / denom
    # Clamp t to [0, 1] to avoid floating-point drift outside the edge.
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    return (ax + t * (bx - ax), ay + t * (by - ay))


def _triangle_segment(
    p0: Tuple[float, float, float],
    p1: Tuple[float, float, float],
    p2: Tuple[float, float, float],
    h: float,
) -> Segment | None:
    """Compute the contour segment (if any) where z = h cuts the triangle."""
    z0, z1, z2 = p0[2], p1[2], p2[2]

    zmin = min(z0, z1, z2)
    zmax = max(z0, z1, z2)
    if h < zmin - _EPS or h > zmax + _EPS:
        return None

    crossings: List[Point] = []
    # Three edges; also capture vertices that lie exactly on h.
    edges = (
        (p0, p1),
        (p1, p2),
        (p2, p0),
    )
    for a, b in edges:
        c = _edge_crossing(a[0], a[1], a[2], b[0], b[1], b[2], h)
        if c is not None:
            crossings.append(c)

    # If a vertex itself sits on h, include it (handles "just touches" cases
    # where no edge would otherwise register two distinct crossings).
    for v in (p0, p1, p2):
        if abs(v[2] - h) < _EPS:
            crossings.append((v[0], v[1]))

    if len(crossings) < 2:
        return None

    # De-duplicate (tolerant) and keep the two extreme points.
    unique: List[Point] = []
    for c in crossings:
        if not any(abs(c[0] - u[0]) < _EPS and abs(c[1] - u[1]) < _EPS for u in unique):
            unique.append(c)

    if len(unique) < 2:
        return None
    # If a vertex lay exactly on h, there can be > 2 unique crossings; pick
    # the pair with the largest separation (the true intersection span).
    if len(unique) == 2:
        return (unique[0], unique[1])
    best: Segment | None = None
    best_d2 = -1.0
    for i in range(len(unique)):
        for j in range(i + 1, len(unique)):
            dx = unique[i][0] - unique[j][0]
            dy = unique[i][1] - unique[j][1]
            d2 = dx * dx + dy * dy
            if d2 > best_d2:
                best_d2 = d2
                best = (unique[i], unique[j])
    return best


def _stitch_segments(segments: Sequence[Segment], tol: float = 1e-6) -> List[Polyline]:
    """Merge segments sharing endpoints into the longest possible polylines.

    Uses a quantized key so floating-point noise at shared endpoints still
    matches. Adjacent TIN segments will share *exact* crossings, so this is
    mostly insurance.
    """
    if not segments:
        return []

    inv_tol = 1.0 / max(tol, 1e-12)

    def key(p: Point) -> Tuple[int, int]:
        return (int(round(p[0] * inv_tol)), int(round(p[1] * inv_tol)))

    # endpoint-key -> list of (segment_index, which_end: 0 or 1)
    adj: dict = defaultdict(list)
    for i, seg in enumerate(segments):
        adj[key(seg[0])].append((i, 0))
        adj[key(seg[1])].append((i, 1))

    used = [False] * len(segments)
    polylines: List[Polyline] = []

    def take_neighbor(line: Polyline, at_head: bool) -> bool:
        anchor = line[0] if at_head else line[-1]
        for (j, end) in adj[key(anchor)]:
            if used[j]:
                continue
            seg = segments[j]
            other = seg[1 - end]
            used[j] = True
            if at_head:
                line.insert(0, other)
            else:
                line.append(other)
            return True
        return False

    for start in range(len(segments)):
        if used[start]:
            continue
        used[start] = True
        s = segments[start]
        line: Polyline = [s[0], s[1]]
        while take_neighbor(line, at_head=False):
            pass
        while take_neighbor(line, at_head=True):
            pass
        polylines.append(line)

    return polylines


def tin_contours_at_height(
    xs: Sequence[float],
    ys: Sequence[float],
    zs: Sequence[float],
    height: float,
) -> List[Polyline]:
    """Return the polylines of the contour z = height from the TIN of the samples."""
    if len(xs) < 3:
        return []

    pts_xy = np.column_stack([np.asarray(xs, dtype=float), np.asarray(ys, dtype=float)])
    zs_arr = np.asarray(zs, dtype=float)

    try:
        tri = Delaunay(pts_xy)
    except Exception:
        # Degenerate input (all collinear, duplicate points, etc.)
        return []

    segments: List[Segment] = []
    for simplex in tri.simplices:
        i0, i1, i2 = int(simplex[0]), int(simplex[1]), int(simplex[2])
        p0 = (float(pts_xy[i0, 0]), float(pts_xy[i0, 1]), float(zs_arr[i0]))
        p1 = (float(pts_xy[i1, 0]), float(pts_xy[i1, 1]), float(zs_arr[i1]))
        p2 = (float(pts_xy[i2, 0]), float(pts_xy[i2, 1]), float(zs_arr[i2]))
        seg = _triangle_segment(p0, p1, p2, height)
        if seg is not None:
            segments.append(seg)

    return _stitch_segments(segments)


# --- Filled contour bands ------------------------------------------------
#
# For fills we keep the TIN but now classify each triangle against two
# z-planes (h_low and h_high) at once. The triangle intersected with the
# slab h_low <= z <= h_high is a convex 3D polygon with 3..5 vertices; we
# get it by Sutherland-Hodgman style clipping of the triangle against
# each plane in turn. Projecting the result to (x, y) gives the exact
# 2D fill polygon for that band within that triangle. Because adjacent
# triangles share edges exactly, the union of all per-triangle polygons
# for a band covers the TIN seamlessly.


def _clip_polygon_above(poly: Sequence[Vertex3], h: float) -> List[Vertex3]:
    """Keep the half of `poly` where z >= h (vertices remain 3-D)."""
    if not poly:
        return []
    n = len(poly)
    out: List[Vertex3] = []
    for i in range(n):
        curr = poly[i]
        prev = poly[(i - 1) % n]
        curr_in = curr[2] >= h - _EPS
        prev_in = prev[2] >= h - _EPS
        if curr_in:
            if not prev_in:
                dz = curr[2] - prev[2]
                if abs(dz) > _EPS:
                    t = (h - prev[2]) / dz
                    out.append((
                        prev[0] + t * (curr[0] - prev[0]),
                        prev[1] + t * (curr[1] - prev[1]),
                        h,
                    ))
            out.append(curr)
        elif prev_in:
            dz = curr[2] - prev[2]
            if abs(dz) > _EPS:
                t = (h - prev[2]) / dz
                out.append((
                    prev[0] + t * (curr[0] - prev[0]),
                    prev[1] + t * (curr[1] - prev[1]),
                    h,
                ))
    return out


def _clip_polygon_below(poly: Sequence[Vertex3], h: float) -> List[Vertex3]:
    """Keep the half of `poly` where z <= h."""
    if not poly:
        return []
    n = len(poly)
    out: List[Vertex3] = []
    for i in range(n):
        curr = poly[i]
        prev = poly[(i - 1) % n]
        curr_in = curr[2] <= h + _EPS
        prev_in = prev[2] <= h + _EPS
        if curr_in:
            if not prev_in:
                dz = curr[2] - prev[2]
                if abs(dz) > _EPS:
                    t = (h - prev[2]) / dz
                    out.append((
                        prev[0] + t * (curr[0] - prev[0]),
                        prev[1] + t * (curr[1] - prev[1]),
                        h,
                    ))
            out.append(curr)
        elif prev_in:
            dz = curr[2] - prev[2]
            if abs(dz) > _EPS:
                t = (h - prev[2]) / dz
                out.append((
                    prev[0] + t * (curr[0] - prev[0]),
                    prev[1] + t * (curr[1] - prev[1]),
                    h,
                ))
    return out


def _build_triangles(xs: Sequence[float], ys: Sequence[float], zs: Sequence[float]) -> List[Triangle3]:
    if len(xs) < 3:
        return []
    pts_xy = np.column_stack([np.asarray(xs, dtype=float), np.asarray(ys, dtype=float)])
    zs_arr = np.asarray(zs, dtype=float)
    try:
        tri = Delaunay(pts_xy)
    except Exception:
        return []
    triangles: List[Triangle3] = []
    for simplex in tri.simplices:
        i0, i1, i2 = int(simplex[0]), int(simplex[1]), int(simplex[2])
        triangles.append((
            (float(pts_xy[i0, 0]), float(pts_xy[i0, 1]), float(zs_arr[i0])),
            (float(pts_xy[i1, 0]), float(pts_xy[i1, 1]), float(zs_arr[i1])),
            (float(pts_xy[i2, 0]), float(pts_xy[i2, 1]), float(zs_arr[i2])),
        ))
    return triangles


def tin_fill_band_fragments(
    xs: Sequence[float],
    ys: Sequence[float],
    zs: Sequence[float],
    h_low: float,
    h_high: float,
    triangles: Sequence[Triangle3] | None = None,
) -> List[Polyline]:
    """Return the (x, y) outer rings of every triangle-band intersection.

    Either supply an already-computed triangulation via `triangles`, or let
    the function triangulate the (xs, ys) itself.
    """
    if triangles is None:
        triangles = _build_triangles(xs, ys, zs)
    if not triangles:
        return []

    use_low = math.isfinite(h_low)
    use_high = math.isfinite(h_high)

    fragments: List[Polyline] = []
    for t0, t1, t2 in triangles:
        zmin = min(t0[2], t1[2], t2[2])
        zmax = max(t0[2], t1[2], t2[2])
        if use_low and zmax <= h_low + _EPS:
            continue
        if use_high and zmin >= h_high - _EPS:
            continue
        poly: List[Vertex3] = [t0, t1, t2]
        if use_low:
            poly = _clip_polygon_above(poly, h_low)
            if len(poly) < 3:
                continue
        if use_high:
            poly = _clip_polygon_below(poly, h_high)
            if len(poly) < 3:
                continue
        fragments.append([(p[0], p[1]) for p in poly])
    return fragments


def tin_contours(
    xs: Sequence[float],
    ys: Sequence[float],
    zs: Sequence[float],
    heights: Iterable[float],
) -> List[List[Polyline]]:
    """Batched convenience: return contours for each height in `heights`."""
    if len(xs) < 3:
        return [[] for _ in heights]

    pts_xy = np.column_stack([np.asarray(xs, dtype=float), np.asarray(ys, dtype=float)])
    zs_arr = np.asarray(zs, dtype=float)

    try:
        tri = Delaunay(pts_xy)
    except Exception:
        return [[] for _ in heights]

    # Precompute the triangle vertex triples once; re-use across heights.
    triangles = []
    for simplex in tri.simplices:
        i0, i1, i2 = int(simplex[0]), int(simplex[1]), int(simplex[2])
        triangles.append(
            (
                (float(pts_xy[i0, 0]), float(pts_xy[i0, 1]), float(zs_arr[i0])),
                (float(pts_xy[i1, 0]), float(pts_xy[i1, 1]), float(zs_arr[i1])),
                (float(pts_xy[i2, 0]), float(pts_xy[i2, 1]), float(zs_arr[i2])),
            )
        )

    out: List[List[Polyline]] = []
    for h in heights:
        segments: List[Segment] = []
        for p0, p1, p2 in triangles:
            seg = _triangle_segment(p0, p1, p2, h)
            if seg is not None:
                segments.append(seg)
        out.append(_stitch_segments(segments))
    return out


__all__ = [
    "tin_contours_at_height",
    "tin_contours",
    "tin_fill_band_fragments",
    "extend_with_wall_samples",
    "densify_walls",
    "idw_interpolate",
    "chaikin_smooth",
]
