"""Data update coordinator for the Danfoss ECL Comfort 110."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
import asyncio
from dataclasses import dataclass
from datetime import timedelta
import logging
from typing import Any, Final

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    UpdateFailed,
)

from .const import (
    APPLICATION_ALL,
    DEFAULT_POLL_REGISTER_KEYS,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_READ_BLOCK_SIZE,
)
from .modbus_client import Ecl110ModbusClient, EclModbusError
from .registers import (
    EclRegister,
    REGISTERS_BY_KEY,
    SENSOR_REGISTERS,
)

_LOGGER = logging.getLogger(__name__)

CoordinatorData = dict[str, Any]
_SENSOR_REGISTERS_BY_KEY: Final = {
    register.key: register for register in SENSOR_REGISTERS
}


@dataclass(frozen=True, slots=True)
class RegisterReadBlock:
    """One contiguous Modbus holding-register request."""

    start_address: int
    registers: tuple[EclRegister, ...]

    @property
    def count(self) -> int:
        """Number of registers in the contiguous block."""

        return len(self.registers)


def build_read_blocks(
    registers: Iterable[EclRegister],
    *,
    max_block_size: int = MAX_READ_BLOCK_SIZE,
) -> tuple[RegisterReadBlock, ...]:
    """Group only strictly adjacent addresses into bounded read blocks."""

    if max_block_size < 1:
        raise ValueError("max_block_size must be at least 1")

    ordered = sorted(
        {register.address: register for register in registers}.values(),
        key=lambda register: register.address,
    )
    if not ordered:
        return ()

    blocks: list[RegisterReadBlock] = []
    current: list[EclRegister] = [ordered[0]]

    for register in ordered[1:]:
        previous = current[-1]
        is_adjacent = register.address == previous.address + 1
        if is_adjacent and len(current) < max_block_size:
            current.append(register)
            continue

        blocks.append(
            RegisterReadBlock(
                start_address=current[0].address,
                registers=tuple(current),
            )
        )
        current = [register]

    blocks.append(
        RegisterReadBlock(
            start_address=current[0].address,
            registers=tuple(current),
        )
    )
    return tuple(blocks)


class Ecl110DataUpdateCoordinator(
    DataUpdateCoordinator[CoordinatorData]
):
    """Poll active ECL110 sensor registers through one shared client."""

    def __init__(
        self,
        hass: HomeAssistant,
        *,
        entry: ConfigEntry[Any],
        client: Ecl110ModbusClient,
        application: str | None = None,
        update_interval: timedelta = DEFAULT_SCAN_INTERVAL,
    ) -> None:
        """Initialize the coordinator."""

        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=update_interval,
            always_update=False,
        )
        self.client = client
        self._operation_lock = asyncio.Lock()
        self.application = (
            None
            if application in (None, APPLICATION_ALL)
            else str(application)
        )

    async def _async_setup(self) -> None:
        """Connect once before the first coordinator refresh."""

        try:
            await self.client.async_connect()
        except EclModbusError as err:
            raise UpdateFailed(str(err)) from err

    def _requested_registers(self) -> tuple[EclRegister, ...]:
        """Return registers used by enabled coordinator entities."""

        contexts = {
            str(context)
            for context in self.async_contexts()
            if context is not None
        }

        # No entities are subscribed during the first config-entry refresh.
        # Start with the four safe temperature inputs.
        if not contexts:
            contexts.update(DEFAULT_POLL_REGISTER_KEYS)

        registers = (
            _SENSOR_REGISTERS_BY_KEY[key]
            for key in contexts
            if key in _SENSOR_REGISTERS_BY_KEY
        )
        return tuple(
            register
            for register in registers
            if register.readable
            and register.supports_application(self.application)
        )

    async def _async_update_data(self) -> CoordinatorData:
        """Read active registers and expose raw values by register key."""
        async with self._operation_lock:
            return await self._async_read_data()

    async def _async_read_data(self) -> CoordinatorData:
        """Read a complete poll without interleaving setting writes."""

        requested = self._requested_registers()
        blocks = build_read_blocks(requested)
        raw_values: dict[str, int] = {}

        try:
            for block in blocks:
                values = await self.client.async_read_holding_registers(
                    address=block.start_address,
                    count=block.count,
                )
                for register, raw_value in zip(
                    block.registers,
                    values,
                    strict=True,
                ):
                    raw_values[register.key] = raw_value
        except EclModbusError as err:
            raise UpdateFailed(
                f"Error communicating with ECL110 device "
                f"{self.client.device_id}: {err}"
            ) from err

        return {
            "registers": raw_values,
            "device_id": self.client.device_id,
            "application": self.application or APPLICATION_ALL,
        }

    async def async_shutdown(self) -> None:
        """Close the Modbus client when the config entry unloads."""

        await self.client.async_close()

    def raw_register_values(self) -> Mapping[str, int]:
        """Return the latest raw register mapping."""

        if not isinstance(self.data, Mapping):
            return {}
        registers = self.data.get("registers")
        return registers if isinstance(registers, Mapping) else {}

    def register_value(self, key: str) -> int | None:
        """Return the latest raw value for one known register key."""

        if key not in REGISTERS_BY_KEY:
            raise KeyError(key)
        value = self.raw_register_values().get(key)
        return int(value) if value is not None else None

    async def async_write_register(self, key: str, raw_value: int) -> int:
        """Validate, write and publish one verified register value."""
        async with self._operation_lock:
            return await self._async_write_register(key, raw_value)

    async def _async_write_register(self, key: str, raw_value: int) -> int:
        """Write under the shared poll/write operation lock."""

        register = REGISTERS_BY_KEY[key]
        if not register.supports_application(self.application):
            raise ValueError("Register does not belong to this application")
        if register.write_application and self.application != register.write_application:
            raise ValueError(f"Select application {register.write_application} before writing")
        register.validate_raw_write(raw_value)
        if key in ("flow_temperature_min", "flow_temperature_max"):
            other_key = "flow_temperature_max" if key.endswith("min") else "flow_temperature_min"
            other = REGISTERS_BY_KEY[other_key]
            other_raw = (await self.client.async_read_holding_registers(address=other.address))[0]
            if ((key.endswith("min") and raw_value > other_raw)
                    or (key.endswith("max") and raw_value < other_raw)):
                raise ValueError("Minimum flow temperature must not exceed maximum")
        read_back = await self.client.async_write_holding_register(
            address=register.address,
            value=raw_value,
        )

        data = dict(self.data) if isinstance(self.data, Mapping) else {}
        registers = dict(self.raw_register_values())
        registers[key] = read_back
        data["registers"] = registers
        data.setdefault("device_id", self.client.device_id)
        data.setdefault("application", self.application or APPLICATION_ALL)
        self.async_set_updated_data(data)
        return read_back

