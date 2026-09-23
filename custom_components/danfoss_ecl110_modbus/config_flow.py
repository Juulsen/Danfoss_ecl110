"""Config flow for the Danfoss ECL Comfort 110 Modbus integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PORT, CONF_TIMEOUT
from homeassistant.helpers import selector

from .const import (
    APPLICATIONS,
    CONF_APPLICATION,
    CONF_DEVICE_ID,
    CONF_REQUEST_DELAY,
    CONF_SCAN_INTERVAL,
    DEFAULT_APPLICATION,
    DEFAULT_DEVICE_ID,
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_TIMEOUT,
    DOMAIN,
)
from .modbus_client import (
    Ecl110ModbusClient,
    EclConnectionError,
    EclModbusError,
    EclReadError,
)

_LOGGER = logging.getLogger(__name__)

TEST_REGISTER = 11200
MIN_SCAN_INTERVAL = 5


def _config_schema(defaults: dict[str, Any]) -> vol.Schema:
    """Return the user/reconfigure form schema."""

    return vol.Schema(
        {
            vol.Optional("schedule_enabled", default=defaults.get("schedule_enabled", False)): bool,
            vol.Required(
                CONF_HOST,
                default=defaults.get(CONF_HOST, DEFAULT_HOST),
            ): str,
            vol.Required(
                CONF_PORT,
                default=defaults.get(CONF_PORT, DEFAULT_PORT),
            ): vol.All(vol.Coerce(int), vol.Range(min=1, max=65535)),
            vol.Required(
                CONF_DEVICE_ID,
                default=defaults.get(CONF_DEVICE_ID, DEFAULT_DEVICE_ID),
            ): selector.NumberSelector(selector.NumberSelectorConfig(
                min=0, max=247, step=1, mode=selector.NumberSelectorMode.BOX,
            )),
            vol.Required(
                CONF_APPLICATION,
                default=defaults.get(
                    CONF_APPLICATION,
                    DEFAULT_APPLICATION,
                ),
            ): vol.In(APPLICATIONS),
            vol.Required(
                CONF_SCAN_INTERVAL,
                default=defaults.get(
                    CONF_SCAN_INTERVAL,
                    int(DEFAULT_SCAN_INTERVAL.total_seconds()),
                ),
            ): vol.All(
                vol.Coerce(int),
                vol.Range(min=MIN_SCAN_INTERVAL, max=3600),
            ),
            vol.Required(
                CONF_TIMEOUT,
                default=defaults.get(CONF_TIMEOUT, DEFAULT_TIMEOUT),
            ): vol.All(vol.Coerce(float), vol.Range(min=1, max=60)),
            vol.Required(
                CONF_REQUEST_DELAY,
                default=defaults.get(
                    CONF_REQUEST_DELAY,
                    DEFAULT_REQUEST_DELAY,
                ),
            ): vol.All(vol.Coerce(float), vol.Range(min=0, max=5)),
        }
    )


async def _async_validate_connection(data: dict[str, Any]) -> None:
    """Connect and perform one harmless FC03 read of S1."""

    client = Ecl110ModbusClient(
        host=data[CONF_HOST].strip(),
        port=data[CONF_PORT],
        device_id=data[CONF_DEVICE_ID],
        timeout=data[CONF_TIMEOUT],
        request_delay=data[CONF_REQUEST_DELAY],
    )
    try:
        await client.async_read_holding_registers(
            address=TEST_REGISTER,
            count=1,
        )
        if data.get("schedule_enabled"):
            for address in (1109, 1119, 1129, 1139, 1149, 1159, 1169):
                await client.async_read_holding_registers(address=address, count=4)
    finally:
        await client.async_close()


class Ecl110ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle ECL110 configuration through the Home Assistant UI."""

    VERSION = 1
    MINOR_VERSION = 1

    def _matching_entry(
        self,
        data: dict[str, Any],
        *,
        exclude_entry_id: str | None = None,
    ) -> config_entries.ConfigEntry[Any] | None:
        """Find an existing entry for the same gateway and device ID."""

        normalized_host = data[CONF_HOST].strip().lower()
        for entry in self._async_current_entries():
            if entry.entry_id == exclude_entry_id:
                continue
            if (
                str(entry.data.get(CONF_HOST, "")).strip().lower()
                == normalized_host
                and int(entry.data.get(CONF_PORT, DEFAULT_PORT))
                == data[CONF_PORT]
                and int(
                    entry.data.get(CONF_DEVICE_ID, DEFAULT_DEVICE_ID)
                )
                == data[CONF_DEVICE_ID]
            ):
                return entry
        return None

    async def _async_test_input(
        self,
        user_input: dict[str, Any],
    ) -> dict[str, str]:
        """Normalize and validate form data, returning form errors."""

        user_input[CONF_HOST] = user_input[CONF_HOST].strip()
        if not user_input[CONF_HOST]:
            return {"base": "cannot_connect"}
        user_input[CONF_DEVICE_ID] = int(user_input[CONF_DEVICE_ID])
        try:
            await _async_validate_connection(user_input)
        except EclConnectionError:
            return {"base": "cannot_connect"}
        except EclReadError:
            return {"base": "cannot_read"}
        except EclModbusError:
            return {"base": "modbus_error"}
        except Exception:  # noqa: BLE001 - config flows must remain usable.
            _LOGGER.exception("Unexpected exception validating ECL110")
            return {"base": "unknown"}
        return {}

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Create a new ECL110 config entry."""

        errors: dict[str, str] = {}
        if user_input is not None:
            errors = await self._async_test_input(user_input)
            if not errors:
                if self._matching_entry(user_input) is not None:
                    return self.async_abort(reason="already_configured")

                title = (
                    f"ECL110 Modbus "
                    f"({user_input[CONF_HOST]} / "
                    f"ID {user_input[CONF_DEVICE_ID]})"
                )
                return self.async_create_entry(
                    title=title,
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=_config_schema(user_input or {}),
            errors=errors,
        )

    async def async_step_reconfigure(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Change connection settings and reload the entry."""

        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}

        if user_input is not None:
            errors = await self._async_test_input(user_input)
            if not errors:
                if (
                    self._matching_entry(
                        user_input,
                        exclude_entry_id=entry.entry_id,
                    )
                    is not None
                ):
                    return self.async_abort(reason="already_configured")

                return self.async_update_reload_and_abort(
                    entry,
                    data_updates=user_input,
                )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=_config_schema(user_input or dict(entry.data)),
            errors=errors,
        )
