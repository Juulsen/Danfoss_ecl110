"""Sensor platform for the Danfoss ECL Comfort 110 integration.

The platform creates entities from registers.py. The coordinator contract is:

* entry.runtime_data is a DataUpdateCoordinator, or an object with a
  coordinator attribute containing one.
* coordinator.data is a mapping containing raw 16-bit register values.
* Values may be keyed by register key, integer address or string address.
* The mapping may optionally contain the values below a "registers" key.

All scaling and signed conversion is performed by EclRegister.decode().
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final, cast

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
    DataUpdateCoordinator,
)

from .const import DOMAIN, INTEGRATION_AUTHOR, MODEL
from .registers import (
    SOURCE_URL,
    EclRegister,
    EntityPlatform,
    RegisterConfidence,
    SENSOR_REGISTERS,
)

PARALLEL_UPDATES: Final = 0
_MISSING: Final = object()


@dataclass(frozen=True, kw_only=True)
class EclSensorEntityDescription(SensorEntityDescription):
    """Home Assistant sensor description linked to an ECL register."""

    register: EclRegister
    setting_state_only: bool = False


def _sensor_device_class(
    register: EclRegister,
) -> SensorDeviceClass | None:
    """Translate register metadata to a Home Assistant device class."""

    if register.options is not None:
        return SensorDeviceClass.ENUM
    if register.device_class == "temperature":
        return SensorDeviceClass.TEMPERATURE
    return None


def _sensor_state_class(
    register: EclRegister,
) -> SensorStateClass | None:
    """Translate register metadata to a Home Assistant state class."""

    if register.state_class == "measurement":
        return SensorStateClass.MEASUREMENT
    return None


def _entity_category(register: EclRegister) -> EntityCategory | None:
    """Translate register metadata to a Home Assistant entity category."""

    if register.entity_category == "diagnostic":
        return EntityCategory.DIAGNOSTIC
    if register.entity_category == "configuration":
        # These are read-only views of settings. SensorEntity rejects CONFIG;
        # reserve that category for future writable number/select entities.
        return EntityCategory.DIAGNOSTIC
    return None


def _build_description(
    register: EclRegister,
) -> EclSensorEntityDescription:
    """Build one immutable Home Assistant entity description."""

    options = (
        list(register.options.values())
        if register.options is not None
        else None
    )

    return EclSensorEntityDescription(
        key=register.key,
        name=register.name,
        translation_key=register.key,
        icon=register.icon,
        device_class=_sensor_device_class(register),
        state_class=_sensor_state_class(register),
        native_unit_of_measurement=register.unit,
        suggested_display_precision=(
            None if options is not None else register.precision
        ),
        entity_category=_entity_category(register),
        # Only ordinary sensor registers (currently S1-S4) start enabled.
        # Settings and schedules are exposed read-only for testing and can be
        # enabled individually without loading the shared RTU bus all at once.
        entity_registry_enabled_default=(
            register.platform is EntityPlatform.SENSOR
            and register.enabled_by_default
        ),
        options=options,
        register=register,
    )


SENSOR_DESCRIPTIONS: Final = tuple(
    _build_description(register) for register in SENSOR_REGISTERS
) + tuple(
    EclSensorEntityDescription(
        key=f"{register.key}_setting_state",
        name=f"{register.name} – tilstand",
        translation_key=f"{register.key}_setting_state",
        device_class=SensorDeviceClass.ENUM,
        options=["off", "active"],
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        register=register,
        setting_state_only=True,
    )
    for register in SENSOR_REGISTERS
    if register.off_raw_values
)


def _configured_application(entry: ConfigEntry[Any]) -> str | None:
    """Return application 116/130 when it has been configured."""

    value = entry.options.get(
        "application",
        entry.data.get("application"),
    )
    if value is None:
        return None

    application = str(value)
    return application if application in {"116", "130"} else None


def _coordinator_from_entry(
    entry: ConfigEntry[Any],
) -> DataUpdateCoordinator[Mapping[Any, Any]]:
    """Resolve the coordinator from the config entry runtime data."""

    runtime_data = entry.runtime_data
    coordinator = getattr(runtime_data, "coordinator", runtime_data)

    if not isinstance(coordinator, DataUpdateCoordinator):
        raise TypeError(
            "danfoss_ecl110_modbus runtime_data must contain "
            "a DataUpdateCoordinator"
        )

    return cast(DataUpdateCoordinator[Mapping[Any, Any]], coordinator)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry[Any],
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up ECL110 sensor entities from a config entry."""

    del hass  # The coordinator is owned by entry.runtime_data.

    coordinator = _coordinator_from_entry(entry)
    application = _configured_application(entry)

    async_add_entities(
        Ecl110Sensor(
            coordinator=coordinator,
            entry=entry,
            description=description,
        )
        for description in SENSOR_DESCRIPTIONS
        if description.register.supports_application(application)
    )


class Ecl110Sensor(
    CoordinatorEntity[DataUpdateCoordinator[Mapping[Any, Any]]],
    SensorEntity,
):
    """Representation of one ECL110 register as a sensor."""

    entity_description: EclSensorEntityDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        *,
        coordinator: DataUpdateCoordinator[Mapping[Any, Any]],
        entry: ConfigEntry[Any],
        description: EclSensorEntityDescription,
    ) -> None:
        """Initialize the ECL110 sensor."""

        # Numeric and OFF-state entities subscribe to the same register key.
        super().__init__(coordinator, context=description.register.key)
        self.entity_description = description
        self._entry = entry

        device_identifier = entry.unique_id or entry.entry_id
        self._attr_unique_id = (
            f"{device_identifier}_{description.key}"
        )
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_identifier)},
            name=entry.title or "ECL110 Modbus",
            manufacturer=INTEGRATION_AUTHOR,
            model=MODEL,
        )

    def _register_values(self) -> Mapping[Any, Any]:
        """Return the raw register mapping from coordinator data."""

        data = self.coordinator.data
        if not isinstance(data, Mapping):
            return {}

        nested = data.get("registers")
        if isinstance(nested, Mapping):
            return nested

        return data

    def _raw_value(self) -> object:
        """Look up the register using all supported coordinator key styles."""

        register = self.entity_description.register
        values = self._register_values()

        for key in (
            register.key,
            register.address,
            str(register.address),
        ):
            if key in values:
                value = values[key]
                if isinstance(value, Mapping):
                    if "raw" in value:
                        return value["raw"]
                    if "value" in value:
                        return value["value"]
                return value

        return _MISSING

    @property
    def available(self) -> bool:
        """Return whether both coordinator and this register are available."""

        return super().available and self._raw_value() is not _MISSING

    @property
    def native_value(self) -> int | float | str | None:
        """Return the decoded register value."""

        raw_value = self._raw_value()
        if raw_value is _MISSING or raw_value is None:
            return None

        try:
            if self.entity_description.setting_state_only:
                return self.entity_description.register.setting_state(
                    int(raw_value)
                )
            decoded = self.entity_description.register.decode(
                int(raw_value)
            )
        except (TypeError, ValueError):
            return None

        # Enum sensors must only expose states declared in their option list.
        if (
            self.entity_description.register.options is not None
            and isinstance(decoded, str)
            and decoded.startswith("unknown_")
        ):
            return None

        return decoded

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose stable diagnostic metadata for the register."""

        register = self.entity_description.register
        raw_value = self._raw_value()

        attributes: dict[str, Any] = {
            "modbus_register": register.address,
            "register_type": register.register_type.value,
            "function_code": register.function_code,
            "access": register.access.value,
            "confidence": register.confidence.value,
            "applications": sorted(register.applications),
            "source": SOURCE_URL,
            "description_da": register.description,
            "description_en": register.description_en,
            "scale": register.scale,
            "offset": register.offset,
            "data_type": register.data_type.value,
            "numeric_min": register.decoded_min,
            "numeric_max": register.decoded_max,
        }
        if register.observed_raw_values:
            attributes["observed_raw_values"] = list(register.observed_raw_values)
            attributes["observation_application"] = "130"
            attributes["observation_date"] = "2026-09-19"
        if register.off_raw_values:
            attributes["off_raw_values"] = sorted(register.off_raw_values)

        if raw_value is not _MISSING and raw_value is not None:
            try:
                value = int(raw_value) & 0xFFFF
                attributes["raw_signed_value"] = (
                    value - 65536 if value >= 32768 else value
                )
                if value in register.off_raw_values:
                    attributes["setting_state"] = "off"
                    attributes["decoding_note"] = "Confirmed OFF code; no numeric value"
                elif register.off_raw_values:
                    attributes["setting_state"] = register.setting_state(value)
                decoded = register.decode(value)
                if (
                    register.options is not None
                    and isinstance(decoded, str)
                    and decoded.startswith("unknown_")
                ):
                    attributes["decoding_note"] = "Unconfirmed option code; raw_value preserved"
                elif (
                    value not in register.off_raw_values
                    and (register.decoded_min is not None or register.decoded_max is not None)
                    and decoded is None
                ):
                    attributes["decoding_note"] = "Outside documented numeric range; raw_value preserved"
            except (TypeError, ValueError):
                pass

        if register.ecl_line is not None:
            attributes["ecl_line"] = register.ecl_line
        if raw_value is not _MISSING:
            attributes["raw_value"] = raw_value

        if register.confidence is not RegisterConfidence.CONFIRMED:
            attributes["unconfirmed"] = True

        return attributes
