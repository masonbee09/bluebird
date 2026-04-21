from pydantic import BaseModel, Field
from enum import Enum
from typing import Literal, Annotated
from pydantic_pint import PydanticPintQuantity
from pint import Quantity
from core.units.imperial import *





Length = Annotated[Quantity, PydanticPintQuantity("foot", ureg=imperial, restriction="dimensions")]
Force = Annotated[Quantity, PydanticPintQuantity("pound_force", ureg=imperial, restriction="dimensions")]
ForcePerLength = Annotated[Quantity, PydanticPintQuantity("pound_force/foot", ureg=imperial, restriction="dimensions")]


class LoadType(str, Enum):
    POINT = "point"
    DISTRIBUTED = "distributed"
    MOMENT = "moment"


class Load(BaseModel):
    type: LoadType = Field(..., description="The type of load")


class PointLoad(Load):
    type: Literal[LoadType.POINT] = LoadType.POINT
    value: Force = Field(..., description="Value of the load (+Y is positive)")
    position_x: Length = Field(..., description="x-coordinate along the length where the load is applied")

    def centroid(self):
        return self.position_x
    
    def total_force(self):
        return self.value
    
    def moment_about_zero(self):
        return self.total_force() * self.centroid()

    def shear_at_point(self, x: Length):
        if x < self.position_x:
            return 0
        else:
            return self.value
        
    def moment_at_point(self, x: Length):
        if x < self.position_x:
            return 0
        else:
            return self.value * (x - self.position_x)
        
    def slope_at_point(self, x: Length):
        if x < self.position_x:
            return 0
        else:
            return self.value * (x - self.position_x) ** 2 / 2
        
    def deflection_at_point(self, x: Length):
        if x < self.position_x:
            return 0
        else:
            return self.value * (x - self.position_x) ** 3 / 6

def CreatePointLoad(value: Force, position_x: Length):
    data = {"value": value, "position_x": position_x}
    return PointLoad.model_validate(data)


class DistributedLoad(Load):
    type: Literal[LoadType.DISTRIBUTED] = LoadType.DISTRIBUTED
    start_x: Length
    end_x: Length
    
    value_start: ForcePerLength = Field(..., description="Value of the load at the start_x position (+Y is positive)")
    value_end: ForcePerLength = Field(..., description="Value of the load at the end_x position (+Y is positive)")
    
    @property
    def load_slope(self):
        return (self.value_end - self.value_start) / (self.end_x - self.start_x)
    
    def centroid(self):
        return (self.start_x + (self.end_x - self.start_x) * (2 * self.value_end + self.value_start) / (3 * self.value_end + 3 * self.value_start))
    
    def total_force(self):
        return (self.value_start + self.value_end) / 2 * (self.end_x - self.start_x)
    
    def moment_about_zero(self):
        return (self.total_force() * self.centroid())
    
    def shear_at_point(self, x: Length):
        if (x <= self.start_x):
            return 0 * pound
        elif (x <= self.end_x):
            return self.load_slope * (x - self.start_x) ** 2 / 2 + self.value_start * (x - self.start_x)
        else:
            p2xmp1x = self.end_x - self.start_x
            p2ymp1y = self.value_end - self.value_start
            return (p2ymp1y / 2 + self.value_start) * p2xmp1x
    
    def moment_at_point(self, x: Length):
        if (x <= self.start_x):
            return 0 * pound * foot
        elif (x <= self.end_x):
            return self.load_slope * (x - self.start_x) ** 3 / 6 + self.value_start * (x - self.start_x) ** 2 / 2
        else:
            p2xmp1x = self.end_x - self.start_x
            p2ymp1y = self.value_end - self.value_start
            p1y = self.value_start
            p2x = self.end_x
            v1 = (p2ymp1y / 2 + p1y) * (p2xmp1x) * (x - p2x)
            v2 = (p2ymp1y / 3 + p1y) * (p2xmp1x)**2 / 2
            return v1 + v2
    
    def slope_at_point(self, x: Length):
        if (x <= self.start_x):
            return 0 * pound * foot ** 2
        elif (x <= self.end_x):
            return self.load_slope * (x - self.start_x) ** 4 / 24 + self.value_start * (x - self.start_x) ** 3 / 6
        else:
            p2xmp1x = self.end_x - self.start_x
            p2ymp1y = self.value_end - self.value_start
            p1y = self.value_start
            p2x = self.end_x
            v1 = (p2ymp1y / 2 + p1y) * (p2xmp1x) * (x - p2x)**2 / 2
            v2 = (p2ymp1y / 3 + p1y) * (p2xmp1x)**2 / 2 * (x - p2x)
            v3 = (p2ymp1y / 4 + p1y) * (p2xmp1x)**3 / 6
            return v1 + v2 + v3
    
    def deflection_at_point(self, x: Length):
        if (x <= self.start_x):
            return 0 * pound * foot ** 3
        elif (x <= self.end_x):
            return self.load_slope * (x - self.start_x) ** 5 / 120 + self.value_start * (x - self.start_x) ** 4 / 24
        else:
            p2xmp1x = self.end_x - self.start_x
            p2ymp1y = self.value_end - self.value_start
            p1y = self.value_start
            p2x = self.end_x
            v1 = (p2ymp1y / 2 + p1y) * (p2xmp1x) * (x - p2x)**3 / 6
            v2 = (p2ymp1y / 3 + p1y) * (p2xmp1x)**2 / 2 * (x - p2x)**2 / 2
            v3 = (p2ymp1y / 4 + p1y) * (p2xmp1x)**3 / 6 * (x - p2x)
            v4 = (p2ymp1y / 5 + p1y) * (p2xmp1x)**4 / 24
            return v1 + v2 + v3 + v4
        

def CreateDistributedLoad(value_start: ForcePerLength, value_end: ForcePerLength, start_x: Length, end_x: Length):
    data = {"value_start": value_start, "value_end": value_end, "start_x": start_x, "end_x": end_x}
    return DistributedLoad.model_validate(data)
        

__all__ = ['PointLoad', 'DistributedLoad', 'CreatePointLoad', 'CreateDistributedLoad']
