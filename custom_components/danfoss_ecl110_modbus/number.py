"""Number controls for verified ECL110 settings."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import (
    Ecl110WritableEntity,
    configured_application,
    coordinator_from_entry,
)
from .registers import SAFE_WRITABLE_REGISTERS_BY_KEY, EclRegister

PARALLEL_UPDATES: Final = 0
NUMBER_KEYS: Final = tuple(
    key for key, r in SAFE_WRITABLE_REGISTERS_BY_KEY.items()
    if r.verified_write_range is not None and r.verified_write_values is None
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry[Any],
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up verified number controls."""

    del hass
    coordinator = coordinator_from_entry(entry)
    application = configured_application(entry)
    async_add_entities(
        Ecl110Number(coordinator, entry, SAFE_WRITABLE_REGISTERS_BY_KEY[key])
        for key in NUMBER_KEYS
        if SAFE_WRITABLE_REGISTERS_BY_KEY[key].supports_application(application)
        and (not SAFE_WRITABLE_REGISTERS_BY_KEY[key].write_application
             or SAFE_WRITABLE_REGISTERS_BY_KEY[key].write_application == application)
    )


class Ecl110Number(Ecl110WritableEntity, NumberEntity):
    """One bounded numeric ECL110 setting."""

    _attr_native_step = 1.0
    _attr_mode = NumberMode.BOX

    def __init__(self, coordinator, entry, register: EclRegister) -> None:
        """Initialize a number entity from its verified range."""

        super().__init__(
            coordinator=coordinator,
            entry=entry,
            register=register,
            platform_suffix="number",
        )
        minimum, maximum = register.verified_write_range or (0, 0)
        self._attr_native_min_value = minimum * register.scale + register.offset
        self._attr_native_max_value = maximum * register.scale + register.offset
        self._attr_native_step = register.scale
        self._attr_native_unit_of_measurement = register.unit
        self._attr_translation_key = f"{register.key}_control"

    @property
    def native_value(self) -> float | None:
        """Return the current numeric value."""

        value = self.register.decode(self.raw_value)
        return float(value) if isinstance(value, (int, float)) else None

    async def async_set_native_value(self, value: float) -> None:
        """Write an integer value to the controller."""

        await self.async_write_raw(self.register.encode(float(value)))
