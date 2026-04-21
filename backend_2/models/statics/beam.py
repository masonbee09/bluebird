from pydantic import BaseModel
from core.units.imperial import *
from typing import Literal, Annotated, List
from pydantic_pint import PydanticPintQuantity
from pint import Quantity
from core.units.imperial import *
from .load import Load
import numpy as np


Length = Annotated[Quantity, PydanticPintQuantity("foot", ureg=imperial, restriction="dimensions")]
Force = Annotated[Quantity, PydanticPintQuantity("pound_force", ureg=imperial, restriction="dimensions")]
ForcePerLength = Annotated[Quantity, PydanticPintQuantity("pound_force/foot", ureg=imperial, restriction="dimensions")]
PSI = Annotated[Quantity, PydanticPintQuantity("pound_force/inch**2", ureg=imperial, restriction="dimensions")]
Inch4 = Annotated[Quantity, PydanticPintQuantity("inch**4", ureg=imperial, restriction="dimensions")]

class Support(BaseModel):
    position_x: Length
    shear_fixity: bool
    moment_fixity: bool

    def deflection_shear_coefficient(self, x: Length):
        if x <= self.position_x:
            return 0
        else:
            return (x - self.position_x)**3 / 6
        
    def deflection_moment_coefficient(self, x: Length):
        if x <= self.position_x:
            return 0
        else:
            return (x - self.position_x)**2 / 2
        
    def slope_shear_coefficient(self, x: Length):
        if x <= self.position_x:
            return 0
        else:
            return (x - self.position_x)**2 / 2
        
    def slope_moment_coefficient(self, x: Length):
        if x <= self.position_x:
            return 0
        else:
            return (x - self.position_x)
        

def CreateSupport(position_x:Length, shear_fixity:bool, moment_fixity:bool):
    return Support.model_validate({"position_x": position_x, "shear_fixity": shear_fixity, "moment_fixity": moment_fixity})

class BeamInput(BaseModel):
    span: Length
    supports: List[Support]
    loads: List[Load]
    E: PSI
    I: Inch4




    def get_remove_indexes(self):
        remove_indexes_b = []
        remove_indexes_A = []
        for i in range(len(self.supports)):
            if not self.supports[i].shear_fixity:
                remove_indexes_b.append(i)
                remove_indexes_A.append(2 + i)
            if not self.supports[i].moment_fixity:
                remove_indexes_b.append(i + len(self.supports))
                remove_indexes_A.append(2 + i + len(self.supports))
        remove_indexes_b = np.sort(remove_indexes_b)
        remove_indexes_A = np.sort(remove_indexes_A)

        return remove_indexes_A, remove_indexes_b


    def get_A_matrix(self):
        size = 2 + 2 * len(self.supports)
        A = np.zeros((size, size))
        for i in range(len(self.supports)):
            A[0,i] = 1
            if isinstance(self.supports[i].position_x, Quantity):
                A[1,i] = self.supports[i].position_x.to('inch').m
            A[1,i + len(self.supports)] = 1
        
        for i in range(len(self.supports)):
            for j in range(len(self.supports)):
                a1 = self.supports[j].deflection_shear_coefficient(self.supports[i].position_x)
                a2 = self.supports[j].deflection_moment_coefficient(self.supports[i].position_x)
                a3 = self.supports[j].slope_shear_coefficient(self.supports[i].position_x)
                a4 = self.supports[j].slope_moment_coefficient(self.supports[i].position_x)
                if isinstance(a1, Quantity):
                    A[2 + i, j] = a1.to('inch**3').m
                if isinstance(a2, Quantity):
                    A[2 + i, j + len(self.supports)] = a2.to('inch**2').m
                if isinstance(a3, Quantity):
                    A[2 + i + len(self.supports), j] = a3.to('inch**2').m
                if isinstance(a4, Quantity):
                    A[2 + i + len(self.supports), j + len(self.supports)] = a4.to('inch').m

        for i in range(len(self.supports)):
            A[2 + i, -2] = self.supports[i].position_x.to('inch').m
            A[2 + i + len(self.supports), -2] = 1
            A[2 + i, -1] = 1

        remove_indexes_A, remove_indexes_b = self.get_remove_indexes()

        if (len(remove_indexes_A) != 0):
            A = np.delete(A, remove_indexes_A, axis=0)
            A = np.delete(A, remove_indexes_b, axis=1)
        
        return A
    
    def get_b_matrix(self):
        V_ext = 0
        M_ext = 0
        d_ext = []
        k_ext = []
        for i in range(len(self.supports)):
            d_ext.append(0)
            k_ext.append(0)
        for i in range(len(self.loads)):
            V_ext += self.loads[i].total_force()
            M_ext += self.loads[i].moment_about_zero()
            for j in range(len(self.supports)):
                d_ext[j] += self.loads[i].deflection_at_point(self.supports[j].position_x)
                k_ext[j] += self.loads[i].slope_at_point(self.supports[j].position_x)

        size = 2 + 2 * len(self.supports)
        b = np.zeros((size, 1))
        if isinstance(V_ext, Quantity):
            b[0,0] = -V_ext.to('pound_force').m
        if isinstance(M_ext, Quantity):
            b[1,0] = -M_ext.to('pound_force*inch').m
        for i in range(len(self.supports)):
            if isinstance(d_ext[i], Quantity):
                b[i + 2,0] = -(d_ext[i].to("pound_force*inch**3")).m
            if isinstance(k_ext[i], Quantity):
                b[i + 2 + len(self.supports),0] = -(k_ext[i].to("pound_force*inch**2")).m

        remove_indexes_A, remove_indexes_b = self.get_remove_indexes()
        print(b)
        print(remove_indexes_A)

        if (len(remove_indexes_A) != 0):
            b = np.delete(b, remove_indexes_A, axis=0)

        return b


    def calc_support_reactions(self):

        A = self.get_A_matrix()

        b = self.get_b_matrix()

        remove_indexes_A, remove_indexes_b = self.get_remove_indexes()

        support_reactions_mag = np.linalg.solve(A, b)
        support_reactions = [0 for i in range(len(self.supports) * 2)]
        current_index = 0
        for i in range(len(self.supports)):
            if self.supports[i].shear_fixity:
                support_reactions[2 * i] = support_reactions_mag[current_index, 0] * pound
                current_index += 1
        for i in range(len(self.supports)):
            if self.supports[i].moment_fixity:
                support_reactions[2 * i + 1] = support_reactions_mag[current_index, 0] * pound * inch
                current_index += 1
        return support_reactions
    
    
def CreateBeam(span: Length, supports: List[Support], loads: List[Load], E:PSI=1 * pound/inch**2, I:Inch4=1 * inch**4):
    return BeamInput.model_validate({"span": span, "supports": supports, "loads": loads, "E": E, "I":I})


__all__ = ['Support', 'BeamInput', 'CreateSupport', 'CreateBeam']