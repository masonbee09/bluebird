from .imperial import *




def test_units():
    assert inch
    assert foot
    assert pound
    assert kip

def test_add_inch():
    val1 = 3 * inch
    val2 = 4 * inch
    calc = val1 + val2
    ans = 7 * inch
    assert calc == ans

def test_add_foot():
    val1 = 3 * foot
    val2 = 4 * foot
    calc = val1 + val2
    ans = 7 * foot
    assert calc == ans

def test_add_inch_and_foot():
    val1 = 6 * inch
    val2 = 4 * foot
    calc = val1 + val2
    ans = 54 * inch
    ans2 = 4.5 * foot
    assert calc == ans
    assert calc == ans2

def test_add_lbs_and_kip():
    val1 = 600 * pound
    val2 = 4 * kip
    calc = val1 + val2
    ans = 4600 * pound
    ans2 = 4.6 * kip
    print(unit_equal(calc, ans))
    assert unit_equal(calc, ans)
    assert unit_equal(calc, ans2)


def test_unit_powers():
    val1 = 3 * inch * inch
    val2 = 4 * foot * foot
    calcp = val1 + val2
    calcm = val1 * val2
    ansp = 579 * inch**2
    ansm = 1728 * inch**4
    assert unit_equal(calcp, ansp)
    assert unit_equal(calcm, ansm)

def test_unit_division():
    val1 = 6 * inch
    val2 = .5 * foot
    calc = val1 / val2
    ans = 1
    assert unit_equal(calc, ans)