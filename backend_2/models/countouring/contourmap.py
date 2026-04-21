from contourpy import contour_generator
from pydantic import BaseModel, Field
from typing import List
import numpy as np
from scipy.interpolate import griddata
import math
import logging
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import cKDTree




class ContourMap(BaseModel):
    xs: List[float]
    ys: List[float]
    zs: List[float]
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0] = xMin, [1] = yMin, [2] = xMax, [3] = yMax")
    resolution: int = 100

    @property
    def interpolated(self):
        bounds = self.bounds

        xi = np.linspace(bounds[0], bounds[2], self.resolution)
        yi = np.linspace(bounds[1], bounds[3], self.resolution)
        Xi, Yi = np.meshgrid(xi, yi)

        # Convert lists → numpy arrays (CRITICAL)
        xs = np.asarray(self.xs)
        ys = np.asarray(self.ys)
        zs = np.asarray(self.zs)

        # Linear interpolation (inside convex hull)
        interp_lin = LinearNDInterpolator(
            np.column_stack([xs, ys]),
            zs,
            fill_value=np.nan
        )

        Zi_lin = interp_lin(Xi, Yi)

        # k-nearest inverse-distance extrapolation
        points = np.column_stack([xs, ys])
        tree = cKDTree(points)

        grid_points = np.column_stack([Xi.ravel(), Yi.ravel()])

        k = min(5, len(points))
        if k == 0:
            raise ValueError("At least one point is required to generate contours")
        dist, idx = tree.query(grid_points, k=k)

        if k == 1:
            dist = dist[:, np.newaxis]
            idx = idx[:, np.newaxis]

        z_neighbors = zs[idx]

        weights = 1.0 / (dist + 1e-12)
        weights /= weights.sum(axis=1, keepdims=True)

        Zi_knn = np.sum(weights * z_neighbors, axis=1)
        Zi_knn = Zi_knn.reshape(Xi.shape)

        Zi = np.where(np.isnan(Zi_lin), Zi_knn, Zi_lin)

        return (Xi, Yi, Zi)


    def lines_at_height(self, height: float):
        cont_gen = contour_generator(self.interpolated[0], self.interpolated[1], self.interpolated[2])
        lines = cont_gen.lines(height)
        logging.info(f"Generated {len(lines)} contour lines at height {height}")
        return lines




def CreateContourMap(xs: List[float], ys: List[float], zs: List[float], bounds: List[float], resolution: int = 50):
    return ContourMap.model_validate({"xs": xs, "ys": ys, "zs": zs, "bounds": bounds, "resolution": resolution})


def find_closest_i_j(x, y, Xi, Yi, Zi):
  min_dist = math.inf
  min_i = 0
  min_j = 0
  for i in range(Xi.shape[0]):
    for j in range(Xi.shape[1]):
      if math.isnan(Zi[i,j]):
        continue
      dist = (x - Xi[i,j])**2 + (y - Yi[i,j])**2
      if dist < min_dist:
        min_dist = dist
        min_i = i
        min_j = j
  return min_i, min_j


__all__ = ['ContourMap', 'CreateContourMap']