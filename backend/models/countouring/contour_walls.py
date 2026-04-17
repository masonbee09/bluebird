"""
Wall-polygon construction and clipping helpers.

The frontend draws walls as individual line segments (each wall is a 2-point
edge) that users connect to form closed room polygons. To correctly bound
the contour fills/lines against the room interior we need to:

  1. Recover the (possibly multi-) polygon formed by those segments.
  2. Intersect every contour polyline / fill polygon against it.

Both operations are exactly what shapely does well, so we delegate to it
instead of re-implementing polygon Boolean ops.

If walls don't form any closed loops (e.g. the user drew a few strays),
`build_wall_polygon` returns None and the clippers pass data through
unchanged.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from shapely.geometry import (
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
    GeometryCollection,
)
from shapely.ops import polygonize, unary_union


Point = Tuple[float, float]
Ring = List[Point]


def build_wall_polygon(walls: Sequence[Sequence[float]]):
    """Merge wall segments into a shapely (Multi)Polygon of the enclosed area.

    `walls` is an iterable of flat `[x1, y1, x2, y2]` segments.
    """
    if not walls:
        return None

    segs = []
    for w in walls:
        if len(w) < 4:
            continue
        x1, y1, x2, y2 = float(w[0]), float(w[1]), float(w[2]), float(w[3])
        if x1 == x2 and y1 == y2:
            continue
        segs.append(LineString([(x1, y1), (x2, y2)]))

    if not segs:
        return None

    merged = unary_union(segs)
    try:
        polys = list(polygonize(merged))
    except Exception:
        polys = []

    if not polys:
        return None

    return unary_union(polys)


def _collect_lines(geom, out: List[Ring]) -> None:
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, LineString):
        out.append([(c[0], c[1]) for c in geom.coords])
    elif isinstance(geom, MultiLineString):
        for ls in geom.geoms:
            out.append([(c[0], c[1]) for c in ls.coords])
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            _collect_lines(g, out)
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            _collect_lines(g, out)


def clip_polyline(polyline: Ring, polygon) -> List[Ring]:
    """Return the portion(s) of `polyline` that lie inside `polygon`."""
    if polygon is None:
        return [polyline]
    if len(polyline) < 2:
        return []
    try:
        line = LineString(polyline)
    except Exception:
        return []
    result = polygon.intersection(line)
    if result.is_empty:
        return []
    out: List[Ring] = []
    _collect_lines(result, out)
    return out


def _collect_polys(geom, out: List[Ring]) -> None:
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, Polygon):
        ext = geom.exterior
        if ext is not None and len(ext.coords) >= 4:
            out.append([(c[0], c[1]) for c in ext.coords])
    elif isinstance(geom, MultiPolygon):
        for g in geom.geoms:
            _collect_polys(g, out)
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            _collect_polys(g, out)
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            _collect_polys(g, out)


def clip_polygon_ring(ring: Ring, polygon) -> List[Ring]:
    """Return the outer ring(s) of `ring` ∩ `polygon`."""
    if len(ring) < 3:
        return []
    if polygon is None:
        return [ring]
    try:
        fill = Polygon(ring)
        if not fill.is_valid:
            fill = fill.buffer(0)
    except Exception:
        return []
    result = polygon.intersection(fill)
    if result.is_empty:
        return []
    out: List[Ring] = []
    _collect_polys(result, out)
    return out


__all__ = ["build_wall_polygon", "clip_polyline", "clip_polygon_ring"]
