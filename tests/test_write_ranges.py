"""Boundary regressions for writes in display units and schedule encoding."""
from test_register_decoding import registers
import unittest
import math

class WriteTests(unittest.TestCase):
    def test_signed_round_trip(self):
        for key, value, wire in [('auto_reduct', -15, 65521),('room_gain_max',-4,65496),('return_gain_max',-2,65516),('heating_curve_slope',0.7,7),('minimum_activation_time',200,10)]:
            r=registers.REGISTERS_BY_KEY[key]
            self.assertEqual(r.encode(value),wire)
            self.assertAlmostEqual(r.decode(wire),value)

    def test_rounding_never_silently_changes_request(self):
        for key,value in [('heating_curve_slope',0.75),('minimum_activation_time',201),('room_gain_max',-10),('pump_heat_temperature',4),('pump_heat_temperature',41)]:
            with self.assertRaises(ValueError):registers.REGISTERS_BY_KEY[key].encode(value)
        for value in [math.nan,math.inf,-math.inf]:
            with self.assertRaises(ValueError):registers.REGISTERS_BY_KEY['heating_curve_slope'].encode(value)

    def test_schedule_end_of_day(self):
        r=registers.REGISTERS_BY_KEY['schedule_monday_stop_2']
        for raw in (0,30,600,2330,2400):r.validate_raw_write(raw)
        self.assertEqual(r.decode(2400),'24:00')
        for raw in (15,1260,2360,2430,65535):
            with self.assertRaises(ValueError):r.validate_raw_write(raw)
            self.assertIsNone(r.decode(raw))
        self.assertEqual(len(r.verified_write_values),49)

    def test_unknown_settings_cannot_be_written(self):
        for key in ('modbus_address','ecl_address','clock_year','unknown_60020','actuator_type','pump_exercise','external_override'):
            with self.assertRaises(ValueError):registers.REGISTERS_BY_KEY[key].validate_raw_write(1)

    def test_whole_documented_ranges(self):
        for r in registers.SAFE_WRITABLE_REGISTERS:
            if r.verified_write_values:
                for raw in r.verified_write_values:r.validate_raw_write(raw)
            else:
                lo,hi=r.verified_write_range
                for raw in (lo,hi):r.validate_raw_write(raw&65535)
                for raw in (lo-1,hi+1):
                    with self.assertRaises(ValueError):r.validate_raw_write(raw&65535)
