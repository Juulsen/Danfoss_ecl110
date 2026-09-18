"""Register definitions for the Danfoss ECL Comfort 110.

The register map is based on the reverse-engineered Ingramz/ecl110 project:
https://github.com/Ingramz/ecl110

The source was gathered from application 116/130, software version 1.06.
Registers marked R? or TODO: FORMAT by the source remain explicitly
unconfirmed here. They are never considered safe to write.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Final, Mapping

SOURCE_URL: Final = "https://github.com/Ingramz/ecl110"
SUPPORTED_APPLICATIONS: Final = frozenset({"116", "130"})


class RegisterType(StrEnum):
    """Modbus register table used by the ECL110."""

    HOLDING = "holding"


class RegisterAccess(StrEnum):
    """Documented access level."""

    READ_ONLY = "read_only"
    READ_WRITE = "read_write"
    READ_UNCONFIRMED = "read_unconfirmed"
    READ_WRITE_UNCONFIRMED = "read_write_unconfirmed"


class RegisterDataType(StrEnum):
    """Raw 16-bit representation."""

    UINT16 = "uint16"
    INT16 = "int16"


class EntityPlatform(StrEnum):
    """Home Assistant platform intended for the register."""

    SENSOR = "sensor"
    BINARY_SENSOR = "binary_sensor"
    NUMBER = "number"
    SELECT = "select"
    TIME = "time"
    NONE = "none"


class RegisterConfidence(StrEnum):
    """Confidence inherited from the reverse-engineered source."""

    CONFIRMED = "confirmed"
    INFERRED = "inferred"
    UNKNOWN = "unknown"


class ValueFormat(StrEnum):
    """Special register value formats."""

    RAW = "raw"
    HHMM = "hhmm"


@dataclass(frozen=True, slots=True, kw_only=True)
class EclRegister:
    """Description of one ECL110 Modbus register."""

    key: str
    address: int
    name: str
    description: str
    access: RegisterAccess
    platform: EntityPlatform
    data_type: RegisterDataType = RegisterDataType.UINT16
    register_type: RegisterType = RegisterType.HOLDING
    function_code: int = 3
    description_en: str | None = None
    decoded_min: float | None = None
    decoded_max: float | None = None
    offset: int = 0
    scale: float = 1.0
    precision: int | None = None
    unit: str | None = None
    device_class: str | None = None
    state_class: str | None = None
    icon: str | None = None
    entity_category: str | None = None
    enabled_by_default: bool = True
    applications: frozenset[str] = field(
        default_factory=lambda: SUPPORTED_APPLICATIONS
    )
    ecl_line: str | None = None
    options: Mapping[int, str] | None = None
    raw_min: int | None = None
    raw_max: int | None = None
    invalid_raw_values: frozenset[int] = field(default_factory=frozenset)
    value_format: ValueFormat = ValueFormat.RAW
    confidence: RegisterConfidence = RegisterConfidence.CONFIRMED
    safe_write: bool = False

    @property
    def readable(self) -> bool:
        """Return whether the register may be read."""

        return self.access in {
            RegisterAccess.READ_ONLY,
            RegisterAccess.READ_WRITE,
            RegisterAccess.READ_UNCONFIRMED,
            RegisterAccess.READ_WRITE_UNCONFIRMED,
        }

    @property
    def writable(self) -> bool:
        """Return whether the source indicates write access."""

        return self.access in {
            RegisterAccess.READ_WRITE,
            RegisterAccess.READ_WRITE_UNCONFIRMED,
        }

    def supports_application(self, application: str | None) -> bool:
        """Return whether the register belongs to the selected application."""

        return application is None or application in self.applications

    def decode(self, raw_value: int | None) -> int | float | str | None:
        """Decode a raw 16-bit Modbus value."""

        if raw_value is None:
            return None

        raw = int(raw_value) & 0xFFFF
        if raw in self.invalid_raw_values:
            return None

        value = raw
        if self.data_type is RegisterDataType.INT16 and value >= 0x8000:
            value -= 0x10000

        if self.options is not None:
            return self.options.get(value, f"unknown_{value}")

        if self.value_format is ValueFormat.HHMM:
            hours, minutes = divmod(value, 100)
            if 0 <= hours <= 24 and minutes in (0, 30):
                return f"{hours:02d}:{minutes:02d}"
            return None

        scaled = value * self.scale + self.offset
        # Preserve raw_value on the entity, but never label unconfirmed OFF
        # sentinels (e.g. 9 or 29) as physical minutes or degrees.
        if self.decoded_min is not None and scaled < self.decoded_min:
            return None
        if self.decoded_max is not None and scaled > self.decoded_max:
            return None
        if self.precision is not None:
            return round(scaled, self.precision)
        if self.scale == 1:
            return int(scaled)
        return scaled

    def validate_raw_write(self, raw_value: int) -> None:
        """Validate a raw write without performing any communication."""

        if not self.writable:
            raise ValueError(f"{self.key} is not writable")
        if not self.safe_write:
            raise ValueError(f"{self.key} is not confirmed safe to write")
        if self.raw_min is not None and raw_value < self.raw_min:
            raise ValueError(f"{self.key} must be at least {self.raw_min}")
        if self.raw_max is not None and raw_value > self.raw_max:
            raise ValueError(f"{self.key} must be at most {self.raw_max}")
        if self.options is not None and raw_value not in self.options:
            raise ValueError(f"{self.key} has unsupported value {raw_value}")
        if self.value_format is ValueFormat.HHMM:
            hours, minutes = divmod(raw_value, 100)
            if not (0 <= hours <= 24 and minutes in (0, 30)):
                raise ValueError(
                    f"{self.key} must use HHMM with minutes 00 or 30"
                )


def _register(
    *,
    key: str,
    address: int,
    name: str,
    description: str,
    access: RegisterAccess,
    platform: EntityPlatform,
    applications: tuple[str, ...] = ("116", "130"),
    **kwargs: object,
) -> EclRegister:
    """Create a register definition with normalized applications."""

    return EclRegister(
        key=key,
        address=address,
        name=name,
        description=description,
        access=access,
        platform=platform,
        applications=frozenset(applications),
        **kwargs,
    )


def _unknown(
    address: int,
    *,
    applications: tuple[str, ...] = ("116", "130"),
    access: RegisterAccess = RegisterAccess.READ_UNCONFIRMED,
    description: str | None = None,
) -> EclRegister:
    """Create a disabled diagnostic entity for an undocumented register."""

    return _register(
        key=f"unknown_{address}",
        address=address,
        name=f"Ukendt register {address}",
        description=description or "Funktionen er ikke identificeret i kilden.",
        access=access,
        platform=EntityPlatform.NONE,
        applications=applications,
        enabled_by_default=False,
        entity_category="diagnostic",
        icon="mdi:help-circle-outline",
        confidence=RegisterConfidence.UNKNOWN,
    )


_DESIRED_MODE: Final = {
    1: "auto",
    2: "comfort",
    3: "setback",
    4: "standby",
}

_LANGUAGE: Final = {
    0: "english",
    1: "swedish",
    2: "danish",
    3: "finnish",
    4: "german",
    5: "estonian",
    6: "lithuanian",
    7: "latvian",
    8: "polish",
}

_ON_OFF: Final = {0: "off", 1: "on"}

_registers: list[EclRegister] = []

# Weekly schedule. Each day uses four HHMM values. The source confirms minutes
# 00/30 and accepts 2400.
for day_key, day_name, base_address in (
    ("monday", "Mandag", 1109),
    ("tuesday", "Tirsdag", 1119),
    ("wednesday", "Onsdag", 1129),
    ("thursday", "Torsdag", 1139),
    ("friday", "Fredag", 1149),
    ("saturday", "Lørdag", 1159),
    ("sunday", "Søndag", 1169),
):
    for offset, slot_key, slot_name in (
        (0, "start_1", "start 1"),
        (1, "stop_1", "stop 1"),
        (2, "start_2", "start 2"),
        (3, "stop_2", "stop 2"),
    ):
        _registers.append(
            _register(
                key=f"schedule_{day_key}_{slot_key}",
                address=base_address + offset,
                name=f"{day_name} {slot_name}",
                description=(
                    "Ugeprogrammets klokkeslæt i formatet HHMM. "
                    "Minutter kan være 00 eller 30; værdien 2400 accepteres."
                ),
                access=RegisterAccess.READ_WRITE,
                platform=EntityPlatform.TIME,
                value_format=ValueFormat.HHMM,
                raw_min=0,
                raw_max=2400,
                icon="mdi:calendar-clock",
                safe_write=True,
            )
        )

_registers.extend(
    [
        _unknown(2002),
        _register(
            key="modbus_address",
            address=2007,
            name="Modbus-adresse",
            description=(
                "ECL110-enhedens Modbus-adresse. Ændring kan afbryde "
                "kommunikationen og er derfor ikke markeret som sikker skrivning."
            ),
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=0,
            raw_max=247,
            ecl_line="8320",
            entity_category="configuration",
            icon="mdi:numeric",
        ),
        _unknown(2010),
        _unknown(2014),
        _register(
            key="language",
            address=2027,
            name="Sprog",
            description="Displaysprog.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.SELECT,
            options=_LANGUAGE,
            raw_min=0,
            raw_max=8,
            ecl_line="8315",
            entity_category="configuration",
            icon="mdi:translate",
            safe_write=True,
        ),
    ]
)

_registers.extend(_unknown(address) for address in range(2102, 2111))

_registers.extend(
    [
        _register(
            key="pump_state",
            address=4001,
            name="Pumpe",
            description="Formodet status for pumpe til/fra.",
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            options=_ON_OFF,
            enabled_by_default=False,
            icon="mdi:pump",
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="valve_open_signal",
            address=4100,
            name="Ventil åbner",
            description="Formodet signal for åbning af motorventilen.",
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            options=_ON_OFF,
            enabled_by_default=False,
            icon="mdi:valve-open",
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="valve_close_signal",
            address=4101,
            name="Ventil lukker",
            description="Formodet signal for lukning af motorventilen.",
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            options=_ON_OFF,
            enabled_by_default=False,
            icon="mdi:valve-closed",
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="desired_mode",
            address=4200,
            name="Ønsket driftstilstand",
            description="Ønsket driftstilstand: auto, komfort, sænkning eller standby.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.SELECT,
            options=_DESIRED_MODE,
            raw_min=1,
            raw_max=4,
            icon="mdi:thermostat",
            safe_write=True,
        ),
        _register(
            key="actual_mode",
            address=4210,
            name="Aktuel driftstilstand",
            description="Formodet aktuel driftstilstand.",
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            options=_DESIRED_MODE,
            enabled_by_default=False,
            icon="mdi:thermostat",
            confidence=RegisterConfidence.INFERRED,
        ),
        _unknown(4614),
        _register(
            key="eca_address",
            address=11009,
            name="ECA-adresse",
            description="Valg af rum-/fjernbetjeningspanel: 0=fra, 1=A, 2=B.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.SELECT,
            applications=("130",),
            options={0: "off", 1: "a", 2: "b"},
            raw_min=0,
            raw_max=2,
            ecl_line="7010",
            entity_category="configuration",
            safe_write=True,
        ),
    ]
)

# Documented writable settings where the source explicitly says TODO: FORMAT.
# They are kept in the map for future number/select platforms, but safe_write
# remains False until scaling, sign and valid ranges have been verified.
for (
    address,
    key,
    name,
    description,
    line,
    applications,
) in (
    (11010, "auto_reduct", "Automatisk sænkning", "Sænkning afhængig af udetemperatur.", "5011", ("130",)),
    (11011, "boost", "Boost", "Boostfunktion.", "5012", ("130",)),
    (11012, "reference_ramp", "Referencerampe", "Rampning af temperaturreferencen.", "5013", ("130",)),
    (11013, "optimizer", "Optimering", "Optimeringens tidskonstant.", "5014", ("130",)),
    (11014, "room_integration_time", "Rum integrationstid", "Tidskonstant for rumtemperatur.", "3015", ("130",)),
    (11019, "optimization_basis", "Optimering baseret på", "Optimering baseret på rum- eller udetemperatur.", "5020", ("130",)),
    (11020, "total_stop", "Totalstop", "Indstilling for totalstop.", "5021", ("130",)),
    (11021, "pump_exercise", "Pumpemotionering", "Automatisk motionering af pumpe P1.", "7022", ("116", "130")),
    (11022, "valve_exercise", "Ventilmotionering", "Automatisk motionering af ventil M1.", "7023", ("116", "130")),
    (11023, "actuator_type", "Aktuatortype", "Valg mellem gearmotor og termisk aktuator.", "7024", ("130",)),
    (11029, "return_temperature_limit", "Returtemperaturgrænse", "Begrænsning af returtemperatur.", "4030", ("116", "130")),
    (11034, "return_gain_max", "Returbegrænsning maks. påvirkning", "Maksimal påvirkning fra returtemperaturbegrænsningen.", "4035", ("116", "130")),
    (11035, "return_gain_min", "Returbegrænsning min. påvirkning", "Minimal påvirkning fra returtemperaturbegrænsningen.", "4036", ("116", "130")),
    (11036, "return_integration_time", "Returbegrænsning integrationstid", "Tidskonstant for returtemperaturbegrænsningen.", "4037", ("116", "130")),
    (11051, "dhw_priority", "Varmtvandsprioritet", "Lukket ventil eller normal drift ved varmtvandsprioritet.", "7052", ("130",)),
    (11076, "pump_frost_temperature", "Pumpe frosttemperatur", "Temperaturgrænse for frostbeskyttelse af P1.", "7077", ("116", "130")),
    (11077, "pump_heat_temperature", "Pumpe varmebehovstemperatur", "Temperaturgrænse for varmebehov til P1.", "7078", ("116", "130")),
    (11084, "return_priority", "Returtemperaturprioritet", "Prioritet for returtemperaturbegrænsning.", "4085", ("130",)),
    (11092, "standby_temperature", "Standbytemperatur", "Temperatur ved standby.", "7093", ("116", "130")),
):
    _registers.append(
        _register(
            key=key,
            address=address,
            name=name,
            description=description + " Råformat og gyldigt område er endnu ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            applications=applications,
            ecl_line=line,
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        )
    )

_registers.extend(
    [
        _unknown(
            11099,
            applications=("130",),
            description="Muligvis akkumuleret udetemperatur; ikke bekræftet.",
        ),
        _register(
            key="external_override",
            address=11140,
            name="Ekstern overstyring",
            description="Ekstern overstyring. Råformatet er ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            ecl_line="7141",
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="knee_point",
            address=11161,
            name="Knækpunkt",
            description="Varmekurvens knækpunkt. Råformatet er ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            ecl_line="7162",
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="motor_protection",
            address=11173,
            name="Motorbeskyttelse",
            description=(
                "Motorbeskyttelse i applikation 130, ECL-linje 6174. "
                "Funktionen er ukendt i applikation 116, og råformatet er ikke bekræftet."
            ),
            access=RegisterAccess.READ_WRITE_UNCONFIRMED,
            platform=EntityPlatform.NUMBER,
            ecl_line="6174",
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
    ]
)

for address, key, name, description, line, applications in (
    (11174, "heating_curve_slope", "Varmekurvehældning", "Varmekurvens hældning.", "2175", ("130",)),
    (11175, "parallel_displacement", "Parallelforskydning", "Parallelforskydning af varmekurven.", "2176", ("130",)),
    (11176, "flow_temperature_min", "Fremløbstemperatur minimum", "Minimumgrænse for fremløbstemperatur.", "2177", ("116", "130")),
    (11177, "flow_temperature_max", "Fremløbstemperatur maksimum", "Maksimumgrænse for fremløbstemperatur.", "2178", ("116", "130")),
    (11178, "heating_cutout", "Varmeudkobling", "Udetemperaturgrænse for varmeudkobling.", "5179", ("130",)),
    (11181, "room_gain_max", "Rumbegrænsning maks. påvirkning", "Maksimal påvirkning fra rumtemperaturbegrænsningen.", "3182", ("130",)),
    (11182, "room_gain_min", "Rumbegrænsning min. påvirkning", "Minimal påvirkning fra rumtemperaturbegrænsningen.", "3183", ("130",)),
    (11183, "proportional_band", "Proportionalbånd Xp", "Regulatorens proportionalbånd.", "6184", ("116", "130")),
    (11184, "integration_time", "Integrationstid Tn", "Regulatorens integrationstidskonstant.", "6185", ("116", "130")),
    (11185, "valve_running_time", "Ventilmotors gangtid", "Gangtid for den motoriserede reguleringsventil M1.", "6186", ("116", "130")),
    (11186, "neutral_zone", "Neutralzone Nz", "Regulatorens neutralzone.", "6187", ("116", "130")),
    (11188, "minimum_activation_time", "Minimum aktiveringstid", "Minimum aktiveringstid for gearmotoren.", "7189", ("116", "130")),
    (11197, "daylight_saving", "Sommertid", "Automatisk skift til og fra sommertid.", "7198", ("116", "130")),
    (11198, "ecl_address", "ECL-adresse", "Master-/slaveadresse på ECL-bussen.", "7199", ("116", "130")),
):
    _registers.append(
        _register(
            key=key,
            address=address,
            name=name,
            description=description + " Råformat og gyldigt område er endnu ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            applications=applications,
            ecl_line=line,
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        )
    )

_registers.extend(
    [
        _unknown(
            11179,
            applications=("130",),
            description="Muligvis ønsket rumtemperatur; formatet er ikke bekræftet.",
        ),
        _unknown(
            11180,
            applications=("130",),
            description="Muligvis manuel temperatur; formatet er ikke bekræftet.",
        ),
        _unknown(11189, applications=("116",)),
        _unknown(11190, applications=("116",)),
    ]
)

# Actual S1-S4 values are signed tenths of a degree. Raw 1920 equals
# 192.0 °C and indicates a disconnected input.
for sensor_number, address in enumerate(range(11200, 11204), start=1):
    _registers.append(
        _register(
            key=f"temperature_s{sensor_number}",
            address=address,
            name=f"Temperatur S{sensor_number}",
            description=(
                f"Aktuel temperatur på følerindgang S{sensor_number}. "
                "Følerens fysiske funktion afhænger af ECL-applikationen."
            ),
            access=RegisterAccess.READ_ONLY,
            platform=EntityPlatform.SENSOR,
            data_type=RegisterDataType.INT16,
            scale=0.1,
            precision=1,
            unit="°C",
            device_class="temperature",
            state_class="measurement",
            icon="mdi:thermometer",
            invalid_raw_values=frozenset({1920}),
        )
    )

_registers.extend(_unknown(address) for address in range(11220, 11224))

_registers.extend(
    [
        _register(
            key="desired_s2",
            address=11228,
            name="Ønsket værdi S2",
            description=(
                "Ønsket aflæsning for S2 i applikation 130. "
                "Skalering og betydning er ikke bekræftet."
            ),
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            applications=("130",),
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="desired_s3",
            address=11229,
            name="Ønsket værdi S3",
            description="Ønsket aflæsning for S3. Skalering og betydning er ikke bekræftet.",
            access=RegisterAccess.READ_UNCONFIRMED,
            platform=EntityPlatform.SENSOR,
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _unknown(60007),
        _unknown(
            60020,
            access=RegisterAccess.READ_WRITE_UNCONFIRMED,
            description=(
                "Kilden angiver mulig læse-/skriveadgang, men funktionen er ukendt. "
                "Registeret må ikke skrives."
            ),
        ),
        _unknown(60025),
        _register(
            key="display_backlight",
            address=60057,
            name="Displaybaggrundslys",
            description="Displayets lysstyrke. Råformatet er ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            ecl_line="8310",
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="display_contrast",
            address=60058,
            name="Displaykontrast",
            description="Displayets kontrast. Råformatet er ikke bekræftet.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            ecl_line="8311",
            entity_category="configuration",
            enabled_by_default=False,
            confidence=RegisterConfidence.INFERRED,
        ),
        _register(
            key="clock_hour",
            address=64044,
            name="Ur timer",
            description="ECL110-urets time.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=0,
            raw_max=23,
            ecl_line="1000",
            entity_category="configuration",
            icon="mdi:clock-outline",
            safe_write=True,
        ),
        _register(
            key="clock_minute",
            address=64045,
            name="Ur minutter",
            description="ECL110-urets minut.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=0,
            raw_max=59,
            ecl_line="1000",
            entity_category="configuration",
            icon="mdi:clock-outline",
            safe_write=True,
        ),
        _register(
            key="clock_day",
            address=64046,
            name="Ur dag",
            description="ECL110-urets dag i måneden.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=1,
            raw_max=31,
            ecl_line="1000",
            entity_category="configuration",
            icon="mdi:calendar",
            safe_write=True,
        ),
        _register(
            key="clock_month",
            address=64047,
            name="Ur måned",
            description=(
                "ECL110-urets måned. Kan ikke ændres til en måned, som ikke "
                "indeholder den aktuelt valgte dag."
            ),
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=1,
            raw_max=12,
            ecl_line="1000",
            entity_category="configuration",
            icon="mdi:calendar",
            safe_write=True,
        ),
        _register(
            key="clock_year",
            address=64048,
            name="Ur år",
            description="Årstal som antal år efter 2000; gyldigt område 1-40.",
            access=RegisterAccess.READ_WRITE,
            platform=EntityPlatform.NUMBER,
            raw_min=1,
            raw_max=40,
            ecl_line="1000",
            entity_category="configuration",
            icon="mdi:calendar",
            safe_write=True,
        ),
        _unknown(65534),
        _unknown(65535),
    ]
)

# Display semantics: Danfoss AQ188586469712en-010801 (130) and
# AQ188586469032en-010701 (116), valid from software 1.08.
# Wire scaling is inferred where the reverse-engineered map has TODO: FORMAT.
# Unknown OFF/option codes are deliberately not guessed. Numeric values outside
# documented ranges return None; the original unsigned word remains available.
_DISPLAY_METADATA: Final = {
    'heating_curve_slope': dict(
        name='Varmekurvens hældning',
        unit=None,
        scale=0.1,
        precision=1,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=0.1,
        decoded_max=4.0,
        description='Varmekurvens hældning. Manual 130, side 11. Numerisk område: 0.1–4 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Heating curve slope. Application 130 manual, page 11. Numeric range: 0.1–4 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'parallel_displacement': dict(
        name='Varmekurvens parallelforskydning',
        unit='K',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=-20.0,
        decoded_max=20.0,
        description='Varmekurvens parallelforskydning. Manual 130, side 13. Numerisk område: -20–20 K. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Heating curve parallel displacement. Application 130 manual, page 13. Numeric range: -20–20 K. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'flow_temperature_min': dict(
        name='Minimum fremløbstemperatur',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=10.0,
        decoded_max=150.0,
        description='Minimum fremløbstemperatur. Manual 130, side 13. Numerisk område: 10–150 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Minimum flow temperature. Application 130 manual, page 13. Numeric range: 10–150 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'flow_temperature_max': dict(
        name='Maksimum fremløbstemperatur',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=10.0,
        decoded_max=150.0,
        description='Maksimum fremløbstemperatur. Manual 130, side 13. Numerisk område: 10–150 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Maximum flow temperature. Application 130 manual, page 13. Numeric range: 10–150 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'room_integration_time': dict(
        name='Rumreguleringens integration',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=50.0,
        description='Rumreguleringens integration. Manual 130, side 16. Numerisk område: 1–50 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. Manualen angiver ingen tidsenhed.',
        description_en='Room control integration. Application 130 manual, page 16. Numeric range: 1–50 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. No time unit is specified by the manual.',
        data_type=RegisterDataType.UINT16,
    ),
    'room_gain_max': dict(
        name='Rumpåvirkning over ønsket temperatur',
        unit=None,
        scale=0.1,
        precision=1,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=-9.9,
        decoded_max=0.0,
        description='Rumpåvirkning over ønsket temperatur. Manual 130, side 16. Numerisk område: -9.9–0 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Room influence above target. Application 130 manual, page 16. Numeric range: -9.9–0 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'room_gain_min': dict(
        name='Rumpåvirkning under ønsket temperatur',
        unit=None,
        scale=0.1,
        precision=1,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=0.0,
        decoded_max=9.9,
        description='Rumpåvirkning under ønsket temperatur. Manual 130, side 16. Numerisk område: 0–9.9 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Room influence below target. Application 130 manual, page 16. Numeric range: 0–9.9 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'return_temperature_limit': dict(
        name='Returtemperaturgrænse',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=10.0,
        decoded_max=110.0,
        description='Returtemperaturgrænse. Manual 130, side 17. Numerisk område: 10–110 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Return temperature limit. Application 130 manual, page 17. Numeric range: 10–110 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'return_gain_max': dict(
        name='Returpåvirkning over grænsen',
        unit=None,
        scale=0.1,
        precision=1,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=-9.9,
        decoded_max=9.9,
        description='Returpåvirkning over grænsen. Manual 130, side 18. Numerisk område: -9.9–9.9 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Return influence above limit. Application 130 manual, page 18. Numeric range: -9.9–9.9 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'return_gain_min': dict(
        name='Returpåvirkning under grænsen',
        unit=None,
        scale=0.1,
        precision=1,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=-9.9,
        decoded_max=9.9,
        description='Returpåvirkning under grænsen. Manual 130, side 18. Numerisk område: -9.9–9.9 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Return influence below limit. Application 130 manual, page 18. Numeric range: -9.9–9.9 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'return_integration_time': dict(
        name='Returbegrænsningens integrationstid',
        unit='s',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=50.0,
        description='Returbegrænsningens integrationstid. Manual 130, side 19. Numerisk område: 1–50 s. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Return limitation integration time. Application 130 manual, page 19. Numeric range: 1–50 s. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'return_priority': dict(
        name='Returbegrænsning overstyrer minimum fremløb',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Returbegrænsning overstyrer minimum fremløb. Manual 130, side 19. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Return limitation overrides minimum flow. Application 130 manual, page 19. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'auto_reduct': dict(
        name='Udetemperaturgrænse for sænkning',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=-29.0,
        decoded_max=10.0,
        description='Udetemperaturgrænse for sænkning. Manual 130, side 20. Numerisk område: -29–10 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Outdoor temperature threshold for setback. Application 130 manual, page 20. Numeric range: -29–10 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.INT16,
    ),
    'boost': dict(
        name='Boost af ønsket fremløbstemperatur',
        unit='%',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=99.0,
        description='Boost af ønsket fremløbstemperatur. Manual 130, side 20. Numerisk område: 1–99 %. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Flow temperature boost. Application 130 manual, page 20. Numeric range: 1–99 %. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'reference_ramp': dict(
        name='Opstartsrampe for ønsket fremløb',
        unit='min',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=99.0,
        description='Opstartsrampe for ønsket fremløb. Manual 130, side 21. Numerisk område: 1–99 min. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Flow temperature startup ramp. Application 130 manual, page 21. Numeric range: 1–99 min. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'optimizer': dict(
        name='Optimeringskode',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=10.0,
        decoded_max=59.0,
        description='Optimeringskode. Manual 130, side 21–22. Numerisk område: 10–59 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. Koden beskriver bygning, varmeanlæg og dimensioneringstemperatur; ingen tidsenhed.',
        description_en='Optimization code. Application 130 manual, page 21–22. Numeric range: 10–59 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. Code describes building, heating system and design temperature; no time unit.',
        data_type=RegisterDataType.UINT16,
    ),
    'optimization_basis': dict(
        name='Temperaturgrundlag for optimering',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Temperaturgrundlag for optimering. Manual 130, side 22. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal. Displayvalg: ROOM (rumtemperatur) eller OUT (udetemperatur).',
        description_en='Optimization temperature basis. Application 130 manual, page 22. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw. Display options: ROOM (room temperature) or OUT (outdoor temperature).',
        data_type=RegisterDataType.UINT16,
    ),
    'total_stop': dict(
        name='Totalstop under sænkningsperioden',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Totalstop under sænkningsperioden. Manual 130, side 23. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Total stop during setback. Application 130 manual, page 23. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'heating_cutout': dict(
        name='Udetemperaturgrænse for varmeudkobling',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=50.0,
        description='Udetemperaturgrænse for varmeudkobling. Manual 130, side 24. Numerisk område: 1–50 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Outdoor temperature threshold for heating cut-out. Application 130 manual, page 24. Numeric range: 1–50 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'motor_protection': dict(
        name='Aktiveringsforsinkelse for motorbeskyttelse',
        unit='min',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=10.0,
        decoded_max=59.0,
        description='Aktiveringsforsinkelse for motorbeskyttelse. Manual 130, side 25. Numerisk område: 10–59 min. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Motor protection activation delay. Application 130 manual, page 25. Numeric range: 10–59 min. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'proportional_band': dict(
        name='Proportionalbånd Xp',
        unit='K',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=250.0,
        description='Proportionalbånd Xp. Manual 130, side 25. Numerisk område: 1–250 K. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. I 116: Xp1 ved forsyningstemperatur S2 = 65 °C.',
        description_en='Proportional band Xp. Application 130 manual, page 25. Numeric range: 1–250 K. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. In application 116: Xp1 at supply temperature S2 = 65 °C.',
        data_type=RegisterDataType.UINT16,
    ),
    'integration_time': dict(
        name='Integrationstid Tn',
        unit='s',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=5.0,
        decoded_max=999.0,
        description='Integrationstid Tn. Manual 130, side 25. Numerisk område: 5–999 s. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Integration time Tn. Application 130 manual, page 25. Numeric range: 5–999 s. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'valve_running_time': dict(
        name='Ventilmotorens fulde gangtid',
        unit='s',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=5.0,
        decoded_max=250.0,
        description='Ventilmotorens fulde gangtid. Manual 130, side 25. Numerisk område: 5–250 s. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Valve motor full travel time. Application 130 manual, page 25. Numeric range: 5–250 s. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'neutral_zone': dict(
        name='Neutralzone Nz',
        unit='K',
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=9.0,
        description='Neutralzone Nz. Manual 130, side 26. Numerisk område: 1–9 K. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Neutral zone Nz. Application 130 manual, page 26. Numeric range: 1–9 K. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'eca_address': dict(
        name='Rum- eller fjernbetjeningspanel',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Rum- eller fjernbetjeningspanel. Manual 130, side 28. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Room panel or remote control. Application 130 manual, page 28. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'pump_exercise': dict(
        name='Pumpemotionering',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Pumpemotionering. Manual 130, side 28. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Pump exercise. Application 130 manual, page 28. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'valve_exercise': dict(
        name='Ventilmotionering',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Ventilmotionering. Manual 130, side 28. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Valve exercise. Application 130 manual, page 28. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'actuator_type': dict(
        name='Aktuatortype',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Aktuatortype. Manual 130, side 28. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal. Displayvalg: GEAR (gearmotor) eller ABV (termisk aktuator).',
        description_en='Actuator type. Application 130 manual, page 28. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw. Display options: GEAR (gear motor) or ABV (thermal actuator).',
        data_type=RegisterDataType.UINT16,
    ),
    'dhw_priority': dict(
        name='Varmtvandsprioritet fra master',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Varmtvandsprioritet fra master. Manual 130, side 29. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='DHW priority from master. Application 130 manual, page 29. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'pump_frost_temperature': dict(
        name='Frostgrænse for pumpestart',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=-10.0,
        decoded_max=20.0,
        description='Frostgrænse for pumpestart. Manual 130, side 29. Numerisk område: -10–20 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. 130 bruger udetemperaturen; 116 bruger fremløbstemperatur S3.',
        description_en='Pump frost protection threshold. Application 130 manual, page 29. Numeric range: -10–20 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. Application 130 uses outdoor temperature; 116 uses flow temperature S3.',
        data_type=RegisterDataType.INT16,
    ),
    'pump_heat_temperature': dict(
        name='Ønsket fremløbstemperatur for pumpestart',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=-20.0,
        decoded_max=50.0,
        description='Ønsket fremløbstemperatur for pumpestart. Manual 130, side 30. Numerisk område: -20–50 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. Område 130: 5–40 °C. Område 116: −20–50 °C.',
        description_en='Desired flow temperature threshold for pump start. Application 130 manual, page 30. Numeric range: -20–50 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. Application 130 range: 5–40 °C. Application 116 range: −20–50 °C.',
        data_type=RegisterDataType.INT16,
    ),
    'standby_temperature': dict(
        name='Ønsket fremløbstemperatur i standby',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=5.0,
        decoded_max=40.0,
        description='Ønsket fremløbstemperatur i standby. Manual 130, side 30. Numerisk område: 5–40 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Desired standby flow temperature. Application 130 manual, page 30. Numeric range: 5–40 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'external_override': dict(
        name='Ekstern overstyring',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Ekstern overstyring. Manual 130, side 30. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal. Displayvalg: OFF, SETBACK eller COMFORT.',
        description_en='External override. Application 130 manual, page 30. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw. Display options: OFF, SETBACK or COMFORT.',
        data_type=RegisterDataType.UINT16,
    ),
    'knee_point': dict(
        name='Varmekurvens knækpunkt',
        unit='°C',
        scale=1.0,
        precision=0,
        device_class='temperature',
        state_class=None,
        safe_write=False,
        decoded_min=30.0,
        decoded_max=50.0,
        description='Varmekurvens knækpunkt. Manual 130, side 31. Numerisk område: 30–50 °C. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Heating curve knee point. Application 130 manual, page 31. Numeric range: 30–50 °C. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'minimum_activation_time': dict(
        name='Minimumspuls til gearmotor',
        unit='ms',
        scale=20.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=40.0,
        decoded_max=1000.0,
        description='Minimumspuls til gearmotor. Manual 130, side 31. Numerisk område: 40–1000 ms. Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet. ECL viser trin 2–50; hvert trin er 20 ms. Trin 10 = 200 ms.',
        description_en='Minimum gear motor pulse. Application 130 manual, page 31. Numeric range: 40–1000 ms. Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed. ECL displays steps 2–50, each step equals 20 ms. Step 10 = 200 ms.',
        data_type=RegisterDataType.UINT16,
    ),
    'daylight_saving': dict(
        name='Automatisk sommer- og vintertid',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        description='Automatisk sommer- og vintertid. Manual 130, side 31. Valgenes Modbus-kodning er ikke bekræftet; ukodede valg vises som råtal.',
        description_en='Automatic daylight saving time. Application 130 manual, page 31. Numeric Modbus option encoding is unconfirmed; unmapped options remain raw.',
        data_type=RegisterDataType.UINT16,
    ),
    'ecl_address': dict(
        name='ECL-busadresse',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=0.0,
        decoded_max=15.0,
        description='ECL-busadresse. Manual 130, side 31–32. Numerisk område: 0–15 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='ECL bus address. Application 130 manual, page 31–32. Numeric range: 0–15 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'display_backlight': dict(
        name='Displayets baggrundslys (trin)',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=1.0,
        decoded_max=30.0,
        description='Displayets baggrundslys (trin). Manual 130, side 33. Numerisk område: 1–30 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Display backlight level. Application 130 manual, page 33. Numeric range: 1–30 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'display_contrast': dict(
        name='Displayets kontrast (trin)',
        unit=None,
        scale=1.0,
        precision=0,
        device_class=None,
        state_class=None,
        safe_write=False,
        decoded_min=0.0,
        decoded_max=20.0,
        description='Displayets kontrast (trin). Manual 130, side 33. Numerisk område: 0–20 . Modbus-dekodning udledt af manual og testværdier; OFF-kode ikke bekræftet.',
        description_en='Display contrast level. Application 130 manual, page 33. Numeric range: 0–20 . Modbus decoding inferred from manual and observed values; OFF encoding unconfirmed.',
        data_type=RegisterDataType.UINT16,
    ),
    'desired_s3': dict(
        name='Ønsket fremløbstemperatur S3',
        description='Ønsket S3. Skalering 0,1 °C er udledt af råværdier 300/321; skal bekræftes på ECL-displayet.',
        description_en='Desired S3. Scale 0.1 °C inferred from raw readings 300/321; verify against the ECL display.',
        scale=0.1,
        precision=1,
        unit='°C',
        device_class='temperature',
        safe_write=False,
        data_type=RegisterDataType.INT16,
    ),
    'clock_year': dict(
        name='Ur – årstal',
        description='Kalenderår; registeret tæller år efter 2000.',
        description_en='Calendar year; raw register counts years since 2000.',
        offset=2000,
        decoded_min=2001,
        decoded_max=2040,
        safe_write=False,
        data_type=RegisterDataType.UINT16,
    ),
}

_registers = [
    replace(register, **_DISPLAY_METADATA.get(register.key, {}))
    for register in _registers
]

REGISTERS: Final = tuple(sorted(_registers, key=lambda item: item.address))
REGISTERS_BY_KEY: Final = {register.key: register for register in REGISTERS}
REGISTERS_BY_ADDRESS: Final = {
    register.address: register for register in REGISTERS
}

if len(REGISTERS_BY_KEY) != len(REGISTERS):
    raise RuntimeError("Duplicate ECL110 register key")
if len(REGISTERS_BY_ADDRESS) != len(REGISTERS):
    raise RuntimeError("Duplicate ECL110 register address")

READABLE_REGISTERS: Final = tuple(
    register for register in REGISTERS if register.readable
)
WRITABLE_REGISTERS: Final = tuple(
    register for register in REGISTERS if register.writable
)
SAFE_WRITABLE_REGISTERS: Final = tuple(
    register for register in WRITABLE_REGISTERS if register.safe_write
)
# During the read-only verification phase, every named readable register is
# exposed as a sensor. Registers whose function is unknown remain in REGISTERS
# for documentation, but EntityPlatform.NONE prevents Home Assistant entities.
SENSOR_REGISTERS: Final = tuple(
    register
    for register in READABLE_REGISTERS
    if register.platform is not EntityPlatform.NONE
)

