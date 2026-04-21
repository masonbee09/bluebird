from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from models.statics.json import BeamJSON
from models.statics.beam import BeamInput, CreateBeam
from core.units.imperial import *
from models.countouring.json import (
    ContourInput,
    ContourOutput,
    ContourPolygonInput,
    ContourPolygonOutput,
)
import logging
import math

app = FastAPI(title="Engineering Platform API")

LOG_FILE = "api.log"
logging_level = logging.INFO

# Configure the root logger
logging.basicConfig(level=logging_level,
                    format='[%(asctime)s.%(msecs)03d] %(levelname)s [%(thread)d] - %(message)s',
                    handlers=[logging.FileHandler(LOG_FILE)])

origins = [
    "http://localhost:5173",  # Vite default
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)




@app.get("/")
def read_root():
    return {"status": "backend running"}

@app.post("/beam_calc")
def beam_calc(beam: BeamJSON):
    try:
        tempjson = beam.model_dump()
        length_units = foot
        if tempjson["length_units"] == "inch":
            length_units = inch
        beam = CreateBeam(tempjson["span"] * length_units, tempjson["supports"], tempjson["loads"])
        return {"status": "Okay"}
    except Exception as e:
        return {"status": "Failure",
                "Message": str(e)}
    

@app.post("/fls_get_contours")
def fls_get_contours(fls_input: ContourInput):
    output = fls_input.get_output()
    # logging.info(output)
    lines = []
    # for l1 in output.lines:
    #     lines.append([])
    #     for l2 in l1:
    #         l1.append([])
    #         for p in l2:
    #             l2.append({"x": p[0], "y": p[1]})
    for i in range(len(output.lines)):
        lines.append([])
        for j in range(len(output.lines[i])):
            lines[i].append([])
            for k in range(len(output.lines[i][j])):
                lines[i][j].append({"x": output.lines[i][j][k][0], "y": output.lines[i][j][k][1]})

    fills_payload = []
    for band in (output.fills or []):
        polygons = []
        for poly in band.polygons:
            rings = [[{"x": float(p[0]), "y": float(p[1])} for p in ring] for ring in poly.rings]
            polygons.append({"rings": rings})
        fills_payload.append({
            "lo": band.lo,
            "hi": band.hi,
            "polygons": polygons,
        })

    return {
        "status": "Okay",
        "heights": output.input.heights,
        "lines": lines,
        "Xi": output.Xi,
        "Yi": output.Yi,
        "Zi": output.Zi,
        "fills": fills_payload,
    }


@app.post("/fls_get_contour_polygons")
def fls_get_contour_polygons(fls_input: ContourPolygonInput):
    try:
        output = fls_input.get_output()
    except Exception as exc:
        logging.exception("fls_get_contour_polygons failed")
        return {"status": "Failure", "message": str(exc)}

    polygons_payload = []
    polygon_heights = []
    for polygon, height in zip(output.polygons, output.heights):
        rings_payload = []
        for ring in polygon:
            points = []
            for p in ring:
                x = float(p[0])
                y = float(p[1])
                if not (math.isfinite(x) and math.isfinite(y)):
                    continue
                points.append({"x": x, "y": y})
            if len(points) >= 3:
                rings_payload.append(points)
        if rings_payload:
            polygons_payload.append({"rings": rings_payload})
            polygon_heights.append(float(height))

    lines_payload = []
    line_heights = []
    for line, height in zip(output.lines, output.line_heights):
        points = []
        for p in line:
            x = float(p[0])
            y = float(p[1])
            if not (math.isfinite(x) and math.isfinite(y)):
                continue
            points.append({"x": x, "y": y})
        if len(points) >= 2:
            lines_payload.append(points)
            line_heights.append(float(height))

    return {
        "status": "Okay",
        # User-requested contour levels (independent of whether they produced
        # visible polygons). Frontend uses this for the colour legend range.
        "heights": [float(h) for h in fls_input.heights],
        # One polygon per entry in polygon_heights; each clipped to the wall.
        "polygons": polygons_payload,
        "polygon_heights": polygon_heights,
        # Clipped contour lines + their per-line height.
        "lines": lines_payload,
        "line_heights": line_heights,
    }