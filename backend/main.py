from fastapi import Depends, FastAPI, Query, Request  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from pydantic import BaseModel  # type: ignore
from models.statics.json import BeamJSON
from models.statics.beam import BeamInput, CreateBeam
from core.units.imperial import *
from models.countouring.json import (
    ContourInput,
    ContourOutput,
    ContourPolygonInput,
    ContourPolygonOutput,
)
from auth import BetaKey, require_api_key, validate as validate_api_key
from feedback import (
    ALLOWED_CATEGORIES,
    FeedbackEntry,
    append_entry as append_feedback,
    count_entries as count_feedback,
    read_entries as read_feedback,
)
import logging
import math
import os

app = FastAPI(title="Engineering Platform API")

LOG_FILE = "api.log"
logging_level = logging.INFO

# Configure the root logger
logging.basicConfig(level=logging_level,
                    format='[%(asctime)s.%(msecs)03d] %(levelname)s [%(thread)d] - %(message)s',
                    handlers=[logging.FileHandler(LOG_FILE)])

# CORS origins: defaults cover Vite dev servers on localhost. When hosted,
# set BLUEBIRD_CORS_ORIGINS to a comma-separated list of frontend origins
# (e.g. "https://fls.example.com,https://fls-staging.example.com").
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
_env_origins = [
    o.strip()
    for o in os.environ.get("BLUEBIRD_CORS_ORIGINS", "").split(",")
    if o.strip()
]
origins = _env_origins or _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




@app.get("/")
def read_root():
    return {"status": "backend running"}


# ── Access control ─────────────────────────────────────────────────────────
#
# The beta gate relies on two endpoints that are themselves *not* behind the
# API-key dependency:
#
#   - GET  /auth/status       — cheap existence/health check for the gate UI
#   - POST /auth/validate     — used by the gate to verify a freshly-entered
#                               key before we persist it in localStorage.
#
# Everything under the solver / calculation surface requires a valid key via
# the ``require_api_key`` dependency.

class AuthValidateRequest(BaseModel):
    key: str


@app.get("/auth/status")
def auth_status():
    return {"status": "ok", "auth": "api_key"}


@app.post("/auth/validate")
def auth_validate(payload: AuthValidateRequest):
    result = validate_api_key(payload.key or "")
    if not result.ok:
        return {
            "ok": False,
            "reason": result.reason or "invalid",
        }
    return {
        "ok": True,
        "label": result.label,
        "expires_at": result.expires_at,
    }


# ── User feedback ─────────────────────────────────────────────────────────

class FeedbackSubmission(BaseModel):
    category: str = "other"
    message: str
    page: str = ""
    user_agent: str = ""


@app.post("/feedback")
def submit_feedback(
    payload: FeedbackSubmission,
    request: Request,
    key: BetaKey = Depends(require_api_key),
):
    message = (payload.message or "").strip()
    if not message:
        return {"status": "Failure", "message": "Feedback message cannot be empty."}
    # Prefer the page the frontend reports (it knows the route); fall back
    # to the referer URL so we always capture some locator.
    page = (payload.page or request.headers.get("referer") or "").strip()
    # Prefer client-reported UA (matches what the user actually sees) but
    # fall back to the transport header so we always have *something*.
    ua = (payload.user_agent or request.headers.get("user-agent") or "").strip()

    entry = FeedbackEntry(
        label=key.label or "(unlabelled key)",
        category=payload.category or "other",
        page=page[:500],
        user_agent=ua[:500],
        message=message,
    )
    stored = append_feedback(entry)
    logging.info(
        "feedback received id=%s label=%s category=%s page=%s",
        stored.id, stored.label, stored.category, stored.page,
    )
    return {"status": "Okay", "id": stored.id, "created_at": stored.created_at}


@app.get("/feedback")
def list_feedback(
    limit: int = Query(default=100, ge=1, le=1000),
    _key: BetaKey = Depends(require_api_key),
):
    entries = read_feedback(limit=limit)
    return {
        "status": "Okay",
        "total": count_feedback(),
        "returned": len(entries),
        "categories": sorted(ALLOWED_CATEGORIES),
        "entries": [e.to_dict() for e in entries],
    }


@app.post("/beam_calc")
def beam_calc(beam: BeamJSON, _key: BetaKey = Depends(require_api_key)):
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
def fls_get_contours(fls_input: ContourInput, _key: BetaKey = Depends(require_api_key)):
    output = fls_input.get_output()
    lines = []
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
def fls_get_contour_polygons(
    fls_input: ContourPolygonInput,
    _key: BetaKey = Depends(require_api_key),
):
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
        "heights": [float(h) for h in fls_input.heights],
        "polygons": polygons_payload,
        "polygon_heights": polygon_heights,
        "lines": lines_payload,
        "line_heights": line_heights,
    }
