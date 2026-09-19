"""Coordinator contracts using minimal HA/client stubs, no live hardware."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest

ROOT=Path(__file__).resolve().parents[1]/'custom_components'/'danfoss_ecl110_modbus'
PREFIX='ecl_contract'
pkg=types.ModuleType(PREFIX);pkg.__path__=[str(ROOT)];sys.modules[PREFIX]=pkg
# Only supply the external interfaces used by coordinator.py.
class Generic:
    @classmethod
    def __class_getitem__(cls,item):return cls
    def async_set_updated_data(self,data):self.data=data
for name in ['homeassistant','homeassistant.config_entries','homeassistant.core','homeassistant.helpers','homeassistant.helpers.update_coordinator']:
    sys.modules.setdefault(name,types.ModuleType(name))
sys.modules['homeassistant.config_entries'].ConfigEntry=Generic
sys.modules['homeassistant.core'].HomeAssistant=Generic
uc=sys.modules['homeassistant.helpers.update_coordinator'];uc.DataUpdateCoordinator=Generic;uc.UpdateFailed=type('UpdateFailed',(Exception,),{})
from datetime import timedelta
c=types.ModuleType(PREFIX+'.const')
for key,val in {'APPLICATION_ALL':'all','DEFAULT_POLL_REGISTER_KEYS':('temperature_s1',),'DEFAULT_SCAN_INTERVAL':timedelta(seconds=15),'DOMAIN':'danfoss_ecl110_modbus','MAX_READ_BLOCK_SIZE':16}.items():setattr(c,key,val)
sys.modules[c.__name__]=c
m=types.ModuleType(PREFIX+'.modbus_client');m.Ecl110ModbusClient=object;m.EclModbusError=type('EclModbusError',(Exception,),{});sys.modules[m.__name__]=m
spec=importlib.util.spec_from_file_location(PREFIX+'.coordinator',ROOT/'coordinator.py');co=importlib.util.module_from_spec(spec);sys.modules[spec.name]=co;spec.loader.exec_module(co)

class Client:
    device_id=5
    def __init__(self):self.writes=[];self.other=43
    async def async_read_holding_registers(self,**kw):return [self.other]
    async def async_write_holding_register(self,*,address,value):self.writes.append((address,value));return value

def coordinator(app='130'):
    c=object.__new__(co.Ecl110DataUpdateCoordinator);c.client=Client();c.application=app;c.data={'registers':{'temperature_s1':100}};c._operation_lock=asyncio.Lock();return c

class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_expansion_requires_explicit_application(self):
        for app in (None,'116'):
            c=coordinator(app)
            with self.assertRaises(ValueError):await c.async_write_register('heating_curve_slope',7)
            self.assertEqual(c.client.writes,[])

    async def test_flow_cross_limit(self):
        c=coordinator()
        with self.assertRaises(ValueError):await c.async_write_register('flow_temperature_min',44)
        self.assertEqual(c.client.writes,[])
        await c.async_write_register('flow_temperature_min',25)
        self.assertEqual(c.data['registers']['flow_temperature_min'],25)
        self.assertEqual(c.data['registers']['temperature_s1'],100)

    async def test_write_waits_for_poll_operation(self):
        c=coordinator()
        await c._operation_lock.acquire()
        task=asyncio.create_task(c.async_write_register('heating_curve_slope',7))
        await asyncio.sleep(0)
        self.assertEqual(c.client.writes,[])
        c._operation_lock.release()
        await task
        self.assertEqual(c.client.writes,[(11174,7)])
