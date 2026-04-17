from pydantic import BaseModel, Field
from typing import List, Optional
from models.countouring.contourmap import *
import logging


class PointInput(BaseModel):
    x: float
    y: float
    z: float


class ContourInput(BaseModel):
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0] = xMin, [1] = xMax, [2] = yMin, [3] = yMax")
    points: List[PointInput]
    heights: List[float]
    resolution: int = 50
    walls: List[List[float]] = Field(
        default_factory=list,
        description="Flat wall segments, each as [x1, y1, x2, y2]. Used to extend/clip contours.",
    )

    def get_xyzlist(self):
        return [[p.x for p in self.points], [p.y for p in self.points], [p.z for p in self.points]]

    def get_output(self):
        return GetOutputFromInput(self)


class ContourBand(BaseModel):
    low: Optional[float] = None
    high: Optional[float] = None
    color_height: float = 0.0
    fragments: List[List[List[float]]] = Field(default_factory=list)


class ContourOutput(BaseModel):
    input: ContourInput
    lines: List
    bands: List[ContourBand] = Field(default_factory=list)


def CreateContourInput(bounds: List[float], points: List[PointInput], heights: List[float], resolution: int = 50,
                       walls: Optional[List[List[float]]] = None):
    payload = {"bounds": bounds, "points": points, "heights": heights, "resolution": resolution}
    if walls is not None:
        payload["walls"] = walls
    return ContourInput.model_validate(payload)


def CreatePointInputs(xyzlist):
    if len(xyzlist[0]) != 3:
        raise Exception("xyzlist must be in form [[x1, y1, z1], [x2, y2, z2], ...]")
    pointlist = []
    for p in xyzlist:
        pointlist.append(PointInput.model_validate({"x": p[0], "y": p[1], "z": p[2]}))
    return pointlist


def GetContourOutput(bounds: List[float], xyzlist: List, heights: List[float], resolution=50, walls=None):
    if len(xyzlist[0]) != 3:
        raise Exception("xyzlist must be in form [[x1, y1, z1], [x2, y2, z2], ...]")
    points = CreatePointInputs(xyzlist)
    input = CreateContourInput(bounds, points, heights, resolution, walls=walls)
    map = CreateContourMap(
        [p.x for p in points], [p.y for p in points], [p.z for p in points],
        bounds, resolution, walls=walls,
    )
    lines = []
    for h in heights:
        lines.append(map.lines_at_height(h))
    bands_raw = map.fill_bands(heights)
    bands = _bands_to_model(bands_raw)
    output = ContourOutput.model_validate({"input": input, "lines": lines, "bands": bands})
    return output


def _bands_to_model(bands_raw):
    out = []
    for b in bands_raw:
        frags_flat = []
        for ring in b.get("fragments", []):
            frags_flat.append([[float(p[0]), float(p[1])] for p in ring])
        out.append({
            "low": b.get("low"),
            "high": b.get("high"),
            "color_height": float(b.get("colorHeight", 0.0)),
            "fragments": frags_flat,
        })
    return out


def GetOutputFromInput(input: ContourInput):
    map = CreateContourMap(
        [p.x for p in input.points],
        [p.y for p in input.points],
        [p.z for p in input.points],
        input.bounds,
        walls=input.walls,
    )
    lines = []
    for h in input.heights:
        lines.append(map.lines_at_height(h))
    bands_raw = map.fill_bands(input.heights)
    bands = _bands_to_model(bands_raw)
    return ContourOutput.model_validate({"input": input, "lines": lines, "bands": bands})
