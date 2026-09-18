# Changelog

All notable changes to **Danfoss ECL110 Modbus** are documented in this file.

The project follows [Semantic Versioning](https://semver.org/). During the pre-1.0 development phase, minor releases can contain substantial changes while the hardware interface is being verified.

## [Unreleased]

### Planned

- Hardware verification of all 85 named read-only entities
- Confirmed scaling, sign and valid ranges for configuration registers
- Safe write support through dedicated `number`, `select`, `switch` and time platforms
- Additional translations
- HACS metadata, validation workflows and brand assets
- First published GitHub release

## [0.2.0] - 2026-09-18

### Added

- Complete internal map of 112 addresses from the reverse-engineered ECL110 source
- 85 named registers exposed as read-only Home Assistant test entities
- Complete Danish entity-name translations
- Complete English entity-name translations
- Translated enum states for operating mode, language, ECA selection and on/off signals
- Read-only access to schedules, controller settings, clock values and operating data
- Register metadata attributes for address, access, function code, application and confidence

### Changed

- Only S1-S4 are enabled by default
- Additional entities must be enabled deliberately for staged hardware testing
- Every enabled entity contributes its register to the coordinator polling context
- Named adjacent registers are grouped into bounded Modbus read blocks
- Project version increased from 0.1.1 to 0.2.0

### Removed

- Undocumented `unknown_<address>` entities from the Home Assistant device page
- Continuous polling of unverified addresses

### Safety

- All entities remain read-only even when the source marks the underlying register as writable
- Unknown addresses remain documented internally but cannot be enabled as entities
- Write support remains disabled pending real-hardware verification

## [0.1.1] - 2026-09-18

### Added

- Developer attribution for **Michael V. J. Juulsen**
- Separate integration-author and supported-device metadata

### Changed

- Integration display name standardized as **Danfoss ECL110 Modbus**
- Device model represented as **Danfoss ECL Comfort 110**
- Danish, English and base configuration strings aligned
- Config-entry title made independent from the device manufacturer field

## [0.1.0] - 2026-09-18

### Added

- Initial Home Assistant custom integration
- UI-based config flow
- Configurable Modbus TCP host, port and slave ID
- Application selection for 116, 130 or all
- Configurable update interval, timeout and request delay
- Serialized PyModbus TCP client
- Home Assistant data update coordinator
- Conservative contiguous-register block reading
- Initial S1-S4 temperature entities
- Signed 16-bit temperature decoding with 0.1 °C scaling
- Disconnected-sensor handling for raw value 1920
- Danish and English setup translations
- Device and entity metadata
- Initial reverse-engineered ECL110 register definitions

### Tested

- Connection through Modbus TCP gateway
- Configurable ECL110 slave ID
- Reading registers 11200-11203
- Live S1, S3 and S4 temperature values in Home Assistant

## Version links

- [Unreleased](https://github.com/Juulsen/Danfoss_ecl110/compare/v0.2.0...HEAD)
- [0.2.0](https://github.com/Juulsen/Danfoss_ecl110/releases/tag/v0.2.0)
- [0.1.1](https://github.com/Juulsen/Danfoss_ecl110/releases/tag/v0.1.1)
- [0.1.0](https://github.com/Juulsen/Danfoss_ecl110/releases/tag/v0.1.0)

> Release links become active after the corresponding GitHub releases are published.
