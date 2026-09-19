"""Run with python -m unittest discover -s tests (no HA installation needed)."""

import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "danfoss_ecl110_modbus"
spec = importlib.util.spec_from_file_location("ecl_test_registers", COMPONENT / "registers.py")
registers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = registers
spec.loader.exec_module(registers)
BY_LINE = {r.ecl_line: r for r in registers.REGISTERS if r.ecl_line}

# Supplied direct raw readings paired with physical display observations.
OBSERVATIONS = [
    (2175, 7, 0.7), (2176, 0, 0), (2177, 25, 25), (2178, 43, 43),
    (3015, 0, None), (3182, 65496, -4.0), (3183, 0, 0.0),
    (4030, 50, 50), (4035, 65516, -2.0), (4036, 0, 0.0),
    (4037, 25, 25), (4085, 0, "off"), (5011, 65521, -15),
    (5012, 0, None), (5013, 0, None), (5014, 9, None),
    (5020, 0, "outdoor"), (5021, 0, "off"), (5179, 20, 20),
    (6174, 9, None), (6184, 200, 200), (6185, 60, 60),
    (6186, 96, 96), (6187, 3, 3), (7010, 0, "off"),
    (7022, 1, "on"), (7023, 0, "off"), (7024, 1, "gear"),
    (7052, 0, "off"), (7077, 2, 2), (7078, 20, 20), (7093, 10, 10),
    (7141, 0, "off"), (7162, 29, None), (7189, 10, 200),
    (7198, 1, "on"), (7199, 15, 15), (8310, 16, 16),
    (8311, 10, 10), (8315, 2, "danish"), (8320, 5, 5),
]


class RegisterDecodingTests(unittest.TestCase):
    def test_observed_values(self):
        for menu, raw, expected in OBSERVATIONS:
            with self.subTest(menu=menu):
                register = BY_LINE[str(menu)]
                self.assertEqual(register.decode(raw), expected)
                self.assertIn(raw, register.observed_raw_values)

    def test_off_transitions_and_unknown_values(self):
        for menu, off, active in [(3015, 0, 1), (5012, 0, 3), (5013, 0, 2),
                                  (5014, 9, 10), (6174, 9, 10), (7162, 29, 30)]:
            with self.subTest(menu=menu):
                r = BY_LINE[str(menu)]
                self.assertIsNone(r.decode(off))
                self.assertEqual(r.setting_state(off), "off")
                self.assertEqual(r.setting_state(active), "active")
                self.assertIsInstance(r.decode(active), (int, float))
                self.assertIsNone(r.setting_state(65535))
                self.assertIsNone(r.setting_state(None))

    def test_alternative_options_are_not_guessed(self):
        for menu, raw in [(4085, 1), (5020, 2), (5021, 1), (7022, 0),
                          (7023, 1), (7024, 0), (7052, 1), (7141, 1), (7198, 2)]:
            with self.subTest(menu=menu):
                self.assertEqual(BY_LINE[str(menu)].decode(raw), f"unknown_{raw}")

    def test_external_write_test_observations(self):
        cases = [(8310, 16, 16), (8310, 17, 17), (8311, 10, 10),
                 (8311, 11, 11), (8315, 0, 'english'), (8315, 2, 'danish'),
                 (7198, 0, 'off'), (7198, 1, 'on'), (3015, 0, None),
                 (3015, 1, 1), (5020, 0, 'outdoor'), (5020, 1, 'room'),
                 (5013, 0, None), (5013, 1, 1), (5012, 0, None), (5012, 1, 1)]
        for menu, raw, expected in cases:
            with self.subTest(menu=menu, raw=raw):
                r = BY_LINE[str(menu)]
                self.assertEqual(r.decode(raw), expected)
                self.assertIn(raw, r.observed_raw_values)

    def test_sensor_units_and_signed_temperature_regression(self):
        self.assertEqual(BY_LINE['3015'].unit, 's')
        for menu in ('6184', '6187'):
            self.assertEqual(BY_LINE[menu].unit, 'K')
            self.assertIsNone(BY_LINE[menu].device_class)
        r = registers.REGISTERS_BY_KEY['temperature_s1']
        self.assertEqual(r.decode(65521), -1.5)
        self.assertIsNone(r.decode(1920))
        self.assertEqual(r.decode(215), 21.5)
        self.assertEqual(registers.REGISTERS_BY_KEY['clock_year'].decode(26), 2026)

    def test_unknown_registers_remain_hidden(self):
        self.assertEqual(len(registers.REGISTERS), 112)
        self.assertEqual(len(registers.SENSOR_REGISTERS), 85)
        self.assertEqual(len([r for r in registers.REGISTERS if r.platform is registers.EntityPlatform.NONE]), 27)
        self.assertNotIn('5081', BY_LINE)

    def test_translation_coverage(self):
        for language in ('da', 'en'):
            entries = json.loads((COMPONENT / 'translations' / f'{language}.json').read_text())['entity']['sensor']
            for r in registers.SENSOR_REGISTERS:
                with self.subTest(language=language, key=r.key):
                    self.assertIn(r.key, entries)
                    if r.options:
                        self.assertTrue(set(r.options.values()) <= set(entries[r.key]['state']))
                    if r.off_raw_values:
                        self.assertEqual(set(entries[r.key+'_setting_state']['state']), {'off', 'active'})


if __name__ == '__main__':
    unittest.main()
