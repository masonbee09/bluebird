from .load import *
from core.units.imperial import *
from .beam import *
import numpy as np




# ----- Load Testing -----

def test_load_declaration():
    point = CreatePointLoad(10 * pound, 5 * foot)
    dist = CreateDistributedLoad(8 * pound / foot, -3 * pound / foot, 2 * foot, 7 * foot)
    assert point
    assert dist


def test_distributed_shear():
    dist = CreateDistributedLoad(3 * pound / foot, -1.5 * pound / foot, 2 * foot, 7 * foot)
    calcVs = [dist.shear_at_point(1 * foot), dist.shear_at_point(5 * foot), dist.shear_at_point(9 * foot)]
    ansVs = [0 * pound, 4.95 * pound, 3.75 * pound]
    for i in range(len(calcVs)):
        assert unit_equal(calcVs[i], ansVs[i])

def test_distributed_moment():
    dist = CreateDistributedLoad(3 * pound / foot, -1.5 * pound / foot, 2 * foot, 7 * foot)
    calcVs = [dist.moment_at_point(1 * foot), dist.moment_at_point(5 * foot), dist.moment_at_point(9 * foot)]
    ansVs = [0 * pound * foot, 9.45 * pound * foot, 26.25 * pound * foot]
    for i in range(len(calcVs)):
        assert unit_equal(calcVs[i], ansVs[i])

def test_distributed_slope():
    dist = CreateDistributedLoad(3 * pound / foot, -1.5 * pound / foot, 2 * foot, 7 * foot)
    calcVs = [dist.slope_at_point(1 * foot), dist.slope_at_point(5 * foot), dist.slope_at_point(9 * foot)]
    ansVs = [0 * pound * foot ** 2, 10.4625 * pound * foot ** 2, 84.0625 * pound * foot ** 2]
    for i in range(len(calcVs)):
        assert unit_equal(calcVs[i], ansVs[i])

def test_distributed_deflection():
    dist = CreateDistributedLoad(3 * pound / foot, -1.5 * pound / foot, 2 * foot, 7 * foot)
    calcVs = [dist.deflection_at_point(1 * foot), dist.deflection_at_point(5 * foot), dist.deflection_at_point(9 * foot)]
    ansVs = [0 * pound * foot ** 3, 8.3025 * pound * foot ** 3, 175.3125 * pound * foot ** 3]
    for i in range(len(calcVs)):
        assert unit_equal(calcVs[i], ansVs[i])



def test_point_shear():
    point = CreatePointLoad(1.5 * pound, 4.5 * foot)
    calcs = [point.shear_at_point(1 * foot), point.shear_at_point(8 * foot)]
    ans = [0 * pound, 1.5 * pound]
    for i in range(len(calcs)):
        assert unit_equal(calcs[i], ans[i])

def test_point_moment():
    point = CreatePointLoad(1.5 * pound, 4.5 * foot)
    calcs = [point.moment_at_point(1 * foot), point.moment_at_point(8 * foot)]
    ans = [0 * pound * foot, 5.25 * pound * foot]
    for i in range(len(calcs)):
        assert unit_equal(calcs[i], ans[i])

def test_point_slope():
    point = CreatePointLoad(1.5 * pound, 4.5 * foot)
    calcs = [point.slope_at_point(1 * foot), point.slope_at_point(8 * foot)]
    ans = [0 * pound * foot ** 2, 9.1875 * pound * foot ** 2]
    for i in range(len(calcs)):
        assert unit_equal(calcs[i], ans[i])

def test_point_deflection():
    point = CreatePointLoad(1.5 * pound, 4.5 * foot)
    calcs = [point.deflection_at_point(1 * foot), point.deflection_at_point(8 * foot)]
    ans = [0 * pound * foot ** 3, 10.71875 * pound * foot ** 3]
    for i in range(len(calcs)):
        assert unit_equal(calcs[i], ans[i])




# ----- Beam Testing -----

def test_support_creations():
    support_xs = [2, 5, 7] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, True))
    assert supports

def test_beam_creation():
    support_xs = [2, 5, 7] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, True))
    span = 10 * foot
    loads = [CreatePointLoad(8 * pound, 6 * foot)]
    beam = CreateBeam(span, supports, loads)
    assert beam

def test_single_span_beam():
    support_xs = [0, 10] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, True))
    span = 10 * foot
    loads = [CreatePointLoad(-8 * pound, 5 * foot)]
    beam = CreateBeam(span, supports, loads)
    reactions = beam.calc_support_reactions()
    assert unit_equal(reactions[0], 4 * pound)

def test_three_span_two_cantilever_A_matrix():
    support_xs = [3, 7, 9, 12] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, False))
    span = 15.5 * foot
    loads = [CreatePointLoad(-250 * pound, 5.5 * foot), CreateDistributedLoad(-20 * pound / foot, -35 * pound / foot, 2 * foot, 10 * foot)]
    beam = CreateBeam(span, supports, loads)
    A = beam.get_A_matrix()
    ans = np.array([[1,1,1,1,0,0,0,0,0,0],
                    [36, 84, 108, 144, 1, 1, 1, 1, 0, 0], 
                    [0, 0, 0, 0, 0, 0, 0, 0, 36, 1],
                    [18432, 0,0,0,1152,0,0,0,84,1],
                    [62208,2304,0,0,2592,288,0,0,108,1],
                    [209952,36000,7776,0,5832,1800,648,0,144,1],
                    [0,0,0,0,0,0,0,0,1,0],
                    [1152,0,0,0,48,0,0,0,1,0],
                    [2592,288,0,0,72,24,0,0,1,0],
                    [5832,1800,648,0,108,60,36,0,1,0]])
    ans = np.delete(ans, [4,5,6,7], axis=1)
    ans = np.delete(ans, [6,7,8,9], axis=0)
    # print(np.linalg.inv(A))
    # assert False
    for i in range(ans.shape[0]):
        for j in range(ans.shape[1]):
            assert np.isclose(A[i,j], ans[i,j])

def test_three_span_two_cantilever_b_matrix():
    support_xs = [3, 7, 9, 12] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, False))
    span = 15.5 * foot
    loads = [CreatePointLoad(-250 * pound, 5.5 * foot), CreateDistributedLoad(-20 * pound / foot, -35 * pound / foot, 2 * foot, 10 * foot)]
    beam = CreateBeam(span, supports, loads)
    # print(loads[0].deflection_at_point(9 * foot), loads[1].deflection_at_point(9 * foot))
    b = beam.get_b_matrix()
    bans = np.array([[470], [33300], [1467], [1227375], [6998229], [36831816]])
    # print(np.linalg.inv(A))
    # assert False
    for i in range(bans.shape[0]):
        for j in range(bans.shape[1]):
            # print(i, b[i,j], bans[i,j])
            assert np.isclose(b[i,j], bans[i,j])

def test_three_span_two_cantilever():
    support_xs = [3, 7, 9, 12] * foot
    supports = []
    for i in range(len(support_xs)):
        supports.append(CreateSupport(support_xs[i], True, False))
    span = 15.5 * foot
    loads = [CreatePointLoad(-250 * pound, 5.5 * foot), CreateDistributedLoad(-20 * pound / foot, -35 * pound / foot, 2 * foot, 10 * foot)]
    beam = CreateBeam(span, supports, loads)
    reactions = beam.calc_support_reactions()
    ans = [124 * pound, 373 * pound, -40 * pound, 12 * pound]
    for i in range(len(ans)):
        assert unit_equal(reactions[2 * i], ans[i], 1)
        assert unit_equal(reactions[2 * i + 1], 0, 1)