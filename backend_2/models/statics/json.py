from pydantic import BaseModel, Field
from typing import List
from typing import Literal, Annotated, List
from enum import Enum
from models.statics.load import *



class LengthUnit(str, Enum):
    FOOT = "foot"
    INCH = "inch"

class ForceUnit(str, Enum):
    POUND_FORCE = "pound_force"
    KIP = "kip"

class SupportJSON(BaseModel):
    length_units: LengthUnit
    force_units: ForceUnit
    position_x: float
    shear_fixity: bool
    moment_fixity: bool

class LoadType(str, Enum):
    POINT = "point"
    DISTRIBUTED = "distributed"
    MOMENT = "moment"


class LoadJSON(BaseModel):
    length_units: LengthUnit
    force_units: ForceUnit
    type: LoadType = Field(..., description="The type of load")


class PointLoadJSON(LoadJSON):
    type: Literal[LoadType.POINT] = LoadType.POINT
    value: float = Field(..., description="Value of the load (+Y is positive)")
    position_x: float = Field(..., description="x-coordinate along the length where the load is applied")

class DistributedLoad(LoadJSON):
    type: Literal[LoadType.DISTRIBUTED] = LoadType.DISTRIBUTED
    start_x: float
    end_x: float
    
    value_start: float = Field(..., description="Value of the load at the start_x position (+Y is positive)")
    value_end: float = Field(..., description="Value of the load at the end_x position (+Y is positive)")
    


class BeamJSON(BaseModel):
    length_units: LengthUnit
    force_units: ForceUnit
    span: float
    supports: List[SupportJSON]
    loads: List[LoadJSON]




# def LoadJSON_to_Load(load_json: LoadJSON):
#     if load_json["type"] == "point":