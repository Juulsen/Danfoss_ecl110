# ECL110 – fysisk kontrol og Modbus-rådata, 2026-09-19

Kilder: Juulsens 70 displaybilleder (IMG_3950–IMG_4020, uden IMG_4000) og direkte Modbus-aflæsninger i samtalen. Enheden viser applikation 130 og produktkode 087B1662. Ingen skrivefunktion er testet via integrationen.

## Afgrænsning

Tabellen sammenholder de indsendte råværdier med de tilsvarende fotograferede indstillinger. Billedserien indeholder også midlertidige testværdier; den er ikke en samtidig komplet backup. Brugeren bekræftede særskilt, at 4085=OFF, 5020=UDE og 7141=OFF ved råværdi 0.

En enkelt observeret værdi dokumenterer ikke alle valgmuligheder, hele skalaen eller skriveadgang. Nulværdier alene beviser ikke skaleringen (2176, 3183 og 4036). Resultaterne er fra applikation 130; applikation 116 er ikke testet.

## Navngivne registre

| Menu | Registeradresse | Raw (u16, decimal) | Tilsvarende displayværdi |
|---:|---:|---:|---|
| 2175 | 11174 | 7 | 0,7 |
| 2176 | 11175 | 0 | 0 |
| 2177 | 11176 | 25 | 25 °C |
| 2178 | 11177 | 43 | 43 °C |
| 3015 | 11014 | 0 | OFF |
| 3182 | 11181 | 65496 | −4,0 |
| 3183 | 11182 | 0 | 0,0 |
| 4030 | 11029 | 50 | 50 °C |
| 4035 | 11034 | 65516 | −2,0 |
| 4036 | 11035 | 0 | 0,0 |
| 4037 | 11036 | 25 | 25 s |
| 4085 | 11084 | 0 | OFF |
| 5011 | 11010 | 65521 | −15 °C |
| 5012 | 11011 | 0 | OFF |
| 5013 | 11012 | 0 | OFF |
| 5014 | 11013 | 9 | OFF |
| 5020 | 11019 | 0 | UDE |
| 5021 | 11020 | 0 | OFF |
| 5179 | 11178 | 20 | 20 °C |
| 6174 | 11173 | 9 | OFF |
| 6184 | 11183 | 200 | 200 K |
| 6185 | 11184 | 60 | 60 s |
| 6186 | 11185 | 96 | 96 s |
| 6187 | 11186 | 3 | 3 K |
| 7010 | 11009 | 0 | OFF |
| 7022 | 11021 | 1 | ON |
| 7023 | 11022 | 0 | OFF |
| 7024 | 11023 | 1 | GEAR |
| 7052 | 11051 | 0 | OFF |
| 7077 | 11076 | 2 | 2 °C |
| 7078 | 11077 | 20 | 20 °C |
| 7093 | 11092 | 10 | 10 °C |
| 7141 | 11140 | 0 | OFF |
| 7162 | 11161 | 29 | OFF |
| 7189 | 11188 | 10 | 10 (trin; 200 ms) |
| 7198 | 11197 | 1 | ON |
| 7199 | 11198 | 15 | 15 |
| 8310 | 60057 | 16 | 16 |
| 8311 | 60058 | 10 | 10 |
| 8315 | 2027 | 2 | DANSK |
| 8320 | 2007 | 5 | 5 |

3015: Foto IMG_3956 viser **1 s**. Senere direkte test bekræftede raw 1 = 1 s og raw 0 = OFF, inklusive skrivning og gendannelse.

7189: Displayet viser trin 10 og den målte råværdi er 10. Omregningen til 200 ms kommer fra manualens 20 ms pr. trin, ikke fra en måling af motorpulsen.

## OFF og tekstvalg i version 0.2.3

- Numeriske OFF-koder: 3015/5012/5013 → 0; 5014/6174 → 9; 7162 → 29.
- Valg: 4085/5021/7023/7052/7141 → 0=OFF; 7022/7198 → 1=ON; 5020 → 0=UDE; 7024 → 1=GEAR.
- ECA 0=OFF og sprog 2=DANSK stemmer med eksisterende kildebaserede kodninger. De øvrige koder fra disse tabeller er ikke fysisk testet.
- Numeriske sensorer med OFF beholder deres måleenhed og har ingen numerisk værdi ved OFF. Seks separate tilstandssensorer viser OFF/Aktiv og er deaktiveret som standard.
- Tilstandssensoren Aktiv betyder, at indstillingen har en numerisk værdi; det er ikke en melding om, at pumpe eller ventil aktuelt kører.

## Ukendte registre – observation uden fortolkning

| Registeradresse | Raw | Status |
|---:|---:|---|
| 2002 | 2 | Aflæst |
| 2010 | 1662 | Aflæst |
| 2014 | 87 | Aflæst |
| 2102 | 108 | Aflæst |
| 2103 | 68 | Aflæst |
| 2104 | 108 | Aflæst |
| 2105 | 110 | Aflæst |
| 2106 | 68 | Aflæst |
| 2107 | 130 | Aflæst |
| 2108 | 2 | Aflæst |
| 2109 | 2 | Aflæst |
| 2110 | 36929 | Aflæst |
| 4614 | 0 | Aflæst |
| 11099 | 158 | Aflæst |
| 11179 | 22 | Aflæst |
| 11180 | 22 | Aflæst |
| 11189 | NA | Failed to execute Read |
| 11190 | NA | Failed to execute Read |
| 11220 | 1920 | Aflæst |
| 11221 | 1920 | Aflæst |
| 11222 | 1920 | Aflæst |
| 11223 | 1920 | Aflæst |
| 60007 | 0 | Aflæst |
| 60020 | 1 | Aflæst |
| 60025 | 2028 | Aflæst |
| 65534 | 0 | Aflæst |
| 65535 | 0 | Aflæst |

NA betyder læsefejl, ikke nul og ikke bevis for et ikke-eksisterende register. Brugeren rettede de oprindeligt angivne 60034:NA og 60035:NA til **65534:0 og 65535:0**. Værdien 1920 på ukendte adresser er bevaret ufortolket; vi overfører ikke automatisk S1–S4-fejlkodningen til disse registre.

## Direkte skrivetest med eksternt Modbus-program

Brugeren bekræftede FC06-skrivning, FC03-genlæsning, korrekt displayvisning og gendannelse for nedenstående værdier. Testene er afsluttet efter brugerens ønske. Der er ikke sendt skriverammer fra Home Assistant-integrationen, og version 0.2.3 er fortsat read-only.

| Menu | Register | Testede værdier og betydning |
|---:|---:|---|
| 8310 | 60057 | 16 ↔ 17, baggrundslys |
| 8311 | 60058 | 10 ↔ 11, kontrast |
| 8315 | 2027 | 0 = ENGLISH, 2 = DANSK |
| 7198 | 11197 | 0 = OFF, 1 = ON |
| 3015 | 11014 | 0 = OFF, 1 = 1 s |
| 5020 | 11019 | 0 = UDE, 1 = RUM |
| 5013 | 11012 | 0 = OFF, 1 = 1 min |
| 5012 | 11011 | 0 = OFF, 1 = 1 % |

Dette bekræfter de testede værdier og tilbageføring, ikke hele indstillingsområdet eller lagring efter strømafbrydelse.

## Mangler endnu

- Alternative råkoder: ON for 4085/5021/7023/7052, OFF for 7022, ABV for 7024 samt KOMFORT/REDUCER for 7141.
- ECA A/B og øvrige sprog: fysisk verifikation af eksisterende kildebaserede koder.
- OFF-koder ved 4037, 5011, 5179, 7077 og 8310.
- Ikke-nul-værdier for 2176, 3183 og 4036.
- Menu **5081 – S1-filter**: billeder viser 99, 100 og 101 uden enhed; Modbus-adresse ukendt. Ingen adresse udledt af menunummeret.
- Ønsket S2/S3, pumpe-/ventilstatus, fulde parameterområder og skrivefunktioner via Home Assistant.
- Ingen af de 27 ukendte adresser har fået en ny sikker funktionsbetegnelse alene på baggrund af denne måling.
