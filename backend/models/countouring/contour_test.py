from models.countouring.contourmap import *
from models.countouring.json import *
import numpy as np



def test_contour_map():
    count = 20
    bounds = [-2,3,-3,2]
    xs = (bounds[1] - bounds[0]) * np.random.rand(count) + bounds[0]
    ys = (bounds[3] - bounds[2]) * np.random.rand(count) + bounds[2]
    zs = np.sqrt(xs**2 + ys**2)
    map = CreateContourMap(xs, ys, zs, bounds)
    assert map


def test_contour_lines():
    count = 20
    bounds = [-2,3,-3,2]
    xs = (bounds[1] - bounds[0]) * np.random.rand(count) + bounds[0]
    ys = (bounds[3] - bounds[2]) * np.random.rand(count) + bounds[2]
    xs[0] = -1.5
    ys[0] = 1.5
    xs[1] = 0
    ys[1] = 0
    zs = np.sqrt(xs**2 + ys**2)
    map = CreateContourMap(xs, ys, zs, bounds)
    lines = map.lines_at_height(.5)
    assert lines


def test_contour_input():
    jsonInput = {"bounds": [-2, -3, 3, 2],
                 "points": [{"x": 0, "y": 0, "z": 2.1},
                            {"x": 2, "y": 0, "z": 1.4},
                            {"x": 2, "y": 1, "z": 0.2},
                            {"x": -1, "y": 1.5, "z": 3.9},
                            {"x": -1.5, "y": 0.5, "z": 0.8},],
                "heights": [1, 2, 3]}
    
    input = ContourInput.model_validate(jsonInput)

    assert input
    assert input.bounds == [-2,3,-3,2]
    assert input.points[3].x == -1
    assert input.points[3].y == 1.5
    assert input.points[3].z == 3.9


def test_contour_output():
    jsonInput = {"bounds": [-2, 3, -3, 2],
                 "points": [{"x": 0, "y": 0, "z": 2.1},
                            {"x": 2, "y": 0, "z": 1.4},
                            {"x": 2, "y": 1, "z": 0.2},
                            {"x": -1, "y": 1.5, "z": 3.9},
                            {"x": -1.5, "y": 0.5, "z": 0.8},],
                "heights": [1, 2, 3]}
    
    input = ContourInput.model_validate(jsonInput)

    output = input.get_output()

    assert output
    assert output.lines