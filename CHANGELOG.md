# Changelog

All notable changes to **Danfoss ECL110 Modbus** are documented in this file.

The project follows [Semantic Versioning](https://semver.org/). During the pre-1.0 development phase, minor releases can contain substantial changes while the hardware interface is being verified.

## [Unreleased]

### Planned

- Hardware verification of all 85 named read-only entities
- Confirmed scaling, sign and valid ranges for configuration registers
- Further safe write support only after physical verification
- Additional translations
- HACS metadata, validation workflows and brand assets
- First published GitHub release

## [0.3.0] - 2026-09-19

### Added

- Bundled dashboard card with overview, grouped settings, weekly schedules and suggestions.
- Danish/English manual explanations, formulas and examples in information dialogs.
- Expanded application 130 numeric ranges, signed encoding and register-step validation.
- Source-supported mode, ECA panel and language options; known OFF/numeric controls retain their select IDs.
- Optional seven-day schedule with half-hour choices including 24:00, staged editing and copying to selected days.
- Schedule enablement in the config flow with read checks before activation.
- Previewed floor/radiator starting suggestions limited to slope and knee point.
- Heat-curve design calculator using the application 130 manual formulas.

### Fixed

- Reject 24:30 as an invalid end-of-day time.
- Serialize complete polls against writes to avoid publishing stale pre-write data.
- Check minimum/maximum flow constraints against the controller before writing.

### Scope and validation

- The owner reported the eight 0.2.4 HA write controls working.
- Newly expanded ranges are manual/display-supported, not claimed individually hardware write-tested.
- Unknown addresses, unresolved option/OFF codes, bus-address changes and clock writes remain unavailable.
- Added regression checks for signed values, steps, ranges and schedule times; card browser checks use simulated HA state.
- Real HA/controller testing of this new version is pending. Schedule/profile saves can partially complete on communication failure and report this explicitly.

## [0.2.4] - 2026-09-19

### Added

- Dedicated `number`, `select` and `switch` platforms for eight physically verified settings.
- Numeric controls for display backlight and contrast using their documented ranges.
- Restricted selections for language, room integration time, optimization basis, reference ramp and boost.
- Switch control for automatic daylight saving time.
- Danish and English names and option translations for every new control.

### Safety

- Writes use Modbus function 06 and are serialized with all reads on the shared bus.
- Every successful FC06 acknowledgement is followed immediately by an FC03 readback.
- A write fails when the acknowledgement or readback differs from the requested value.
- Only explicitly whitelisted registers and values can be written; all other registers remain read-only.
- Existing sensor entities and identifiers are preserved.

### Validation

- The eight controls are based on the completed external FC06, FC03, controller-display and restoration tests.
- Local validation covers the write whitelist, register ranges, syntax, translations and write/readback behaviour.

## [0.2.3] - 2026-09-19

### Fixed

- Room integration time (3015) now has the unit seconds, based on the physical display.
- Pump threshold (7078) is named consistently with the display's pump-stop setting.
- Removed misleading blanket OFF-code warnings from settings without a documented OFF option.

### Added

- Text decoding and Danish/English translations for the observed option codes only.
- Follow-up confirmation of 5020 raw 1 = ROOM/RUM and 7198 raw 0 = OFF.
- Verified OFF codes for 3015, 5012, 5013, 5014, 6174 and 7162.
- Six optional OFF/Active state sensors; numeric entities keep their units and identifiers.
- Raw-value observation metadata and a hardware verification report including all 27 unknown-register readings.

### Validation

- Local decoder and sensor contract checks against supplied raw readings, unknown codes, OFF transitions and translations.
- Display/raw evidence from application 130 is recorded separately from untested alternate codes and full ranges.
- User confirmed external FC06 writes, FC03 readback, display values and restoration for eight registers. Positive values for room integration, ramp and boost are included in the decoder tests.
- Home Assistant runtime and controller installation test of this version remain pending. No write support added.

## [0.2.2] - 2026-09-18

### Changed

- Align Danish and English setting names and units with the application 116/130 operating guides.
- Decode signed setback temperatures and signed gain values (tenths), heating curve slope (tenths), seconds, minutes and temperature differences.
- Minimum gear motor pulse uses 20 ms per setting step: 10 means 200 ms.
- Display clock year with the documented year-2000 offset.
- Desired S3 uses inferred 0.1 °C scaling, explicitly pending display confirmation.
- Preserve entity keys/addresses and raw values. Add bilingual descriptions and decoding metadata.
- Unconfirmed OFF sentinels outside numeric ranges show unknown with a decoding note, not a misleading physical value. Enum codes remain raw unless previously mapped.

### Validation

- Local checks of observed values, signed boundaries, pulse scaling, numeric sentinel handling and translation coverage; controller verification pending.
- Read-only operation remains in place. These operating guides document menu semantics, not the Modbus wire format.

## [0.2.1] - 2026-09-18

### Fixed

- Read-only setting sensors now use the diagnostic category. Home Assistant rejected the config category and could not load these entities.
- Existing entity identifiers and enabled states are preserved; no removal or reconfiguration is required.

### Validation

- Python syntax checked and category mapping checked locally.
- Hardware confirmation after installing this patch is pending.

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

- Developer attribution for **Juulsen**
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


