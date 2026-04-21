from pydantic import BaseModel, Field
from typing import List
from models.countouring.contourmap import *
import logging
from models.countouring.contour_polygons import get_polygon_from_line, get_intersect_polygon
from shapely.geometry import Polygon, LineString, MultiLineString, GeometryCollection
from shapely.validation import make_valid


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


class ContourPolygonInput(BaseModel):
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0] = xMin, [1] = xMax, [2] = yMin, [3] = yMax")
    points: List[PointInput]
    wall_points: List[PointInput] = Field(default_factory=list)
    heights: List[float]
    resolution: int = 50

    def get_output(self):
        return GetPolygonOutputFromInput(self)

class ContourPolygonOutput(BaseModel):
    input: ContourPolygonInput
    polygons: List
    heights: List
    lines: List = Field(default_factory=list)
    line_heights: List = Field(default_factory=list)


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
    # interp = map.interpolated
    # Xi = interp[0].tolist()
    # Yi = interp[1].tolist()
    # Zi = interp[2].tolist()
    # logging.info("lines")
    # logging.info(lines)
    # logging.info("Xi")
    # logging.info(Xi)
    return ContourOutput.model_validate({"input": input, "lines": lines})

def GetPolygonOutputFromInput(input: ContourPolygonInput):
    map = CreateContourMap([p.x for p in input.points], 
                           [p.y for p in input.points], 
                           [p.z for p in input.points], 
                           input.bounds)
    lines = []
    for h in input.heights:
        lines.append(map.lines_at_height(h))
    # interp = map.interpolated
    # Xi = interp[0].tolist()
    # Yi = interp[1].tolist()
    # Zi = interp[2].tolist()

    closed_list = []

    height_list_1 = []

    for i in range(len(lines)):
        for j in range(len(lines[i])):
            xs = [p[0] for p in lines[i][j]]
            ys = [p[1] for p in lines[i][j]]

            points = list(zip(xs, ys))
            closed_points = get_polygon_from_line(points, input.bounds[0], input.bounds[1], input.bounds[2], input.bounds[3])

            closed_list.append(closed_points)
            height_list_1.append(input.heights[i])

    if len(input.wall_points) >= 3:
        wallxs = [p.x for p in input.wall_points]
        wallys = [p.y for p in input.wall_points]
    else:
        # Fallback: use rectangular boundary when wall points are not provided.
        xMin, yMin, xMax, yMax = input.bounds
        wallxs = [xMin, xMax, xMax, xMin, xMin]
        wallys = [yMin, yMin, yMax, yMax, yMin]
    wall_polygon = make_valid(Polygon(list(zip(wallxs, wallys))))

    height_list_2 = []
    intersect_lines = []
    for i in range(len(closed_list)):
        intersect_xs, intersect_ys = get_intersect_polygon(list(zip(wallxs, wallys)), closed_list[i])
        for j in range(len(intersect_xs)):
            # print((intersect_xs[j], intersect_ys[j]))
            intersect_lines.append(list(zip(intersect_xs[j], intersect_ys[j])))
            height_list_2.append(height_list_1[i])
    clipped_lines = []
    clipped_line_heights = []
    for i in range(len(lines)):
        for j in range(len(lines[i])):
            raw_points = lines[i][j]
            if len(raw_points) < 2:
                continue
            line = LineString(raw_points)
            clipped = line.intersection(wall_polygon)
            if clipped.is_empty:
                continue
            geometries = []
            if isinstance(clipped, LineString):
                geometries = [clipped]
            elif isinstance(clipped, MultiLineString):
                geometries = list(clipped.geoms)
            elif isinstance(clipped, GeometryCollection):
                geometries = [g for g in clipped.geoms if isinstance(g, LineString)]
            for geom in geometries:
                coords = list(geom.coords)
                if len(coords) < 2:
                    continue
                clipped_lines.append(coords)
                clipped_line_heights.append(input.heights[i])

    return ContourPolygonOutput.model_validate({
        "input": input,
        "polygons": intersect_lines,
        "heights": height_list_2,
        "lines": clipped_lines,
        "line_heights": clipped_line_heights,
    })