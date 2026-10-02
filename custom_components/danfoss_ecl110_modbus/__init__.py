"""Danfoss ECL Comfort 110 Modbus integration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from pathlib import Path
from homeassistant.components.http import StaticPathConfig

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PORT, CONF_TIMEOUT
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.components import websocket_api
from homeassistant.helpers import config_validation as cv, entity_registry as er
import voluptuous as vol

from .const import (
    CONF_APPLICATION,
    CONF_DEVICE_ID,
    CONF_PLANT,
    CONF_REQUEST_DELAY,
    CONF_SCAN_INTERVAL,
    DEFAULT_APPLICATION,
    DEFAULT_DEVICE_ID,
    DEFAULT_PORT,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_TIMEOUT,
    DOMAIN,
    PLATFORMS,
)
from .coordinator import Ecl110DataUpdateCoordinator
from .modbus_client import Ecl110ModbusClient
from .plant import ENABLEABLE_REGISTER_KEYS, normalize_plant

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass(slots=True)
class Ecl110RuntimeData:
    """Runtime objects owned by one ECL110 config entry."""

    client: Ecl110ModbusClient
    coordinator: Ecl110DataUpdateCoordinator


type Ecl110ConfigEntry = ConfigEntry[Ecl110RuntimeData]


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the integration namespace."""

    del config
    await hass.http.async_register_static_paths([
        StaticPathConfig("/ecl110-static", str(Path(__file__).parent / "frontend"), False)
    ])
    if not hass.data.get(f"{DOMAIN}_ws"):
        hass.data[f"{DOMAIN}_ws"] = True
        websocket_api.async_register_command(hass, ws_plant_get)
        websocket_api.async_register_command(hass, ws_plant_set)
        websocket_api.async_register_command(hass, ws_entities_enable)
    return True


def _entry_or_error(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]):
    """Return the ECL config entry or send a not-found error."""

    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], "not_found", "Unknown ECL110 config entry")
        return None
    return entry


@websocket_api.websocket_command(
    {
        vol.Required("type"): "danfoss_ecl110_modbus/plant/get",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_plant_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the shared plant description for one controller."""

    entry = _entry_or_error(hass, connection, msg)
    if entry is None:
        return
    stored = entry.options.get(CONF_PLANT)
    connection.send_result(
        msg["id"],
        {"plant": normalize_plant(stored) if isinstance(stored, dict) else None},
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "danfoss_ecl110_modbus/plant/set",
        vol.Required("entry_id"): str,
        vol.Required("plant"): dict,
    }
)
@websocket_api.async_response
async def ws_plant_set(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Store the plant on the config entry. Admin only."""

    entry = _entry_or_error(hass, connection, msg)
    if entry is None:
        return
    plant = normalize_plant(msg["plant"])
    hass.config_entries.async_update_entry(
        entry,
        options={**entry.options, CONF_PLANT: plant},
    )
    hass.bus.async_fire(
        f"{DOMAIN}_plant_updated",
        {"entry_id": entry.entry_id, "plant": plant},
    )
    connection.send_result(msg["id"], {"plant": plant})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "danfoss_ecl110_modbus/entities/enable",
        vol.Required("entry_id"): str,
        vol.Required("entity_ids"): [str],
    }
)
@websocket_api.async_response
async def ws_entities_enable(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Enable entities the admin explicitly selected. Never called implicitly."""

    entry = _entry_or_error(hass, connection, msg)
    if entry is None:
        return
    registry = er.async_get(hass)
    enabled: list[str] = []
    allowed = set(ENABLEABLE_REGISTER_KEYS)
    for entity_id in msg["entity_ids"]:
        entity = registry.async_get(entity_id)
        if entity is None or entity.config_entry_id != entry.entry_id:
            continue
        if entity.disabled_by is None:
            continue
        unique = entity.unique_id or ""
        if not any(
            unique.endswith(f"_{key}") or unique.endswith(f"_{key}_sensor")
            for key in allowed
        ):
            continue
        registry.async_update_entity(entity_id, disabled_by=None)
        enabled.append(entity_id)
    connection.send_result(msg["id"], {"enabled": enabled})


async def async_setup_entry(
    hass: HomeAssistant,
    entry: Ecl110ConfigEntry,
) -> bool:
    """Set up an ECL110 from a UI config entry."""

    scan_interval_seconds = int(
        entry.data.get(
            CONF_SCAN_INTERVAL,
            int(DEFAULT_SCAN_INTERVAL.total_seconds()),
        )
    )

    client = Ecl110ModbusClient(
        host=str(entry.data[CONF_HOST]),
        port=int(entry.data.get(CONF_PORT, DEFAULT_PORT)),
        device_id=int(entry.data.get(CONF_DEVICE_ID, DEFAULT_DEVICE_ID)),
        timeout=float(entry.data.get(CONF_TIMEOUT, DEFAULT_TIMEOUT)),
        request_delay=float(
            entry.data.get(CONF_REQUEST_DELAY, DEFAULT_REQUEST_DELAY)
        ),
    )
    coordinator = Ecl110DataUpdateCoordinator(
        hass,
        entry=entry,
        client=client,
        application=str(
            entry.data.get(CONF_APPLICATION, DEFAULT_APPLICATION)
        ),
        update_interval=timedelta(seconds=scan_interval_seconds),
    )

    try:
        await coordinator.async_config_entry_first_refresh()
    except ConfigEntryNotReady:
        await coordinator.async_shutdown()
        raise

    entry.runtime_data = Ecl110RuntimeData(
        client=client,
        coordinator=coordinator,
    )
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    try:
        await hass.config_entries.async_forward_entry_setups(
            entry,
            PLATFORMS,
        )
    except Exception:
        await coordinator.async_shutdown()
        raise

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: Ecl110ConfigEntry,
) -> bool:
    """Unload platforms and close the Modbus TCP connection."""

    unload_ok = await hass.config_entries.async_unload_platforms(
        entry,
        PLATFORMS,
    )
    if unload_ok:
        await entry.runtime_data.coordinator.async_shutdown()
    return unload_ok


async def _async_update_listener(
    hass: HomeAssistant,
    entry: Ecl110ConfigEntry,
) -> None:
    """Reload the integration after a reconfiguration."""

    await hass.config_entries.async_reload(entry.entry_id)
