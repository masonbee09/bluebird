"""Polygon helpers for the polygon-aware contour API.

Ported from backend_2. Given an open contour polyline (that starts and ends on
the bounding rectangle boundary), these helpers close it into a polygon by
walking around the rectangle boundary, and intersect that closed polygon with
a user-supplied wall polygon to clip it to the inside of the floor plan.
"""

from typing import List, Sequence, Tuple

from shapely.geometry import Polygon
from shapely.validation import make_valid


# ---------------------------------------------------------------------------
# Quartile helpers - classify a boundary point by which side of the rectangle
# it lies on so we know which corner(s) to walk through to close the polygon.
# ---------------------------------------------------------------------------


def find_quartile(
    x: float,
    y: float,
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> int:
    """Classify (x, y) into one of four triangular quartiles of the rectangle
    [(x_min, y_min), (x_max, y_max)] split by its two diagonals.

    Returns 0..3. The exact labelling is not important as long as it stays
    consistent with :func:`get_corner_from_quartile` below - the pair is only
    used to pick which corners to walk through when closing a polyline.
    """
    dx = x_max - x_min
    dy = y_max - y_min
    v1 = (x - x_min) * dy - (y - y_min) * dx
    v2 = (x - x_max) * dy + (y - y_min) * dx
    if v1 > 0:
        return 2 if v2 > 0 else 1
    return 3 if v2 > 0 else 0


def get_corner_from_quartile(
    quartile: int,
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> Tuple[float, float]:
    if quartile == 0:
        return (x_max, y_max)
    if quartile == 1:
        return (x_min, y_max)
    if quartile == 2:
        return (x_min, y_min)
    if quartile == 3:
        return (x_max, y_min)
    raise ValueError(f"Unknown quartile index: {quartile}")


def get_corner_point_list(
    q_start: int,
    q_end: int,
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> List[Tuple[float, float]]:
    """Collect the corner points encountered while walking from q_start to
    q_end (CCW) around the rectangle."""
    qup = q_end if q_end >= q_start else q_end + 4
    indexes = list(range(q_start, qup))
    points: List[Tuple[float, float]] = []
    for idx in indexes:
        points.append(get_corner_from_quartile(idx % 4, x_min, y_min, x_max, y_max))
    return points


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


NumberPair = Tuple[float, float]


def get_polygon_from_line(
    line: Sequence[NumberPair],
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> List[Tuple[float, float]]:
    """Close an open contour polyline into a polygon by walking around the
    rectangle boundary between its end-points.

    If the polyline is already closed (first == last) it is returned as-is
    (coerced to float pairs).
    """
    if len(line) < 2:
        raise ValueError("Line must have at least 2 points")

    first = (float(line[0][0]), float(line[0][1]))
    last = (float(line[-1][0]), float(line[-1][1]))
    out: List[Tuple[float, float]] = [(float(p[0]), float(p[1])) for p in line]

    if first == last:
        return out

    q1 = find_quartile(first[0], first[1], x_min, y_min, x_max, y_max)
    q2 = find_quartile(last[0], last[1], x_min, y_min, x_max, y_max)
    corners = get_corner_point_list(q1, q2, x_min, y_min, x_max, y_max)
    out.extend(corners)
    out.append(first)
    return out


def get_intersect_polygon(
    wall_points: Sequence[NumberPair],
    closed_points: Sequence[NumberPair],
) -> Tuple[List[List[float]], List[List[float]]]:
    """Intersect a closed contour polygon with the wall polygon.

    Returns ``(xs_list, ys_list)`` where each entry corresponds to one
    resulting polygon piece (``MultiPolygon`` is flattened). Returns two empty
    lists when the intersection is empty.
    """
    if len(wall_points) < 3 or len(closed_points) < 3:
        return [], []

    wall = make_valid(Polygon([(float(x), float(y)) for (x, y) in wall_points]))
    shape = make_valid(Polygon([(float(x), float(y)) for (x, y) in closed_points]))
    result = wall.intersection(shape)
    if result.is_empty:
        return [], []

    geoms = []
    if isinstance(result, Polygon):
        geoms = [result]
    elif hasattr(result, "geoms"):
        geoms = list(result.geoms)
    else:
        return [], []

    xs_out: List[List[float]] = []
    ys_out: List[List[float]] = []
    for geom in geoms:
        if not isinstance(geom, Polygon) or geom.is_empty:
            continue
        xs, ys = geom.exterior.xy
        xs_out.append([float(v) for v in xs])
        ys_out.append([float(v) for v in ys])
    return xs_out, ys_out


__all__ = [
    "find_quartile",
    "get_corner_from_quartile",
    "get_corner_point_list",
    "get_polygon_from_line",
    "get_intersect_polygon",
]
