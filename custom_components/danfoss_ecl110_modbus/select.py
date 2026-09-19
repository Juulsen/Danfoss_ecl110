"""Select controls for verified ECL110 settings."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.components.select import SelectEntity
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
SELECT_KEYS: Final = (
    "language",
    "room_integration_time",
    "optimization_basis",
    "reference_ramp",
    "boost",
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry[Any],
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up verified select controls."""

    del hass
    coordinator = coordinator_from_entry(entry)
    application = configured_application(entry)
    async_add_entities(
        Ecl110Select(coordinator, entry, SAFE_WRITABLE_REGISTERS_BY_KEY[key])
        for key in SELECT_KEYS
        if SAFE_WRITABLE_REGISTERS_BY_KEY[key].supports_application(application)
    )


class Ecl110Select(Ecl110WritableEntity, SelectEntity):
    """One whitelisted ECL110 selection."""

    def __init__(self, coordinator, entry, register: EclRegister) -> None:
        """Initialize a select from verified raw-value options."""

        super().__init__(
            coordinator=coordinator,
            entry=entry,
            register=register,
            platform_suffix="select",
        )
        self._values = dict(register.verified_write_values or {})
        self._reverse_values = {option: raw for raw, option in self._values.items()}
        self._attr_options = list(self._reverse_values)
        self._attr_translation_key = f"{register.key}_control"

    @property
    def current_option(self) -> str | None:
        """Return the option matching the current raw value."""

        return self._values.get(self.raw_value)

    async def async_select_option(self, option: str) -> None:
        """Write a selected verified option."""

        if option not in self._reverse_values:
            raise ValueError(f"Unsupported option: {option}")
        await self.async_write_raw(self._reverse_values[option])
