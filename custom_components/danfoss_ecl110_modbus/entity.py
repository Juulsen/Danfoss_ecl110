"""Shared writable entities for the ECL110 integration."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, INTEGRATION_AUTHOR, MODEL
from .coordinator import Ecl110DataUpdateCoordinator
from .modbus_client import EclModbusError
from .registers import EclRegister


def configured_application(entry: ConfigEntry[Any]) -> str | None:
    """Return application 116/130 when configured."""

    value = entry.options.get("application", entry.data.get("application"))
    application = str(value) if value is not None else None
    return application if application in {"116", "130"} else None


def coordinator_from_entry(
    entry: ConfigEntry[Any],
) -> Ecl110DataUpdateCoordinator:
    """Resolve the integration coordinator from runtime data."""

    coordinator = getattr(entry.runtime_data, "coordinator", entry.runtime_data)
    if not isinstance(coordinator, Ecl110DataUpdateCoordinator):
        raise TypeError("ECL110 runtime data does not contain its coordinator")
    return coordinator


class Ecl110WritableEntity(CoordinatorEntity[Ecl110DataUpdateCoordinator]):
    """Base for one verified writable ECL110 setting."""

    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(
        self,
        *,
        coordinator: Ecl110DataUpdateCoordinator,
        entry: ConfigEntry[Any],
        register: EclRegister,
        platform_suffix: str,
    ) -> None:
        """Initialize the entity and its coordinator context."""

        super().__init__(coordinator, context=register.key)
        self.register = register
        self._entry = entry
        self._attr_unique_id = (
            f"{entry.unique_id or entry.entry_id}_{register.key}_{platform_suffix}"
        )
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.unique_id or entry.entry_id)},
            manufacturer=INTEGRATION_AUTHOR,
            model=MODEL,
            name="ECL Comfort 110 Modbus",
        )

    @property
    def available(self) -> bool:
        """Return whether a current value exists."""

        return (
            super().available
            and self.coordinator.register_value(self.register.key) is not None
        )

    @property
    def raw_value(self) -> int | None:
        """Return the current raw register value."""

        return self.coordinator.register_value(self.register.key)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Allow the dashboard to discover controls without guessing IDs."""
        r = self.register
        return {
            "ecl_device": self._entry.entry_id,
            "ecl_application": self.coordinator.application,
            "register_key": r.key,
            "ecl_line": r.ecl_line,
            "modbus_register": r.address,
            "raw_value": self.raw_value,
            "write_basis": r.write_basis,
            "description_da": r.description,
            "description_en": r.description_en,
        }

    async def async_write_raw(self, raw_value: int) -> None:
        """Write a validated raw value and surface a friendly HA error."""

        try:
            await self.coordinator.async_write_register(
                self.register.key,
                raw_value,
            )
        except (EclModbusError, ValueError, KeyError) as err:
            raise HomeAssistantError(
                f"Could not update {self.register.name}: {err}"
            ) from err
