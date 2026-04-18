from pydantic import BaseModel, Field
from typing import List, Optional
import math
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
