from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from models.statics.json import BeamJSON
from models.statics.beam import BeamInput, CreateBeam
from core.units.imperial import *
from models.countouring.json import ContourInput, ContourOutput
import logging

app = FastAPI(title="Engineering Platform API")

LOG_FILE = "api.log"
logging_level = logging.INFO

# Configure the root logger
logging.basicConfig(level=logging_level,
                    format='[%(asctime)s.%(msecs)03d] %(levelname)s [%(thread)d] - %(message)s',
                    handlers=[logging.FileHandler(LOG_FILE)])

origins = [
    "http://localhost:5173",  # React default port
    "http://127.0.0.1:5173",
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
    try:
        output = fls_input.get_output()
    except Exception as exc:
        logging.exception("Failed to compute contour output")
        return {"status": "Failure", "message": str(exc)}

    lines = []
    for i in range(len(output.lines)):
        lines.append([])
        for j in range(len(output.lines[i])):
            lines[i].append([])
            for k in range(len(output.lines[i][j])):
                lines[i][j].append({
                    "x": float(output.lines[i][j][k][0]),
                    "y": float(output.lines[i][j][k][1]),
                })

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
        "fills": fills_payload,
    }