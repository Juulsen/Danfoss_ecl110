"""Room-temperature and mode control for ECL110 application 130."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.components.climate import ClimateEntity
from homeassistant.components.climate.const import ClimateEntityFeature, HVACMode
from homeassistant.const import ATTR_TEMPERATURE, UnitOfTemperature
from homeassistant.exceptions import HomeAssistantError

from .entity import Ecl110WritableEntity, configured_application, coordinator_from_entry
from .modbus_client import EclModbusError
from .registers import REGISTERS_BY_KEY

PARALLEL_UPDATES: Final = 0
CLIMATE_KEYS: Final = (
    "desired_room_temperature", "desired_mode", "temperature_s2", "desired_s2",
)
PRESET_RAW: Final = {"auto": 1, "comfort": 2, "setback": 3, "standby": 4}
MODE_RAW: Final = {HVACMode.AUTO: 1, HVACMode.HEAT: 2, HVACMode.OFF: 4}


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Only create room heating control for explicitly selected application 130."""
    if (
        configured_application(entry) == "130"
        and entry.data.get("room_temperature_enabled", False)
    ):
        async_add_entities([Ecl110Climate(coordinator_from_entry(entry), entry)])


class Ecl110Climate(Ecl110WritableEntity, ClimateEntity):
    """Use the controller's own regulation; never run a second HA thermostat."""

    _attr_entity_category = None
    _attr_translation_key = "room_heating"
    _attr_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_min_temp = 10
    _attr_max_temp = 30
    _attr_target_temperature_step = 1
    _attr_precision = 0.1
    _attr_hvac_modes = [HVACMode.AUTO, HVACMode.HEAT, HVACMode.OFF]
    _attr_preset_modes = list(PRESET_RAW)
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.PRESET_MODE
        | ClimateEntityFeature.TURN_ON
        | ClimateEntityFeature.TURN_OFF
    )

    def __init__(self, coordinator, entry) -> None:
        super().__init__(
            coordinator=coordinator, entry=entry,
            register=REGISTERS_BY_KEY["desired_room_temperature"],
            platform_suffix="climate", context=CLIMATE_KEYS,
        )

    def _temperature(self, key: str) -> float | None:
        value = REGISTERS_BY_KEY[key].decode(self.coordinator.register_value(key))
        return float(value) if isinstance(value, (int, float)) else None

    @property
    def available(self) -> bool:
        # A missing optional room sensor does not disable setpoint/mode control.
        return super().available and self.preset_mode is not None

    @property
    def current_temperature(self) -> float | None:
        return self._temperature("temperature_s2")

    @property
    def target_temperature(self) -> float | None:
        # Match the writable setting, not the schedule-adjusted active target.
        return self._temperature("desired_room_temperature")

    @property
    def preset_mode(self) -> str | None:
        raw = self.coordinator.register_value("desired_mode")
        return next((name for name, code in PRESET_RAW.items() if code == raw), None)

    @property
    def hvac_mode(self) -> HVACMode | None:
        return {"auto": HVACMode.AUTO, "comfort": HVACMode.HEAT,
                "setback": HVACMode.HEAT, "standby": HVACMode.OFF}.get(self.preset_mode)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "ecl_device": self._entry.entry_id,
            "ecl_application": self.coordinator.application,
            "active_target_temperature": self._temperature("desired_s2"),
            "room_sensor_available": self.current_temperature is not None,
            "off_is_standby": True,
        }

    async def _write_mode(self, raw: int) -> None:
        try:
            await self.coordinator.async_write_register("desired_mode", raw)
        except (EclModbusError, ValueError, KeyError) as err:
            raise HomeAssistantError(f"Could not update ECL110 operating mode: {err}") from err

    async def async_set_temperature(self, **kwargs: Any) -> None:
        # Validate the complete request before any writes. No silent rounding.
        mode = kwargs.get("hvac_mode")
        if mode is not None and mode not in MODE_RAW:
            raise HomeAssistantError("Unsupported ECL110 HVAC mode")
        raw = None
        if ATTR_TEMPERATURE in kwargs:
            try:
                raw = self.register.encode(float(kwargs[ATTR_TEMPERATURE]))
            except (ValueError, TypeError) as err:
                raise HomeAssistantError("Choose a whole temperature from 10 to 30 °C") from err
        if raw is not None:
            await self.async_write_raw(raw)
        if mode is not None:
            await self._write_mode(MODE_RAW[mode])

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        if hvac_mode not in MODE_RAW:
            raise HomeAssistantError("Unsupported ECL110 HVAC mode")
        await self._write_mode(MODE_RAW[hvac_mode])

    async def async_set_preset_mode(self, preset_mode: str) -> None:
        if preset_mode not in PRESET_RAW:
            raise HomeAssistantError("Unsupported ECL110 preset")
        await self._write_mode(PRESET_RAW[preset_mode])

    async def async_turn_on(self) -> None:
        # Do not replace an already active setback/comfort/auto selection.
        if self.hvac_mode == HVACMode.OFF:
            await self.async_set_hvac_mode(HVACMode.HEAT)

    async def async_turn_off(self) -> None:
        await self.async_set_hvac_mode(HVACMode.OFF)
