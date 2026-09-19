"""Switch controls for verified ECL110 settings."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import (
    Ecl110WritableEntity,
    configured_application,
    coordinator_from_entry,
)
from .registers import SAFE_WRITABLE_REGISTERS_BY_KEY

PARALLEL_UPDATES: Final = 0
SWITCH_KEY: Final = "daylight_saving"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry[Any],
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the verified daylight-saving switch."""

    del hass
    register = SAFE_WRITABLE_REGISTERS_BY_KEY[SWITCH_KEY]
    application = configured_application(entry)
    if register.supports_application(application):
        async_add_entities(
            [Ecl110Switch(coordinator_from_entry(entry), entry, register)]
        )


class Ecl110Switch(Ecl110WritableEntity, SwitchEntity):
    """Binary ECL110 setting using raw 0/1 values."""

    def __init__(self, coordinator, entry, register) -> None:
        """Initialize the switch."""

        super().__init__(
            coordinator=coordinator,
            entry=entry,
            register=register,
            platform_suffix="switch",
        )
        self._attr_translation_key = f"{register.key}_control"

    @property
    def is_on(self) -> bool | None:
        """Return the current switch state."""

        return None if self.raw_value is None else self.raw_value == 1

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Enable daylight saving."""

        del kwargs
        await self.async_write_raw(1)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Disable daylight saving."""

        del kwargs
        await self.async_write_raw(0)
