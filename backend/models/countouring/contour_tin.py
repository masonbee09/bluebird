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

from collections import defaultdict
from typing import Iterable, List, Sequence, Tuple

import numpy as np
from scipy.spatial import Delaunay


Point = Tuple[float, float]
Segment = Tuple[Point, Point]
Polyline = List[Point]


_EPS = 1e-9


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


__all__ = ["tin_contours_at_height", "tin_contours"]
