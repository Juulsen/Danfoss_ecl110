"""Plant diagram configuration for an ECL Comfort 110.

The physical plant is stored in the config entry options and may be overridden
on a single dashboard card. Unknown keys are ignored so older cards keep
working when the schema grows.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

PLANT_VERSION = 1

APPLICATIONS = ("130", "116")
TYPES_BY_APPLICATION = {
    "130": ("hex", "direct", "boiler"),
    "116": ("dhw_hex", "dhw_fs"),
}
ACTUATORS = ("gear", "abv")
EMITTERS = ("radiator", "floor", "both")
COMPONENTS = (
    "s1",
    "s2",
    "s3",
    "s4",
    "m1",
    "p1",
    "radiator",
    "floor",
    "eca",
    "eca110",
    "safety",
    "ext",
    "fs",
    "meter",
)
ENTITY_KEYS = ("room", "heat_power", "heat_energy", "heat_flow")
LABEL_KEYS = ("site", "consumer")
CONNECTIONS = ("veksler", "direkte")
VALVES = ("3vejs", "2vejs")

# Registers the wizard may offer to enable. Nothing here is enabled unless an
# admin explicitly confirms the list.
ENABLEABLE_REGISTER_KEYS = (
    "valve_open_signal",
    "valve_close_signal",
    "actual_mode",
    "pump_state",
)


def _explicit_false(value: Any) -> bool:
    """True when a checkbox was stored as off. Missing keys are not off."""

    return value is False or value == 0 or value == "false" or value == "off"


def _connection(source: Mapping[str, Any]) -> str:
    """Drawing-only heat-source choice. An explicit false beats a stored slug."""

    if "veksler" in source and _explicit_false(source.get("veksler")):
        return "direkte"
    choice = source.get("connection")
    if choice in CONNECTIONS:
        return str(choice)
    if source.get("type") == "direct":
        return "direkte"
    return "veksler"


def _valve(source: Mapping[str, Any]) -> str:
    """Drawing-only valve choice. An explicit false beats a stored 3-way slug."""

    if "ventil_3vejs" in source and _explicit_false(source.get("ventil_3vejs")):
        return "2vejs"
    choice = source.get("valve")
    if choice in VALVES:
        return str(choice)
    return "3vejs"


def _text(value: Any, limit: int = 40) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    return cleaned[:limit]


def normalize_plant(raw: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a forward-compatible plant description."""

    source = raw if isinstance(raw, Mapping) else {}
    application = str(source.get("application") or "130")
    if application not in TYPES_BY_APPLICATION:
        application = "130"
    allowed_types = TYPES_BY_APPLICATION[application]
    plant_type = source.get("type")
    if plant_type not in allowed_types:
        plant_type = allowed_types[0]
    actuator = source.get("actuator")
    if actuator not in ACTUATORS:
        actuator = "gear"
    components: list[str] = []
    requested = source.get("components")
    if isinstance(requested, list):
        for item in requested:
            if item not in COMPONENTS or item in components:
                continue
            if item == "fs" and plant_type != "dhw_fs":
                continue
            if item in {"radiator", "floor"} and application != "130":
                continue
            if item == "p1" and plant_type == "dhw_fs":
                continue
            components.append(item)
    entities: dict[str, str | None] = {}
    raw_entities = source.get("entities") if isinstance(source.get("entities"), Mapping) else {}
    for key in ENTITY_KEYS:
        value = _text(raw_entities.get(key), limit=255)
        entities[key] = value
    labels: dict[str, str] = {}
    raw_labels = source.get("labels") if isinstance(source.get("labels"), Mapping) else {}
    for key in LABEL_KEYS:
        value = _text(raw_labels.get(key))
        if value:
            labels[key] = value
    plant: dict[str, Any] = {
        "version": PLANT_VERSION,
        "application": application,
        "type": plant_type,
        "actuator": actuator,
        "components": components,
        "entities": entities,
        "estimate_valve": bool(source.get("estimate_valve")),
        "connection": _connection(source),
        "valve": _valve(source),
    }
    plant["veksler"] = plant["connection"] == "veksler"
    plant["ventil_3vejs"] = plant["valve"] == "3vejs"
    if application == "130":
        emitters = source.get("emitters")
        plant["emitters"] = emitters if emitters in EMITTERS else "radiator"
    if labels:
        plant["labels"] = labels
    return plant
