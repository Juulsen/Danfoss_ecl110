# ECL110 Modbus · Juulsen

**Home Assistant control, weekly schedules and contextual help for Danfoss ECL Comfort 110.**

Version **0.3.0** · Local Modbus TCP · Danish / English · Independent community project

Developed by **Juulsen**. This integration is not developed, supported or endorsed by Danfoss.

## What is new

- A dashboard card with **Overview · Settings · Schedule · Suggestions**.
- Settings grouped by ECL menu number, with units and readable choices.
- An information dialog with explanations, formulas, examples and manual page references.
- Two comfort periods per day, a timeline and copying to selected weekdays.
- Floor-heating and radiator starting suggestions with an explicit change preview.
- A design heat-curve calculator based on the application 130 guide.
- 22 numeric controls, 10 setting selections and one daylight-saving switch; 28 additional schedule selections are optional.

Numeric ranges added in this version use the application 130 manual and paired display/raw observations. They are **not all physically write-tested**. The eight controls introduced in 0.2.4 have been reported working by the owner. Every write is still validated, sent using FC06, and checked with an immediate FC03 readback.

## Install / update

1. Download the [repository ZIP](https://github.com/Juulsen/Danfoss_ecl110/archive/refs/heads/main.zip).
2. Extract it and copy the complete `custom_components/danfoss_ecl110_modbus` folder to `/config/custom_components/`, including its `frontend` subfolder.
3. Restart Home Assistant.
4. Open **Settings → Devices & services → ECL110 → Reconfigure**.
5. Select the actual application: **130** for room heating, **116** for domestic hot water. Newly expanded heating writes require explicit selection of **130**; `all` does not unlock them.
6. Enable **ECA 110 weekly schedule** only if the controller has its timer program. Setup tests reading all seven days before creating the 28 time selections together.

HACS: the repository can be added as a custom integration repository where repository access and HACS validation permit. This is not a claim of inclusion in the HACS default store.

## Add the dashboard card

No Browser Mod or additional card dependency is needed. The integration serves its bundled files itself.

Add a dashboard **resource** (JavaScript module):

```text
/ecl110-static/ecl110-card.js?v=0.3.0
```

Then add a manual card:

```yaml
type: custom:ecl110-card
```

With exactly one ECL110 device, discovery is automatic. With multiple controllers, choose one existing entity from the desired controller:

```yaml
type: custom:ecl110-card
entity: sensor.REPLACE_WITH_YOUR_ECL110_S1_ENTITY
# Optional: language: da
```

This is a dashboard card. Home Assistant's standard device page is not replaced or restyled. Names and entity IDs can be customized normally; discovery uses the integration's attributes rather than guessed IDs.

## Daily operation

**Overview:** four temperatures and operating mode.

**Settings:** groups follow the ECL menu structure. Values are in display units; changing an input writes that individual value. The info button explains its purpose and provides relevant formulas. Unsupported or disabled registers appear as read-only; enable a diagnostic sensor if its current reading is needed.

**Schedule:** edit two start/stop pairs, select optional copy days, then save. Editing fields alone performs no writes. Times use half-hour steps, including **24:00**, which is different from 00:00. The card accepts ordered periods within a day; equal start/stop makes a zero-length interval. Overnight periods must be split across days. The controller must be in AUTO and have the ECA 110 timer function for scheduled operation.

A multi-register schedule update is **not atomic**. Writes are individually checked. On failure the operation stops and reports the number confirmed; the last attempted write may also have taken effect. Previously completed writes are not automatically rolled back. Check the controller and reload the card before retrying if communication failed. Avoid simultaneous editing from another client.

**Suggestions:** the floor-heating starting suggestion is slope **0.6**, knee point **OFF**; the radiator starting suggestion is slope **1.2**, knee point **40 °C**. These come from guide examples/defaults, not a design of your installation. Only those two values change after preview and confirmation. No pump limits, return limits, maximum flow temperature or valve travel time are changed by a suggestion. Like schedules, a two-setting update can partially complete.

## Help and calculations

The supplied operating guides were reviewed:

| Guide | Application | Reference |
|---|---|---|
| Weather-compensated heating | 130 | AQ188586469712en-010801, software 1.08 onward |
| Constant domestic-hot-water control | 116 | AQ188586469032en-010701, software 1.08 onward |
| Modbus map | 116/130 | [Ingramz/ecl110](https://github.com/Ingramz/ecl110), firmware 1.06 |

The manual explains menu behaviour; it does not establish every Modbus encoding. The version difference is retained as an uncertainty, not treated as proof of compatibility.

The popup covers:

- Heat-curve design slope (130 pages 11–12).
- Room influence including heat-curve slope (130 pages 14–16).
- Return influence above/below the limit (130 pages 18–19).
- Two-digit optimizer code (130 pages 21–22).
- PI tuning relationships, as explanation rather than automatic tuning (130 page 27).
- Valve travel time from stroke/speed or angle/speed (130 page 26).
- Symmetrical neutral zone and minimum motor pulse conversion (130 pages 26, 31).

The heat-curve calculator computes a **design slope**, not the exact live target including all controller influences. The guide specifies separate formulas above and below 40 °C; the calculator deliberately does not invent a formula at exactly 40 °C.

## Coverage and limits

112 register addresses are preserved; 85 named readable registers remain available as sensors, plus six optional OFF/Active sensors. Unknown registers stay hidden.

Some items cannot honestly be called finished Modbus controls yet:

- S1 filter **5081** has no confirmed register address.
- Alternate codes for return priority, total stop, pump/valve exercise, actuator type, DHW priority and external override remain unresolved. They are not guessed as 0/1.
- OFF codes for auto-reduction, return integration, heating cut-out, pump frost and backlight are unresolved. Their documented numeric ranges can be used; unknown OFF codes are not sent.
- Network/bus address changes and multi-field clock setting are not exposed for writing.
- Application 116-specific menus **6094, 6095, 6096, 6097, 6129 and 6173** need confirmed Modbus mappings. Heating presets are never offered for 116.
- A full climate entity and direct serial RTU transport remain future work.

Existing sensor IDs are retained. The three OFF/numeric controls introduced as selects in 0.2.4 remain selects, with expanded choices. No forced entity-registry cleanup is performed.

## Communication

Home Assistant → Modbus TCP gateway → RS485 → ECL110. Connection settings remain configurable. Source serial settings are 19200 baud, 8 data bits, even parity, 1 stop bit. The gateway serial configuration is separate from this integration.

Polling and setting writes share an operation lock; a completed older poll cannot overwrite a just-verified write. Reads are grouped only across adjacent named registers. Minimum/maximum flow settings are checked against a fresh reading of the opposite limit before writing.

## Validation

Run decoder and write-boundary tests without Home Assistant:

```sh
python -m unittest discover -s tests -v
```

The tests cover observed raw readings, signed encoding, fractional step rejection, OFF options, translations, schedule boundaries and writes denied for unknown settings. Browser checks use simulated Home Assistant states and service calls. They do not replace installation testing against Home Assistant and the real controller.

See [CHANGELOG.md](CHANGELOG.md) for version history and [hardware observations](docs/hardware-verification-2026-09-19.md) for the earlier measurement record.
