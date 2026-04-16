import pint
from pint import Quantity
import math


imperial = pint.UnitRegistry()


inch = imperial.inch
foot = imperial.foot
pound = imperial.pound_force
kip = imperial.kip

def unit_equal(unit1, unit2, rel_tol=1e-9):
    def get_magnitude(value):
        if isinstance(value, Quantity):
            return value.to_base_units().magnitude
        elif isinstance(value, (int, float)):
            return value
        else:
            raise TypeError(f"Unsupported type for comparison: {type(value)}")

    mag1 = get_magnitude(unit1)
    mag2 = get_magnitude(unit2)

    return math.isclose(mag1, mag2, rel_tol=rel_tol)


__all__ = ['inch', 'foot', 'pound', 'kip', 'unit_equal', 'imperial']