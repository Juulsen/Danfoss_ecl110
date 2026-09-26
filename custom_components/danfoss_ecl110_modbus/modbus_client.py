"""Asynchronous Modbus TCP client for the Danfoss ECL Comfort 110."""

from __future__ import annotations

import asyncio
from time import monotonic
from typing import Final

from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException

from .const import (
    DEFAULT_RECONNECT_DELAY,
    DEFAULT_RECONNECT_DELAY_MAX,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_RETRIES,
    DEFAULT_TIMEOUT,
)

MAX_MODBUS_READ_COUNT: Final = 125


class EclModbusError(Exception):
    """Base exception for ECL110 communication errors."""


class EclConnectionError(EclModbusError):
    """Raised when the mbusd gateway cannot be reached."""


class EclReadError(EclModbusError):
    """Raised when a holding-register read fails validation."""


class EclWriteError(EclModbusError):
    """Raised when a holding-register write or verification fails."""


class Ecl110ModbusClient:
    """Serialize Modbus TCP requests to an ECL110 behind mbusd."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        device_id: int,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
        request_delay: float = DEFAULT_REQUEST_DELAY,
    ) -> None:
        """Initialize the client without opening a connection."""

        if not 0 <= device_id <= 247:
            raise ValueError("device_id must be between 0 and 247")
        if not 1 <= port <= 65535:
            raise ValueError("port must be between 1 and 65535")
        if timeout <= 0:
            raise ValueError("timeout must be greater than zero")
        if retries < 0:
            raise ValueError("retries cannot be negative")
        if request_delay < 0:
            raise ValueError("request_delay cannot be negative")

        self.host = host
        self.port = port
        self.device_id = device_id
        self.request_delay = request_delay

        self._client = AsyncModbusTcpClient(
            host,
            port=port,
            timeout=timeout,
            retries=retries,
            reconnect_delay=DEFAULT_RECONNECT_DELAY,
            reconnect_delay_max=DEFAULT_RECONNECT_DELAY_MAX,
            name=f"Danfoss ECL110 {host}:{port}/{device_id}",
        )
        self._request_lock = asyncio.Lock()
        self._last_request_finished = 0.0

    @property
    def connected(self) -> bool:
        """Return whether PyModbus currently has an open socket."""

        return self._client.connected

    async def async_connect(self) -> None:
        """Open the TCP connection if it is not already connected."""

        if self.connected:
            return

        try:
            connected = await self._client.connect()
        except (ModbusException, OSError, asyncio.TimeoutError) as err:
            raise EclConnectionError(
                f"Could not connect to mbusd at {self.host}:{self.port}"
            ) from err

        if not connected:
            raise EclConnectionError(
                f"Could not connect to mbusd at {self.host}:{self.port}"
            )

    async def async_close(self) -> None:
        """Close the TCP connection."""

        # AsyncModbusTcpClient.close() is intentionally synchronous.
        self._client.close()

    async def _async_wait_for_bus(self) -> None:
        """Respect the configured delay between completed requests."""

        if self._last_request_finished == 0:
            return

        remaining = (
            self.request_delay
            - (monotonic() - self._last_request_finished)
        )
        if remaining > 0:
            await asyncio.sleep(remaining)

    async def async_read_holding_registers(
        self,
        *,
        address: int,
        count: int = 1,
    ) -> list[int]:
        """Read and validate a contiguous FC03 holding-register block."""

        if not 0 <= address <= 0xFFFF:
            raise ValueError("address must be between 0 and 65535")
        if not 1 <= count <= MAX_MODBUS_READ_COUNT:
            raise ValueError(
                f"count must be between 1 and {MAX_MODBUS_READ_COUNT}"
            )
        if address + count - 1 > 0xFFFF:
            raise ValueError("requested register block exceeds address 65535")

        async with self._request_lock:
            await self.async_connect()
            await self._async_wait_for_bus()

            try:
                response = await self._client.read_holding_registers(
                    address,
                    count=count,
                    device_id=self.device_id,
                )
            except (ModbusException, OSError, asyncio.TimeoutError) as err:
                self._client.close()
                raise EclReadError(
                    f"Read failed for holding registers "
                    f"{address}-{address + count - 1} on device "
                    f"{self.device_id}"
                ) from err
            finally:
                self._last_request_finished = monotonic()

            if response.isError():
                self._client.close()
                raise EclReadError(
                    f"Device {self.device_id} returned {response!s} for "
                    f"holding registers {address}-{address + count - 1}"
                )

            registers = getattr(response, "registers", None)
            if not isinstance(registers, list) or len(registers) != count:
                received = 0 if registers is None else len(registers)
                raise EclReadError(
                    f"Expected {count} registers from address {address}, "
                    f"received {received}"
                )

            return [int(value) & 0xFFFF for value in registers]

    async def async_write_holding_register(
        self,
        *,
        address: int,
        value: int,
    ) -> int:
        """Write one FC06 register and verify it with an immediate FC03 read."""

        if not 0 <= address <= 0xFFFF:
            raise ValueError("address must be between 0 and 65535")
        if not 0 <= value <= 0xFFFF:
            raise ValueError("value must be between 0 and 65535")

        async with self._request_lock:
            await self.async_connect()
            await self._async_wait_for_bus()

            try:
                response = await self._client.write_register(
                    address,
                    value,
                    device_id=self.device_id,
                )
            except (ModbusException, OSError, asyncio.TimeoutError) as err:
                self._client.close()
                raise EclWriteError(
                    f"Write failed for holding register {address} on "
                    f"device {self.device_id}"
                ) from err
            finally:
                self._last_request_finished = monotonic()

            if response.isError():
                self._client.close()
                raise EclWriteError(
                    f"Device {self.device_id} returned {response!s} for "
                    f"holding register {address}"
                )

            echoed_address = getattr(response, "address", None)
            echoed_registers = getattr(response, "registers", None)
            if echoed_address != address or not echoed_registers:
                self._client.close()
                raise EclWriteError(
                    f"Invalid FC06 acknowledgement for register {address}"
                )
            if (int(echoed_registers[0]) & 0xFFFF) != value:
                raise EclWriteError(
                    f"FC06 acknowledgement did not echo value {value} for "
                    f"register {address}"
                )

            await self._async_wait_for_bus()
            try:
                verification = await self._client.read_holding_registers(
                    address,
                    count=1,
                    device_id=self.device_id,
                )
            except (ModbusException, OSError, asyncio.TimeoutError) as err:
                self._client.close()
                raise EclWriteError(
                    f"Could not verify holding register {address} after write"
                ) from err
            finally:
                self._last_request_finished = monotonic()

            if verification.isError():
                self._client.close()
                raise EclWriteError(
                    f"Device {self.device_id} rejected verification read for "
                    f"holding register {address}"
                )
            registers = getattr(verification, "registers", None)
            if not isinstance(registers, list) or len(registers) != 1:
                raise EclWriteError(
                    f"Invalid verification response for register {address}"
                )

            read_back = int(registers[0]) & 0xFFFF
            if read_back != value:
                raise EclWriteError(
                    f"Register {address} returned {read_back} after writing "
                    f"{value}"
                )
            return read_back

