from models.countouring.contourmap import CreateContourMap
from models.countouring.json import ContourInput
import numpy as np


def test_contour_map():
    count = 20
    # [xmin, ymin, xmax, ymax]
    bounds = [-2.0, -3.0, 3.0, 2.0]
    xs = (bounds[2] - bounds[0]) * np.random.rand(count) + bounds[0]
    ys = (bounds[3] - bounds[1]) * np.random.rand(count) + bounds[1]
    zs = np.sqrt(xs**2 + ys**2)
    cmap = CreateContourMap(xs.tolist(), ys.tolist(), zs.tolist(), bounds)
    assert cmap


def test_contour_lines():
    count = 20
    bounds = [-2.0, -3.0, 3.0, 2.0]
    xs = (bounds[2] - bounds[0]) * np.random.rand(count) + bounds[0]
    ys = (bounds[3] - bounds[1]) * np.random.rand(count) + bounds[1]
    xs[0] = -1.5
    ys[0] = 1.5
    xs[1] = 0
    ys[1] = 0
    zs = np.sqrt(xs**2 + ys**2)
    cmap = CreateContourMap(xs.tolist(), ys.tolist(), zs.tolist(), bounds)
    lines = cmap.lines_at_height(0.5)
    assert lines is not None


def test_contour_input():
    json_input = {
        "bounds": [-2.0, -3.0, 3.0, 2.0],
        "points": [
            {"x": 0, "y": 0, "z": 2.1},
            {"x": 2, "y": 0, "z": 1.4},
            {"x": 2, "y": 1, "z": 0.2},
            {"x": -1, "y": 1.5, "z": 3.9},
            {"x": -1.5, "y": 0.5, "z": 0.8},
        ],
        "heights": [1, 2, 3],
    }
    inp = ContourInput.model_validate(json_input)
    assert inp.bounds == [-2.0, -3.0, 3.0, 2.0]
    assert inp.points[3].x == -1
    assert inp.points[3].y == 1.5
    assert inp.points[3].z == 3.9


def test_contour_output():
    json_input = {
        "bounds": [-2.0, -3.0, 3.0, 2.0],
        "points": [
            {"x": 0, "y": 0, "z": 2.1},
            {"x": 2, "y": 0, "z": 1.4},
            {"x": 2, "y": 1, "z": 0.2},
            {"x": -1, "y": 1.5, "z": 3.9},
            {"x": -1.5, "y": 0.5, "z": 0.8},
        ],
        "heights": [1, 2, 3],
    }
    inp = ContourInput.model_validate(json_input)
    output = inp.get_output()
    assert output
    assert output.lines
    assert output.Xi and output.Yi and output.Zi
    assert output.fills is not None
