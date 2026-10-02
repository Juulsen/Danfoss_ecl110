"""Plant schema validation without Home Assistant."""

import importlib.util
from pathlib import Path
import unittest

_ROOT = Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location(
    "ecl_test_plant",
    _ROOT / "custom_components" / "danfoss_ecl110_modbus" / "plant.py",
)
_PLANT = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_PLANT)
normalize_plant = _PLANT.normalize_plant


class PlantTests(unittest.TestCase):
    def test_owner_indirect_plant(self):
        plant = normalize_plant(
            {
                "application": "130",
                "type": "hex",
                "actuator": "gear",
                "emitters": "radiator",
                "components": ["s1", "s3", "s4", "m1", "p1", "radiator", "eca110"],
                "estimate_valve": True,
                "future": "ignored",
            }
        )
        self.assertEqual(plant["version"], 1)
        self.assertEqual(plant["type"], "hex")
        self.assertNotIn("future", plant)
        self.assertEqual(plant["components"], ["s1", "s3", "s4", "m1", "p1", "radiator", "eca110"])
        self.assertTrue(plant["estimate_valve"])

    def test_type_must_match_application(self):
        self.assertEqual(normalize_plant({"application": "130", "type": "dhw_hex"})["type"], "hex")
        self.assertEqual(normalize_plant({"application": "116", "type": "hex"})["type"], "dhw_hex")
        self.assertNotIn("emitters", normalize_plant({"application": "116", "type": "dhw_hex"}))

    def test_flow_switch_and_pump_rules(self):
        heating = normalize_plant({"application": "130", "type": "hex", "components": ["fs", "p1", "radiator"]})
        self.assertNotIn("fs", heating["components"])
        self.assertIn("p1", heating["components"])
        tapping = normalize_plant(
            {"application": "116", "type": "dhw_fs", "components": ["s2", "s3", "s4", "m1", "p1", "fs", "radiator"]}
        )
        self.assertEqual(tapping["components"], ["s2", "s3", "s4", "m1", "fs"])

    def test_entities_and_labels(self):
        plant = normalize_plant(
            {
                "entities": {"room": " sensor.stue ", "heat_power": "", "nope": "x"},
                "labels": {"site": "  Fjernvarme  ", "consumer": ""},
            }
        )
        self.assertEqual(plant["entities"]["room"], "sensor.stue")
        self.assertIsNone(plant["entities"]["heat_power"])
        self.assertNotIn("nope", plant["entities"])
        self.assertEqual(plant["labels"], {"site": "Fjernvarme"})

    def test_empty_input(self):
        plant = normalize_plant(None)
        self.assertEqual(plant["application"], "130")
        self.assertEqual(plant["type"], "hex")
        self.assertEqual(plant["components"], [])


if __name__ == "__main__":
    unittest.main()
