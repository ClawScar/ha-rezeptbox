# Rezeptbox für Home Assistant

Rezepte mit einem Link importieren und direkt im Dashboard anzeigen – ohne
Copy-and-paste. Die Integration holt sich Titel, Bild, Zutaten, Mengen,
Zubereitungsschritte, Zeiten, Portionen, Tags und Bewertung von der Quellseite
und legt alles als Sensor mit Attributen ab. Eine mitgelieferte Lovelace-Karte
zeigt das Rezept mit abhakbarer Zutatenliste und Button für die Einkaufsliste.

## Funktionen

- **Import per URL** über die normale Integration-Oberfläche
  (Einstellungen → Geräte & Dienste → Integration hinzufügen → Rezeptbox)
- **Chefkoch-Adapter** über die offene `api.chefkoch.de/v2`-Schnittstelle
  (kein API-Key nötig), mit automatischem Fallback auf die Webseite
- **Generischer Import** für alle Seiten, die schema.org-Rezeptdaten als
  JSON-LD ausliefern (Lecker, Allrecipes, Kitchen Stories, BBC Good Food …)
- **Ein Sensor pro Rezept** mit allen Details als Attribute
- **Rezeptliste als Lovelace-Karte** `custom:recipe-box-list`: alle Rezepte
  alphabetisch, ein Klick öffnet das gewählte Rezept, der Zurück-Pfeil führt
  wieder zur Liste
- **Detail-Karte** `custom:recipe-box-card` mit Bild, Chips für Zeit, Portionen
  und Bewertung, Zutaten zum Abhaken und Zubereitungsschritten
- **Einkaufsliste**: Service `recipe_box.add_to_shopping_list` übernimmt alle
  Zutaten in die Home-Assistant-Einkaufsliste
- **Offline-Cache**: das zuletzt geladene Rezept wird lokal gespeichert und
  bleibt verfügbar, wenn die Quellseite nicht erreichbar ist
- **Einstellbares Aktualisierungsintervall** (Standard: 24 Stunden, 0 = nie)

Getestet gegen Home Assistant ab Version **2025.1**.

## Installation

### Über HACS (empfohlen)

1. HACS öffnen → **Integrationen** → Drei-Punkte-Menü → **Benutzerdefinierte
   Repositories**
2. URL dieses Repositories eintragen, Kategorie **Integration** wählen
3. **Rezeptbox** installieren und Home Assistant neu starten

### Manuell

Den Ordner `custom_components/recipe_box` nach
`/config/custom_components/recipe_box` kopieren und Home Assistant neu starten.

## Rezept importieren

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. **Rezeptbox** auswählen
3. Rezept-Link einfügen, z. B.
   `https://www.chefkoch.de/rezepte/2060241333351072/Die-beste-Okroschka-nach-Mamas-Rezept.html`
4. Fertig – das Rezept erscheint als Gerät mit Sensor

Jedes Rezept ist ein eigener Eintrag. Über **Konfigurieren** am Eintrag lässt
sich das Aktualisierungsintervall ändern.

## Dashboard-Karten

Die Karten werden beim Start automatisch als JavaScript-Modul geladen. Falls sie
in deiner Installation nicht auftauchen, trage die Ressource einmal manuell unter
**Einstellungen → Dashboards → Ressourcen** ein:

```yaml
url: /recipe_box/recipe-card.js
type: module
```

### Rezeptliste mit Detailansicht

Zeigt alle importierten Rezepte alphabetisch als Liste. Ein Klick öffnet das
gewählte Rezept in derselben Karte, der Zurück-Pfeil führt wieder zur Liste.

```yaml
type: custom:recipe-box-list
title: Unsere Rezepte   # optional
# entities:             # optional, sonst alle Rezepte
#   - sensor.lasagne
#   - sensor.curry
show_image: true        # Vorschaubilder in der Liste
show_steps: true        # Zubereitung in der Detailansicht
```

### Einzelnes Rezept

```yaml
type: custom:recipe-box-card
entity: sensor.die_beste_okroschka_nach_mamas_rezept
show_image: true   # optional
show_steps: true   # optional
```

Beide Karten bieten eine Zutaten-Checkliste (zum Abhaken beim Kochen) und den
Button **Zutaten auf die Liste**, der den Service aufruft.

## Entitäten und Attribute

| Entität | Zustand |
| --- | --- |
| `sensor.<rezept>` | Gesamtzeit in Minuten (Device-Class `duration`) |
| `sensor.<rezept>_portionen` | Anzahl der Portionen |

Der Haupt-Sensor trägt alle Rezeptdaten als Attribute:

| Attribut | Inhalt |
| --- | --- |
| `title`, `description`, `author` | Titel, Beschreibung, Autor |
| `source_url`, `site` | Quell-URL und Seitenname |
| `image_url` | Rezeptbild (auch als `entity_picture`) |
| `servings` | Portionen |
| `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes` | Zeiten |
| `ingredients` | Liste der Zutaten, z. B. `["500 g Kartoffeln", …]` |
| `ingredient_groups` | Zutaten nach Gruppen (`name`, `items`) |
| `instructions` | Liste der Zubereitungsschritte |
| `tags`, `cuisine`, `category`, `difficulty` | Einordnung |
| `rating`, `rating_count` | Bewertung |
| `nutrition` | Nährwerte, falls vorhanden |

Beispiel für eine Automation:

```yaml
- alias: "Abendessen von der Einkaufsliste"
  trigger:
    - platform: time
      at: "17:00:00"
  action:
    - action: recipe_box.add_to_shopping_list
      target:
        entity_id: sensor.lasagne
```

## Service

`recipe_box.add_to_shopping_list`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `entity_id` | ja | Rezept-Sensor (auch mehrere möglich) |

Der Service nutzt die eingebaute Einkaufsliste (`shopping_list`). Ist sie nicht
eingerichtet, meldet Home Assistant einen Fehler.

## Unterstützte Seiten

- **Chefkoch** – primär über die JSON-API, fallback auf JSON-LD der Webseite
- **Alle Seiten mit schema.org-`Recipe`-JSON-LD** – das ist der Standard bei
  nahezu allen großen Rezeptportalen

Nicht unterstützt werden Seiten ohne strukturierte Rezeptdaten, Rezepte hinter
einem Login oder Seiten, die Bots blockieren. In dem Fall erscheint im
Konfigurationsdialog die Meldung *„Auf dieser Seite wurde kein Rezept
gefunden"* bzw. *„Die Seite konnte nicht geladen werden"*.

## Aktualisierung und Cache

Standardmäßig wird ein Rezept alle 24 Stunden neu geladen (Chefkoch: ein
einziger API-Aufruf). Über **Konfigurieren** lässt sich das Intervall
zwischen 0 (nie) und 168 Stunden einstellen.

Das zuletzt erfolgreich geladene Rezept wird unter
`.storage/recipe_box.<eintrag>` gespeichert. Schlägt ein Abruf fehl, bleiben
Sensor und Karte mit dem gespeicherten Stand nutzbar; im Log steht eine
Warnung.

## Fehlersuche

Debug-Logging aktivieren:

```yaml
logger:
  logs:
    custom_components.recipe_box: debug
```

Häufige Meldungen:

- `no_recipe` – die Seite liefert kein Rezept-JSON-LD (oder nur eine
  Vorschau-/Consent-Seite).
- `cannot_connect` – Timeout oder HTTP 403. Manche Portale blockieren
  Rechenzentrums-IPs; aus dem Heimnetz funktioniert der Abruf meist.
- Die Karte erscheint nicht – Ressource wie oben beschrieben manuell
  hinzufügen und den Browser-Cache leeren.

## Datenschutz

Es wird ausschließlich die von dir eingetragene Rezeptseite abgerufen. Die
Daten bleiben lokal in Home Assistant; es gibt keine Cloud, kein Konto und
keine Telemetrie.

## Projektstruktur

```
custom_components/recipe_box/
  __init__.py        Einrichtung, Services
  config_flow.py     Import per URL, Optionen
  coordinator.py     Abruf, Cache, Aktualisierungsintervall
  scraper.py         HTTP: Chefkoch-API und HTML-Abruf
  parser.py          Reine Parser (JSON-LD, Chefkoch, Zeiten, Mengen)
  sensor.py          Rezept- und Portionen-Sensor
  frontend.py        Auslieferung der Lovelace-Karte
  www/recipe-card.js Lovelace-Karte
tests/               Unit-Tests und Fixtures
```

`parser.py` kommt ohne Home-Assistant-Importe aus und ist damit direkt
testbar:

```bash
python3 -m unittest discover -s tests -v
```

## Lizenz

MIT – siehe [LICENSE](LICENSE).
