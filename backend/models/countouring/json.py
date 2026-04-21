from pydantic import BaseModel, Field
from typing import List, Optional
import math
from shapely.geometry import LineString, MultiLineString, GeometryCollection, Polygon, LinearRing
from shapely.validation import make_valid

from models.countouring.contourmap import *


class PointInput(BaseModel):
    x: float
    y: float
    z: float


class WallInput(BaseModel):
    """A wall is represented as a single straight segment between two points."""
    x1: float
    y1: float
    x2: float
    y2: float


class ContourInput(BaseModel):
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0]=xMin, [1]=yMin, [2]=xMax, [3]=yMax")
    points: List[PointInput]
    walls: List[WallInput] = []
    heights: List[float]
    resolution: int = 150

    def get_xyzlist(self):
        return [[p.x for p in self.points], [p.y for p in self.points], [p.z for p in self.points]]

    def get_wall_segments(self):
        return [((w.x1, w.y1), (w.x2, w.y2)) for w in self.walls]

    def get_output(self):
        return GetOutputFromInput(self)


class ContourBandPolygon(BaseModel):
    """One filled polygon for a contour band. First ring is outer; remaining rings are holes."""
    rings: List[List[List[float]]]


class ContourBand(BaseModel):
    lo: float
    hi: float
    polygons: List[ContourBandPolygon]


class ContourOutput(BaseModel):
    input: ContourInput
    lines: List
    Xi: List[List[float]] = []
    Yi: List[List[float]] = []
    Zi: List[List[Optional[float]]] = []
    fills: Optional[List[ContourBand]] = None


def CreateContourInput(bounds: List[float], points: List[PointInput], heights: List[float], resolution: int = 150, walls: Optional[List[WallInput]] = None):
    return ContourInput.model_validate({
        "bounds": bounds,
        "points": points,
        "walls": walls or [],
        "heights": heights,
        "resolution": resolution,
    })


def CreatePointInputs(xyzlist):
    if len(xyzlist[0]) != 3:
        raise Exception("xyzlist must be in form [[x1, y1, z1], [x2, y2, z2], ...]")
    pointlist = []
    for p in xyzlist:
        pointlist.append(PointInput.model_validate({"x": p[0], "y": p[1], "z": p[2]}))
    return pointlist


def GetOutputFromInput(input: ContourInput):
    contour_map = CreateContourMap(
        [p.x for p in input.points],
        [p.y for p in input.points],
        [p.z for p in input.points],
        input.bounds,
        resolution=input.resolution,
        wall_segments=input.get_wall_segments(),
    )
    lines = []
    for h in input.heights:
        lines.append(contour_map.lines_at_height(h))

    Xi, Yi, Zi = contour_map.interpolated
    Xi_list = [[float(v) for v in row] for row in Xi.tolist()]
    Yi_list = [[float(v) for v in row] for row in Yi.tolist()]
    # NaN is not valid JSON, so replace NaN with None for serialization.
    Zi_list = [
        [None if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v) for v in row]
        for row in Zi.tolist()
    ]

    fills_raw = contour_map.filled_bands(input.heights)
    fills: List[ContourBand] = []
    for band in fills_raw:
        polygons = []
        for poly in band["polygons"]:
            rings = [[[float(x), float(y)] for (x, y) in ring] for ring in poly]
            polygons.append(ContourBandPolygon.model_validate({"rings": rings}))
        fills.append(ContourBand.model_validate({
            "lo": band["lo"],
            "hi": band["hi"],
            "polygons": polygons,
        }))

    return ContourOutput.model_validate({
        "input": input,
        "lines": lines,
        "Xi": Xi_list,
        "Yi": Yi_list,
        "Zi": Zi_list,
        "fills": fills,
    })


# ---------------------------------------------------------------------------
# Polygon-aware contour API
# ---------------------------------------------------------------------------


class ContourPolygonInput(BaseModel):
    """Input for the polygon-aware contour endpoint.

    Unlike :class:`ContourInput` (which receives ``walls`` as individual line
    segments), this API receives ``wall_points`` as a single ordered polyline
    forming the wall polygon. Each contour height yields a closed polygon
    clipped to the wall polygon, ready to colour-fill on the client.
    """

    bounds: List[float] = Field(min_length=4, max_length=4, description="[0]=xMin, [1]=yMin, [2]=xMax, [3]=yMax")
    points: List[PointInput]
    wall_points: List[PointInput] = Field(default_factory=list)
    heights: List[float]
    resolution: int = 150

    def get_output(self):
        return GetPolygonOutputFromInput(self)


class ContourPolygonOutput(BaseModel):
    input: ContourPolygonInput
    polygons: List = Field(default_factory=list)
    heights: List = Field(default_factory=list)
    lines: List = Field(default_factory=list)
    line_heights: List = Field(default_factory=list)


def _expand_to_rect(bounds: List[float]):
    """Return a closed rectangle polyline from [xMin, yMin, xMax, yMax]."""
    x_min, y_min, x_max, y_max = bounds
    return (
        [x_min, x_max, x_max, x_min, x_min],
        [y_min, y_min, y_max, y_max, y_min],
    )


def GetPolygonOutputFromInput(input: ContourPolygonInput):
    # Build a closed wall polyline. When absent, use bounding rectangle.
    if len(input.wall_points) >= 3:
        wall_pts = [(float(p.x), float(p.y)) for p in input.wall_points]
    else:
        wall_xs, wall_ys = _expand_to_rect(input.bounds)
        wall_pts = list(zip(wall_xs, wall_ys))

    if wall_pts[0] != wall_pts[-1]:
        wall_pts.append(wall_pts[0])

    # Convert polyline to wall segments for ContourMap clipping/fill bands.
    wall_segments = []
    for i in range(len(wall_pts) - 1):
        a = wall_pts[i]
        b = wall_pts[i + 1]
        if a != b:
            wall_segments.append((a, b))

    contour_map = CreateContourMap(
        [p.x for p in input.points],
        [p.y for p in input.points],
        [p.z for p in input.points],
        input.bounds,
        resolution=input.resolution,
        wall_segments=wall_segments,
    )

    # Accurate filled contour bands (non-overlapping intervals) clipped to wall.
    # This replaces the old "close line to rectangle" approximation that caused
    # cross-wall wedges and incorrect color ownership.
    polygons_out: List[List[List[tuple]]] = []
    polygon_heights: List[float] = []
    bands = contour_map.filled_bands(input.heights)
    for band in bands:
        lo = float(band["lo"])
        hi = float(band["hi"])
        h_mid = (lo + hi) * 0.5
        for poly in band["polygons"]:
            rings: List[List[tuple]] = []
            for ring in poly:
                coords = [(float(x), float(y)) for (x, y) in ring]
                if len(coords) < 3:
                    continue
                # Normalize closure and orientation for stable even-odd rendering.
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                try:
                    ring_obj = LinearRing(coords)
                    coords = list(ring_obj.coords)
                except Exception:
                    continue
                rings.append(coords)
            if rings:
                polygons_out.append(rings)
                polygon_heights.append(h_mid)

    wall_polygon = make_valid(Polygon(wall_pts))

    # Clip contour lines against the wall polygon.
    raw_lines: List = [contour_map.lines_at_height(h) for h in input.heights]
    clipped_lines: List[List] = []
    clipped_line_heights: List[float] = []
    for hi, lines_at_h in enumerate(raw_lines):
        for line in lines_at_h:
            if line is None or len(line) < 2:
                continue
            try:
                ls = LineString([(float(p[0]), float(p[1])) for p in line])
            except Exception:
                continue
            if not ls.is_valid:
                continue
            inter = ls.intersection(wall_polygon)
            if inter.is_empty:
                continue
            geoms = []
            if isinstance(inter, LineString):
                geoms = [inter]
            elif isinstance(inter, MultiLineString):
                geoms = list(inter.geoms)
            elif isinstance(inter, GeometryCollection):
                geoms = [g for g in inter.geoms if isinstance(g, LineString)]
            for geom in geoms:
                coords = list(geom.coords)
                if len(coords) < 2:
                    continue
                clipped_lines.append(coords)
                clipped_line_heights.append(float(input.heights[hi]))

    return ContourPolygonOutput.model_validate({
        "input": input,
        "polygons": polygons_out,
        "heights": polygon_heights,
        "lines": clipped_lines,
        "line_heights": clipped_line_heights,
    })
