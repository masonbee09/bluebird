from contourpy import contour_generator
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
import math
import numpy as np
import logging
from scipy.interpolate import LinearNDInterpolator

from models.countouring.contour_tin import (
    _build_triangles,
    chaikin_smooth,
    extend_with_wall_samples,
    tin_contours_at_height,
    tin_fill_band_fragments,
)
from models.countouring.contour_walls import (
    build_wall_polygon,
    clip_polygon_ring,
    clip_polyline,
)




class ContourMap(BaseModel):
    xs: List[float]
    ys: List[float]
    zs: List[float]
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0] = xMin, [1] = yMin, [2] = xMax, [3] = yMax")
    resolution: int = 100
    walls: List[List[float]] = Field(default_factory=list,
                                      description="Flat wall segments, each as [x1, y1, x2, y2].")
    wall_sample_spacing: float = 15.0
    smooth_iterations: int = 2

    model_config = {"arbitrary_types_allowed": True}

    # --- Extended sample helpers -------------------------------------

    def _extended_samples(self) -> Tuple[List[float], List[float], List[float]]:
        """(xs, ys, zs) augmented with IDW-interpolated samples along walls."""
        return extend_with_wall_samples(
            self.xs, self.ys, self.zs, self.walls,
            spacing=self.wall_sample_spacing,
        )

    def _wall_polygon(self):
        return build_wall_polygon(self.walls)

    @property
    def interpolated(self):
        """Dense raster of the scattered measurements. Kept for legacy callers."""
        bounds = self.bounds
        xi = np.linspace(bounds[0], bounds[2], self.resolution)
        yi = np.linspace(bounds[1], bounds[3], self.resolution)
        Xi, Yi = np.meshgrid(xi, yi)
        interp = LinearNDInterpolator(
            np.column_stack([self.xs, self.ys]),
            self.zs,
            fill_value=np.nan,
        )
        Zi = interp(Xi, Yi)
        return (Xi, Yi, Zi)

    # --- Contour lines -----------------------------------------------

    def lines_at_height(self, height: float) -> List[List[Tuple[float, float]]]:
        """Smoothed, wall-clipped contour polylines at `height` from the TIN."""
        xs, ys, zs = self._extended_samples()
        polylines = tin_contours_at_height(xs, ys, zs, height)
        poly = self._wall_polygon()
        out: List[List[Tuple[float, float]]] = []
        for pl in polylines:
            for clipped in clip_polyline(pl, poly):
                if len(clipped) < 2:
                    continue
                is_closed = (
                    len(clipped) >= 3
                    and math.isclose(clipped[0][0], clipped[-1][0], abs_tol=1e-6)
                    and math.isclose(clipped[0][1], clipped[-1][1], abs_tol=1e-6)
                )
                if is_closed:
                    smoothed = chaikin_smooth(clipped[:-1], self.smooth_iterations, closed=True)
                    if smoothed:
                        smoothed = smoothed + [smoothed[0]]
                else:
                    smoothed = chaikin_smooth(clipped, self.smooth_iterations, closed=False)
                out.append(smoothed)
        logging.info(
            f"Generated {len(out)} contour polylines at height {height} (TIN, smoothed)"
        )
        return out

    def lines_at_height_raster(self, height: float):
        """Legacy bitmap-based extractor (kept for reference / comparison)."""
        cont_gen = contour_generator(
            self.interpolated[0], self.interpolated[1], self.interpolated[2]
        )
        lines = cont_gen.lines(height)
        return lines

    # --- Fill bands --------------------------------------------------

    def fill_bands(self, heights: List[float]) -> List[dict]:
        """Return one fill-band descriptor per inter-height slab.

        For heights h_0 < h_1 < ... < h_n the output has n+1 entries:
          band 0:  z <= h_0                (colorHeight = h_0)
          band k:  h_{k-1} <= z <= h_k     (colorHeight = midpoint)
          band n:  z >= h_n                (colorHeight = h_n)

        Each band has a list of outer-ring polygon fragments
        (each already clipped to the walls).
        """
        if not heights:
            return []

        xs, ys, zs = self._extended_samples()
        triangles = _build_triangles(xs, ys, zs)
        if not triangles:
            return []

        poly = self._wall_polygon()
        sorted_h = sorted(set(float(h) for h in heights))

        bounds: List[Tuple[float, float]] = []
        bounds.append((-math.inf, sorted_h[0]))
        for i in range(len(sorted_h) - 1):
            bounds.append((sorted_h[i], sorted_h[i + 1]))
        bounds.append((sorted_h[-1], math.inf))

        out: List[dict] = []
        for h_low, h_high in bounds:
            fragments_raw = tin_fill_band_fragments(
                xs, ys, zs, h_low, h_high, triangles=triangles,
            )
            fragments_clipped: List[List[Tuple[float, float]]] = []
            for ring in fragments_raw:
                for clipped_ring in clip_polygon_ring(ring, poly):
                    if len(clipped_ring) >= 4:
                        # Shapely closes rings with an identical first/last
                        # coord; strip that duplicate before storing so the
                        # frontend just renders a `closed` Konva Line.
                        if (
                            clipped_ring[0][0] == clipped_ring[-1][0]
                            and clipped_ring[0][1] == clipped_ring[-1][1]
                        ):
                            clipped_ring = clipped_ring[:-1]
                        if len(clipped_ring) >= 3:
                            fragments_clipped.append(clipped_ring)

            if math.isfinite(h_low) and math.isfinite(h_high):
                color_h = 0.5 * (h_low + h_high)
            elif math.isfinite(h_low):
                color_h = h_low
            else:
                color_h = h_high

            out.append({
                "low": h_low if math.isfinite(h_low) else None,
                "high": h_high if math.isfinite(h_high) else None,
                "colorHeight": color_h,
                "fragments": fragments_clipped,
            })
        return out




def CreateContourMap(xs: List[float], ys: List[float], zs: List[float], bounds: List[float], resolution: int = 50,
                     walls: Optional[List[List[float]]] = None):
    payload = {
        "xs": xs,
        "ys": ys,
        "zs": zs,
        "bounds": bounds,
        "resolution": resolution,
    }
    if walls is not None:
        payload["walls"] = walls
    return ContourMap.model_validate(payload)


def find_closest_i_j(x, y, Xi, Yi, Zi):
    min_dist = math.inf
    min_i = 0
    min_j = 0
    for i in range(Xi.shape[0]):
        for j in range(Xi.shape[1]):
            if math.isnan(Zi[i, j]):
                continue
            dist = (x - Xi[i, j]) ** 2 + (y - Yi[i, j]) ** 2
            if dist < min_dist:
                min_dist = dist
                min_i = i
                min_j = j
    return min_i, min_j


__all__ = ['ContourMap', 'CreateContourMap']
