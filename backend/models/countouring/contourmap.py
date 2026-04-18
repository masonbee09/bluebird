from contourpy import contour_generator
from pydantic import BaseModel, Field, ConfigDict, PrivateAttr
from typing import List, Optional, Tuple, Any
import numpy as np
import logging
from scipy.interpolate import (
    LinearNDInterpolator,
    CloughTocher2DInterpolator,
    NearestNDInterpolator,
)

from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import polygonize, unary_union
from matplotlib.path import Path as MplPath


WallSegment = Tuple[Tuple[float, float], Tuple[float, float]]


def _build_wall_polygon(segments: List[WallSegment]) -> Optional[BaseGeometry]:
    """Attempt to build an enclosing polygon (or multipolygon) from wall segments.

    The walls are individual line segments. We union them and then polygonize
    to extract any enclosed regions. If no closed region is found, return None.
    """
    if not segments:
        return None
    lines = []
    for (a, b) in segments:
        if a == b:
            continue
        lines.append(LineString([a, b]))
    if not lines:
        return None
    merged = unary_union(lines)
    polys = list(polygonize(merged))
    if not polys:
        return None
    if len(polys) == 1:
        return polys[0]
    return MultiPolygon(polys)


def _polygon_mask(geom: Optional[BaseGeometry], Xi: np.ndarray, Yi: np.ndarray) -> np.ndarray:
    """Return a boolean mask, same shape as Xi, True where (x,y) is inside geom.

    Uses matplotlib.Path for fast vectorized containment checks. Holes are
    respected. If geom is None, all cells are considered inside.
    """
    if geom is None:
        return np.ones_like(Xi, dtype=bool)

    points = np.column_stack([Xi.ravel(), Yi.ravel()])
    mask = np.zeros(points.shape[0], dtype=bool)

    polys = []
    if isinstance(geom, MultiPolygon):
        polys = list(geom.geoms)
    elif isinstance(geom, Polygon):
        polys = [geom]
    else:
        return np.ones_like(Xi, dtype=bool)

    for poly in polys:
        ext = np.asarray(poly.exterior.coords)
        inside = MplPath(ext).contains_points(points)
        for interior in poly.interiors:
            hole_coords = np.asarray(interior.coords)
            inside &= ~MplPath(hole_coords).contains_points(points)
        mask |= inside

    return mask.reshape(Xi.shape)


def _iter_rings(geom: BaseGeometry):
    """Yield (outer_ring, [inner_rings]) for each Polygon in geom."""
    if isinstance(geom, MultiPolygon):
        for poly in geom.geoms:
            yield _coords(poly.exterior), [_coords(i) for i in poly.interiors]
    elif isinstance(geom, Polygon):
        yield _coords(geom.exterior), [_coords(i) for i in geom.interiors]


def _coords(ring):
    return [(float(x), float(y)) for (x, y) in ring.coords]


class ContourMap(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    xs: List[float]
    ys: List[float]
    zs: List[float]
    bounds: List[float] = Field(min_length=4, max_length=4, description="[0]=xMin, [1]=yMin, [2]=xMax, [3]=yMax")
    resolution: int = 150
    wall_segments: List[Any] = Field(default_factory=list)

    _cached_interp: Optional[Tuple[np.ndarray, np.ndarray, np.ndarray]] = PrivateAttr(default=None)
    _clip_geom_cached: Optional[BaseGeometry] = PrivateAttr(default=None)

    def _clip_geom(self) -> Optional[BaseGeometry]:
        segs = [((s[0][0], s[0][1]), (s[1][0], s[1][1])) for s in self.wall_segments]
        return _build_wall_polygon(segs)

    @property
    def interpolated(self):
        if self._cached_interp is None:
            self._cached_interp = self._compute_interpolated()
        return self._cached_interp

    def _compute_interpolated(self):
        bounds = self.bounds
        clip_geom = self._clip_geom()

        xi = np.linspace(bounds[0], bounds[2], self.resolution)
        yi = np.linspace(bounds[1], bounds[3], self.resolution)
        Xi, Yi = np.meshgrid(xi, yi)

        xs = np.asarray(self.xs, dtype=float)
        ys = np.asarray(self.ys, dtype=float)
        zs = np.asarray(self.zs, dtype=float)

        pts = np.column_stack([xs, ys])

        # Primary smooth interpolator: cubic Clough-Tocher (C1 continuous).
        Zi = None
        if len(self.xs) >= 4:
            try:
                interp = CloughTocher2DInterpolator(pts, zs, fill_value=np.nan)
                Zi = interp(Xi, Yi)
            except Exception as exc:
                logging.warning(f"CloughTocher interpolation failed: {exc}; falling back to linear")

        if Zi is None:
            try:
                interp = LinearNDInterpolator(pts, zs, fill_value=np.nan)
                Zi = interp(Xi, Yi)
            except Exception as exc:
                logging.warning(f"LinearND interpolation failed: {exc}; using nearest")
                Zi = np.full(Xi.shape, np.nan)

        # When a wall polygon is present we fill all NaN cells with nearest-
        # neighbour values so the interpolated field is defined everywhere
        # inside the wall. This allows contour lines to extend past the convex
        # hull of the sample points. We then explicitly mask out cells that
        # lie outside the wall polygon so the fill / Zi surface stops exactly
        # at the wall boundary. Without walls we leave NaN in place so
        # contours stop at the data hull (existing behaviour).
        if clip_geom is not None and len(self.xs) > 0:
            nan_mask = np.isnan(Zi)
            if np.any(nan_mask):
                nearest = NearestNDInterpolator(pts, zs)
                fill_vals = nearest(Xi[nan_mask], Yi[nan_mask])
                Zi[nan_mask] = fill_vals
            inside_mask = _polygon_mask(clip_geom, Xi, Yi)
            Zi[~inside_mask] = np.nan

        self._clip_geom_cached = clip_geom
        return (Xi, Yi, Zi)

    def _cached_clip(self) -> Optional[BaseGeometry]:
        _ = self.interpolated
        return self._clip_geom_cached

    def lines_at_height(self, height: float):
        Xi, Yi, Zi = self.interpolated
        gen = contour_generator(Xi, Yi, Zi)
        raw_lines = gen.lines(height)

        clip = self._cached_clip()
        if clip is None:
            logging.info(f"Generated {len(raw_lines)} contour lines at height {height} (unclipped)")
            return raw_lines

        clipped: List[np.ndarray] = []
        for arr in raw_lines:
            if arr is None or len(arr) < 2:
                continue
            try:
                ls = LineString([(float(p[0]), float(p[1])) for p in arr])
            except Exception:
                continue
            if not ls.is_valid:
                continue
            inter = ls.intersection(clip)
            if inter.is_empty:
                continue
            for piece in _iter_linestrings(inter):
                coords = list(piece.coords)
                if len(coords) >= 2:
                    clipped.append(np.asarray(coords, dtype=float))
        logging.info(f"Generated {len(clipped)} contour lines at height {height} (clipped)")
        return clipped

    def filled_bands(self, heights: List[float]):
        """Return list of {lo, hi, polygons} between consecutive heights.

        polygons is a list of polygons; each polygon is a list of rings where the
        first ring is the outer boundary and subsequent rings are holes.

        To guarantee the wall interior is fully coloured, we extend the band set
        with a low cap (below the minimum requested height) and a high cap
        (above the maximum requested height) whenever the interpolated surface
        reaches values outside the user-provided range. Those cap bands are
        still clipped to the wall polygon so nothing spills outside.
        """
        if len(heights) < 2:
            return []
        Xi, Yi, Zi = self.interpolated
        gen = contour_generator(Xi, Yi, Zi, fill_type="OuterOffset")
        clip = self._cached_clip()

        z_min_ext = None
        z_max_ext = None
        if Zi.size:
            valid = Zi[~np.isnan(Zi)]
            if valid.size > 0:
                z_min_ext = float(np.min(valid)) - 1.0
                z_max_ext = float(np.max(valid)) + 1.0

        band_levels: List[Tuple[float, float]] = []
        if z_min_ext is not None and z_min_ext < heights[0]:
            band_levels.append((z_min_ext, float(heights[0])))
        for i in range(len(heights) - 1):
            band_levels.append((float(heights[i]), float(heights[i + 1])))
        if z_max_ext is not None and z_max_ext > heights[-1]:
            band_levels.append((float(heights[-1]), z_max_ext))

        out = []
        for (lo, hi) in band_levels:
            try:
                points_list, offsets_list = gen.filled(lo, hi)
            except Exception as exc:
                logging.warning(f"filled({lo},{hi}) failed: {exc}")
                out.append({"lo": lo, "hi": hi, "polygons": []})
                continue

            polygons = []
            for pts, offsets in zip(points_list, offsets_list):
                if pts is None or len(pts) == 0:
                    continue
                rings = []
                offs = list(offsets)
                for k in range(len(offs) - 1):
                    ring = pts[offs[k]: offs[k + 1]]
                    if len(ring) >= 3:
                        rings.append([(float(p[0]), float(p[1])) for p in ring])
                if not rings:
                    continue

                shapely_poly = _rings_to_polygon(rings)
                if shapely_poly is None or shapely_poly.is_empty:
                    continue

                if clip is not None:
                    try:
                        clipped_geom = shapely_poly.intersection(clip)
                    except Exception:
                        clipped_geom = shapely_poly
                else:
                    clipped_geom = shapely_poly

                if clipped_geom.is_empty:
                    continue

                for outer, holes in _iter_rings(clipped_geom):
                    polygons.append([outer] + list(holes))

            out.append({"lo": lo, "hi": hi, "polygons": polygons})
        return out


def _iter_linestrings(geom: BaseGeometry):
    from shapely.geometry import LineString as _LS, MultiLineString, GeometryCollection
    if isinstance(geom, _LS):
        yield geom
    elif isinstance(geom, MultiLineString):
        for g in geom.geoms:
            yield g
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            yield from _iter_linestrings(g)


def _rings_to_polygon(rings):
    """Construct a shapely Polygon from a list of rings where the first ring is outer and the rest are holes."""
    if not rings:
        return None
    try:
        outer = rings[0]
        holes = rings[1:] if len(rings) > 1 else None
        poly = Polygon(outer, holes)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly
    except Exception:
        return None


def CreateContourMap(
    xs: List[float],
    ys: List[float],
    zs: List[float],
    bounds: List[float],
    resolution: int = 150,
    wall_segments: Optional[List[WallSegment]] = None,
):
    return ContourMap.model_validate({
        "xs": xs,
        "ys": ys,
        "zs": zs,
        "bounds": bounds,
        "resolution": resolution,
        "wall_segments": wall_segments or [],
    })


__all__ = ["ContourMap", "CreateContourMap"]
