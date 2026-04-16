from contourpy import contour_generator
from pydantic import BaseModel, Field
from typing import List
import numpy as np
from scipy.interpolate import griddata
import math
import logging
from scipy.interpolate import LinearNDInterpolator




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

        # logging.info("Interpolating contour map:")
        # logging.info(xi)
        # logging.info(yi)
        # logging.info(self.xs)
        # logging.info(self.ys)
        # logging.info(self.zs)
        # logging.info(xi[None, :])

        interp = LinearNDInterpolator(
            np.column_stack([self.xs, self.ys]),
            self.zs,
            fill_value=np.nan
        )

        Zi = interp(Xi, Yi)

        # logging.info("Interpolated Z values:")
        # logging.info(Zi)

        # x_edges = np.linspace(bounds[0], bounds[1], self.resolution)
        # y_edges = np.linspace(bounds[2], bounds[3], self.resolution)
        # edges = []
        # for xedge in x_edges:
        #     edges.append([xedge, bounds[2], 0])
        #     edges.append([xedge, bounds[3], 0])
        # for yedge in y_edges:
        #     edges.append([bounds[0], yedge, 0])
        #     edges.append([bounds[1], yedge, 0])

        # xedges = np.linspace(bounds[0], bounds[1], self.resolution)
        # yedges = np.linspace(bounds[2], bounds[3], self.resolution)
        # edges = []

        # for i in range(len(xedges)):
        #     ci, cj = find_closest_i_j(xedges[i], yedges[0], Xi, Yi, Zi)
        #     edges.append([xedges[i], yedges[0], Zi[ci,cj]])
        # for i in range(len(xedges)):
        #     ci, cj = find_closest_i_j(xedges[i], yedges[-1], Xi, Yi, Zi)
        #     edges.append([xedges[i], yedges[-1], Zi[ci,cj]])
        # for i in range(len(yedges)):
        #     ci, cj = find_closest_i_j(xedges[0], yedges[i], Xi, Yi, Zi)
        #     edges.append([xedges[0], yedges[i], Zi[ci,cj]])
        # for i in range(len(yedges)):
        #     ci, cj = find_closest_i_j(xedges[-1], yedges[i], Xi, Yi, Zi)
        #     edges.append([xedges[-1], yedges[i], Zi[ci,cj]])
        
        # newxs = []
        # newys = []
        # newzs = []

        # newxs.extend([e[0] for e in edges])
        # newys.extend([e[1] for e in edges])
        # newzs.extend([e[2] for e in edges])

        # newxs.extend(self.xs)
        # newys.extend(self.ys)
        # newzs.extend(self.zs)

        # Zi = griddata((newxs, newys), newzs, (xi[None, :], yi[:, None]), method='cubic')

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