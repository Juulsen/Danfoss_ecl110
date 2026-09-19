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
NUMBER_KEYS: Final = ("display_backlight", "display_contrast")


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
        self._attr_native_min_value = float(minimum)
        self._attr_native_max_value = float(maximum)
        self._attr_translation_key = f"{register.key}_control"

    @property
    def native_value(self) -> float | None:
        """Return the current numeric value."""

        return float(self.raw_value) if self.raw_value is not None else None

    async def async_set_native_value(self, value: float) -> None:
        """Write an integer value to the controller."""

        if not float(value).is_integer():
            raise ValueError("ECL110 accepts whole-number values only")
        await self.async_write_raw(int(value))
