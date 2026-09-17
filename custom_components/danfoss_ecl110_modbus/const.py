"""Constants for the Danfoss ECL Comfort 110 integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

from homeassistant.const import Platform

DOMAIN: Final = "danfoss_ecl110_modbus"
NAME: Final = "Danfoss ECL Comfort 110"
MANUFACTURER: Final = "Danfoss"
MODEL: Final = "ECL Comfort 110"

PLATFORMS: Final = (Platform.SENSOR,)

CONF_DEVICE_ID: Final = "device_id"
CONF_APPLICATION: Final = "application"
CONF_SCAN_INTERVAL: Final = "scan_interval"
CONF_REQUEST_DELAY: Final = "request_delay"

APPLICATION_ALL: Final = "all"
APPLICATION_116: Final = "116"
APPLICATION_130: Final = "130"
APPLICATIONS: Final = (
    APPLICATION_ALL,
    APPLICATION_116,
    APPLICATION_130,
)

# Defaults for Michael's mbusd gateway. All values remain configurable in the
# upcoming config flow.
DEFAULT_HOST: Final = "10.0.0.30"
DEFAULT_PORT: Final = 502
DEFAULT_DEVICE_ID: Final = 5
DEFAULT_APPLICATION: Final = APPLICATION_ALL
DEFAULT_SCAN_INTERVAL: Final = timedelta(seconds=15)
DEFAULT_TIMEOUT: Final = 5.0
DEFAULT_RETRIES: Final = 1

# A short pause prevents back-to-back TCP requests from overwhelming the
# 19200 baud RTU side of mbusd. The client serializes every request.
DEFAULT_REQUEST_DELAY: Final = 0.10
DEFAULT_RECONNECT_DELAY: Final = 1.0
DEFAULT_RECONNECT_DELAY_MAX: Final = 30.0

# Only adjacent addresses are grouped. This avoids reading undocumented holes
# that may return Modbus exception 02 (illegal data address).
MAX_READ_BLOCK_SIZE: Final = 16

# These four documented, contiguous and read-only registers are used for the
# first refresh before Home Assistant entities have registered their contexts.
DEFAULT_POLL_REGISTER_KEYS: Final = (
    "temperature_s1",
    "temperature_s2",
    "temperature_s3",
    "temperature_s4",
)

