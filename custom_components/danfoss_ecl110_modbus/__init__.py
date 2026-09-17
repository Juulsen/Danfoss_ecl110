"""Danfoss ECL Comfort 110 Modbus integration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PORT, CONF_TIMEOUT
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .const import (
    CONF_APPLICATION,
    CONF_DEVICE_ID,
    CONF_REQUEST_DELAY,
    CONF_SCAN_INTERVAL,
    DEFAULT_APPLICATION,
    DEFAULT_DEVICE_ID,
    DEFAULT_PORT,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_TIMEOUT,
    PLATFORMS,
)
from .coordinator import Ecl110DataUpdateCoordinator
from .modbus_client import Ecl110ModbusClient


@dataclass(slots=True)
class Ecl110RuntimeData:
    """Runtime objects owned by one ECL110 config entry."""

    client: Ecl110ModbusClient
    coordinator: Ecl110DataUpdateCoordinator


type Ecl110ConfigEntry = ConfigEntry[Ecl110RuntimeData]


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the integration namespace."""

    del hass, config
    return True


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
        await client.async_close()
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
        await client.async_close()
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

