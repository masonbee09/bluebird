from shapely.geometry import Polygon
from shapely.validation import make_valid

def find_quartile(x, y, xMin, xMax, yMin, yMax):
  #0 = left, 1 = top, 2 = right, 3 = bottom
  v1 = (x - xMin) * (yMax - yMin) - (y - yMin) * (xMax - xMin)
  v2 = (x - xMax) * (yMax - yMin) + (y - yMin) * (xMax - xMin)

  if v1 > 0:
    if v2 > 0:
      return 0
    else:
      return 3
  else:
    if v2 > 0:
      return 1
    else:
      return 2

def get_corner_from_quartile(quartile, xMin, xMax, yMin, yMax):
  if quartile == 0:
    return xMax, yMax
  elif quartile == 1:
    return xMin, yMax
  elif quartile == 2:
    return xMin, yMin
  elif quartile == 3:
    return xMax, yMin
  
def get_corner_point_list(q1, q2, xMin, yMin, xMax, yMax):
  temp_points = []
  temp_indexes = [q1]
  qup = q2
  if qup < q1:
    qup += 4
  temp_indexes = list(range(q1, qup))
  for i in range(len(temp_indexes)):
    if temp_indexes[i] >= 4:
      temp_indexes[i] -= 4
    temp_points.append(get_corner_from_quartile(temp_indexes[i], xMin, yMin, xMax, yMax))
  return temp_points

def get_polygon_from_line(line, xMin, yMin, xMax, yMax):
  if len(line) < 2:
    raise Exception("Line must have at least 2 points")
  if (line[0][0] == line[-1][0]) and (line[0][1] == line[-1][1]):
    return line
  linecopy = line[:]
  q1 = find_quartile(line[0][0], line[0][1], xMin, yMin, xMax, yMax)
  q2 = find_quartile(line[-1][0], line[-1][1], xMin, yMin, xMax, yMax)
  points = get_corner_point_list(q1, q2, xMin, yMin, xMax, yMax)
  for p in points:
    linecopy.append((p[0], p[1]))
  linecopy.append((line[0][0], line[0][1]))
  return linecopy

def get_intersect_polygon(line, wall_line):

    poly_wall = make_valid(Polygon(wall_line))
    poly_shape = make_valid(Polygon(line))

    new_shapes = poly_wall.intersection(poly_shape)
    if new_shapes.is_empty:
      return [], []
    if isinstance(new_shapes, Polygon):
      new_shapes = [new_shapes]
    elif hasattr(new_shapes, "geoms"):
      new_shapes = list(new_shapes.geoms)
    else:
      return [], []

    intxlist = []
    intylist = []
    for shape in new_shapes:
        if not isinstance(shape, Polygon) or shape.is_empty:
          continue
        intxs, intys = shape.exterior.xy
        intxlist.append(intxs)
        intylist.append(intys)

    return intxlist, intylist