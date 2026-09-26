"""Climate contracts with real register encoders and coordinator write logic."""
import importlib.util
from enum import IntFlag, StrEnum
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

from test_register_decoding import registers
from test_coordinator_write import coordinator, co

ROOT = Path(__file__).resolve().parents[1] / 'custom_components/danfoss_ecl110_modbus'
PREFIX = 'climate_contract'

class HVACMode(StrEnum):
    AUTO='auto'
    HEAT='heat'
    OFF='off'

class Features(IntFlag):
    TARGET_TEMPERATURE=1
    PRESET_MODE=16
    TURN_ON=256
    TURN_OFF=128

class Base:
    @classmethod
    def __class_getitem__(cls, item): return cls
    def __init__(self, coordinator, context=None):
        self.coordinator=coordinator
        self.coordinator_context=context
    @property
    def available(self): return self.coordinator.last_update_success

class HAError(Exception): pass

def module(name, **values):
    result=types.ModuleType(name)
    result.__dict__.update(values)
    return result

package=module(PREFIX, __path__=[str(ROOT)])
stubs={
    PREFIX:package, PREFIX+'.registers':registers, PREFIX+'.coordinator':co,
    PREFIX+'.const':module(PREFIX+'.const', DOMAIN='danfoss_ecl110_modbus', INTEGRATION_AUTHOR='Juulsen', MODEL='ECL110'),
    PREFIX+'.modbus_client':sys.modules['ecl_contract.modbus_client'],
    'homeassistant.config_entries':module('homeassistant.config_entries', ConfigEntry=Base),
    'homeassistant.components':module('homeassistant.components'),
    'homeassistant.components.climate':module('homeassistant.components.climate', ClimateEntity=type('ClimateEntity', (), {})),
    'homeassistant.components.climate.const':module('homeassistant.components.climate.const', ClimateEntityFeature=Features, HVACMode=HVACMode),
    'homeassistant.const':module('homeassistant.const', ATTR_TEMPERATURE='temperature', UnitOfTemperature=types.SimpleNamespace(CELSIUS='°C')),
    'homeassistant.exceptions':module('homeassistant.exceptions', HomeAssistantError=HAError),
    'homeassistant.helpers.device_registry':module('homeassistant.helpers.device_registry', DeviceInfo=dict),
    'homeassistant.helpers.entity':module('homeassistant.helpers.entity', EntityCategory=types.SimpleNamespace(CONFIG='config')),
    'homeassistant.helpers.update_coordinator':module('homeassistant.helpers.update_coordinator', CoordinatorEntity=Base),
}
with patch.dict(sys.modules, stubs):
    spec=importlib.util.spec_from_file_location(PREFIX+'.climate', ROOT/'climate.py')
    climate=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(climate)

def entity():
    c=coordinator();c.last_update_success=True
    c.data={'registers':{'desired_room_temperature':22,'desired_s2':205,'temperature_s2':213,'desired_mode':1}}
    entry=types.SimpleNamespace(unique_id=None,entry_id='test',data={'application':'130'},options={},runtime_data=types.SimpleNamespace(coordinator=c))
    return climate.Ecl110Climate(c,entry),c,entry

class ClimateTests(unittest.IsolatedAsyncioTestCase):
    async def test_optional_room_sensor_and_distinct_targets(self):
        e,c,_=entity()
        self.assertEqual(e.current_temperature,21.3)
        self.assertEqual(e.target_temperature,22)
        self.assertEqual(e.extra_state_attributes['active_target_temperature'],20.5)
        c.data['registers']['temperature_s2']=1920
        self.assertIsNone(e.current_temperature)
        self.assertTrue(e.available)
        c.last_update_success=False
        self.assertFalse(e.available)

    async def test_all_modes_and_presets_write_verified_codes(self):
        e,c,_=entity()
        for preset,raw in climate.PRESET_RAW.items():
            await e.async_set_preset_mode(preset)
            self.assertEqual(c.client.writes[-1],(4200,raw))
            self.assertEqual(e.preset_mode,preset)
        self.assertEqual(e.hvac_mode,HVACMode.OFF)
        await e.async_turn_on()
        self.assertEqual(e.hvac_mode,HVACMode.HEAT)
        await e.async_set_preset_mode('setback')
        count=len(c.client.writes)
        await e.async_turn_on()
        self.assertEqual(len(c.client.writes),count)
        self.assertEqual(e.preset_mode,'setback')
        await e.async_set_hvac_mode(HVACMode.AUTO)
        self.assertEqual(e.preset_mode,'auto')
        await e.async_turn_off()
        self.assertEqual(e.preset_mode,'standby')

    async def test_temperature_limits_and_no_implicit_mode_change(self):
        e,c,_=entity()
        for value in [10,22,30]:
            await e.async_set_temperature(temperature=value)
            self.assertEqual(c.client.writes[-1],(11179,value))
        self.assertEqual(e.hvac_mode,HVACMode.AUTO)
        for value in [9,31,22.5,float('nan'),float('inf'),None]:
            count=len(c.client.writes)
            with self.assertRaises(HAError): await e.async_set_temperature(temperature=value,hvac_mode='heat')
            self.assertEqual(len(c.client.writes),count)
        with self.assertRaises(HAError): await e.async_set_temperature(temperature=22,hvac_mode='cool')
        with self.assertRaises(HAError): await e.async_set_preset_mode('boost')

    async def test_subscription_without_individual_entities(self):
        e,c,_=entity()
        c.async_contexts=lambda: [e.coordinator_context,'temperature_s1']
        self.assertEqual({r.key for r in c._requested_registers()},set(climate.CLIMATE_KEYS)|{'temperature_s1'})

    async def test_application_gate_and_unknown_mode(self):
        e,c,entry=entity()
        for app in ['116','all']:
            entry.data['application']=app
            entities=[]
            await climate.async_setup_entry(None,entry,entities.extend)
            self.assertEqual(entities,[])
        entry.data['application']='130'
        entities=[]
        await climate.async_setup_entry(None,entry,entities.extend)
        self.assertEqual(entities,[])
        entry.data['room_temperature_enabled']=True
        entities=[]
        await climate.async_setup_entry(None,entry,entities.extend)
        self.assertEqual(len(entities),1)
        c.data['registers']['desired_mode']=99
        self.assertIsNone(e.hvac_mode)
        self.assertFalse(e.available)

    async def test_failed_write_does_not_publish_requested_target(self):
        e,c,_=entity()
        async def fail(**kwargs): raise climate.EclModbusError('readback failed')
        c.client.async_write_holding_register=fail
        with self.assertRaises(HAError): await e.async_set_temperature(temperature=24)
        self.assertEqual(e.target_temperature,22)

if __name__ == '__main__': unittest.main()
