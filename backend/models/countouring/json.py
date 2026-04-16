from pydantic import BaseModel, Field
from typing import List
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

    def get_xyzlist(self):
        return [[p.x for p in self.points], [p.y for p in self.points], [p.z for p in self.points]]
    
    def get_output(self):
        return GetOutputFromInput(self)

class ContourOutput(BaseModel):
    input: ContourInput
    lines: List


def CreateContourInput(bounds: List[float], points: List[PointInput], heights: List[float], resolution:int = 50):
    return ContourInput.model_validate({"bounds": bounds, "points": points, "heights": heights, "resolution": resolution})

def CreatePointInputs(xyzlist):
    if len(xyzlist[0]) != 3:
        raise Exception("xyzlist must be in form [[x1, y1, z1], [x2, y2, z2], ...]")
    pointlist = []
    for p in xyzlist:
        pointlist.append(PointInput.model_validate({"x": p[0], "y": p[1], "z": p[2]}))
    return pointlist


def GetContourOutput(bounds: List[float], xyzlist: List, heights: List[float], resolution = 50):
    if len(xyzlist[0]) != 3:
        raise Exception("xyzlist must be in form [[x1, y1, z1], [x2, y2, z2], ...]")
    points = CreatePointInputs(xyzlist)
    input = CreateContourInput(bounds, points, heights, resolution)
    map = CreateContourMap([p.x for p in points], [p.y for p in points], [p.z for p in points], bounds, resolution)
    lines = []
    for h in heights:
        lines.append(map.lines_at_height(h))
    output = ContourOutput.model_validate({"input": input, "lines": lines})
    return output


def GetOutputFromInput(input: ContourInput):
    map = CreateContourMap([p.x for p in input.points], 
                           [p.y for p in input.points], 
                           [p.z for p in input.points], 
                           input.bounds)
    # logging.info("Created contour map for bounds: " + str(input.bounds))
    # logging.info("Number of points: " + str(len(input.points)))
    # logging.info(map.xs)
    # logging.info(map.ys)
    # logging.info(map.zs)
    lines = []
    for h in input.heights:
        # logging.info("Calculating lines at height: " + str(h))
        lines.append(map.lines_at_height(h))
        # logging.info(map.lines_at_height(h))
    # logging.info(lines)
    return ContourOutput.model_validate({"input": input, "lines": lines})