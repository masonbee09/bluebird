"""Helpers for the legacy /fls_get_contour_polygons endpoint (keeps json imports valid)."""

from typing import List, Sequence, Tuple, Union


NumberPair = Union[Tuple[float, float], List[float]]


def get_polygon_from_line(
    points: Sequence[NumberPair],
    x0: float,
    x1: float,
    y0: float,
    y1: float,
) -> List[Tuple[float, float]]:
    """Return the polyline as a closed ring in (x,y) form. Bounds args kept for API compatibility."""
    del x0, x1, y0, y1
    out: List[Tuple[float, float]] = []
    for p in points or []:
        if len(p) >= 2:
            out.append((float(p[0]), float(p[1])))
    return out


def get_intersect_polygon(
    wall_pts: Sequence[Tuple[float, float]],
    closed_pts: Sequence[Tuple[float, float]],
) -> Tuple[List[List[float]], List[List[float]]]:
    """Return [ [xs...] ], [ [ys...] ] per contour segment for downstream zip."""
    del wall_pts
    if not closed_pts:
        return [], []
    xs = [float(p[0]) for p in closed_pts]
    ys = [float(p[1]) for p in closed_pts]
    return [xs], [ys]
