from models.countouring.contourmap import *
from models.countouring.json import *
import numpy as np
import matplotlib.pyplot as plt
from models.countouring.contour_polygons import get_polygon_from_line, get_intersect_polygon

"""
---- EXAMPLE CURL ----
curl -X 'POST' \
  'http://127.0.0.1:8000/fls_get_contour_polygons' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "bounds": [-2, -3, 3, 2],
  "points": [{"x": 0, "y": 0, "z": 2.1},
                            {"x": 2, "y": 0, "z": 1.4},
                            {"x": 2, "y": 1, "z": 0.2},
                            {"x": -1, "y": 1.5, "z": 3.9},
                            {"x": -1.5, "y": 0.5, "z": 0.8}],
  "wall_points": [{"x": -1.6, "y": -2.8, "z": 0},
    {"x": 2.8, "y": -2.8, "z": 0},
    {"x": 2.8, "y": 0.6, "z": 0},
    {"x": 0.2, "y": 0.6, "z": 0},
    {"x": 0.2, "y": 1, "z": 0},
    {"x": 2.8, "y": 1, "z": 0},
    {"x": 2.8, "y": 1.9, "z": 0},
    {"x": -1.6, "y": 1.9, "z": 0},
    {"x": -1.6, "y": -2.8, "z": 0}],
  "heights": [
    1,2,3
  ],
  "resolution": 50
}'
"""

jsonInput = {"bounds": [-2, -3, 3, 2],
                 "points": [{"x": 0, "y": 0, "z": 2.1},
                            {"x": 2, "y": 0, "z": 1.4},
                            {"x": 2, "y": 1, "z": 0.2},
                            {"x": -1, "y": 1.5, "z": 5},
                            {"x": -1.5, "y": 0.5, "z": 0.8},],
                "heights": [1, 2, 3]}
    
input = ContourInput.model_validate(jsonInput)

output = input.get_output()

lines = output.lines

closed_list = []

height_list_1 = []

for i in range(len(lines)):
    for j in range(len(lines[i])):
        xs = [p[0] for p in lines[i][j]]
        ys = [p[1] for p in lines[i][j]]
        # print(lines[i][j])
        points = list(zip(xs, ys))
        closed_points = get_polygon_from_line(points, input.bounds[0], input.bounds[1], input.bounds[2], input.bounds[3])
        # for c in closed_points:
            # closed_list.append(c)
            # print(c)
            # plt.plot([p[0] for p in c], [p[1] for p in c])
        #     print(p)
        closed_list.append(closed_points)
        # plt.plot(xs, ys)
        plt.plot([p[0] for p in closed_points], [p[1] for p in closed_points])
        height_list_1.append(output.input.heights[i])


wallxs = [-1.6, 2.8, 2.8, .2, .2, 2.8, 2.8, -1.6, -1.6]
wallys = [-2.8, -2.8, .6, .6, 1, 1, 1.9, 1.9, -2.8]

plt.plot(wallxs, wallys, color="red")

height_list_2 = []
intersect_lines = []
for i in range(len(closed_list)):
    intersect_xs, intersect_ys = get_intersect_polygon(list(zip(wallxs, wallys)), closed_list[i])
    for j in range(len(intersect_xs)):
        # print((intersect_xs[j], intersect_ys[j]))
        intersect_lines.append(list(zip(intersect_xs[j], intersect_ys[j])))
        plt.plot(intersect_xs[j], intersect_ys[j], color="black")
        height_list_2.append(height_list_1[i])
print(height_list_2)

plt.show()

string = ''
for i in range(len(wallxs)):
    string += '{\'x\': ' + str(wallxs[i]) + ', \'y\': ' + str(wallys[i]) + ', \'z\': 0},\n'
print(string)