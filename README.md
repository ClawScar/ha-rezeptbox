# Rezeptbox für Home Assistant

Rezepte mit einem Link importieren und direkt im Dashboard anzeigen – ohne
Copy-and-paste. Die Rezeptbox startet leer; Rezepte kommen später über das
Importfeld in der Rezeptliste hinzu. Die Integration holt sich Titel, Bild,
Zutaten, Mengen, Zubereitungsschritte, Zeiten, Portionen, Tags und Bewertung
von der Quellseite und legt alles als Sensor mit Attributen ab. Eine
mitgelieferte Lovelace-Karte zeigt die Rezepte als Liste, das gewählte Rezept
mit abhakbarer Zutatenliste, Portionssteuerung und Button für die
Einkaufsliste.

## Funktionen

- **Automatische Sidebar-Seite** „Rezeptbox“: nach dem Neustart in der
  Seitenleiste verfügbar – Import, Liste und Löschen ohne Dashboard-Konfiguration
- **Leere Rezeptbox starten**: Integration hinzufügen genügt, es wird kein
  Pflichtfeld abgefragt
- **Import per Button**: eine oder mehrere URLs oben in der Rezeptliste
  einfügen (eine pro Zeile) und **Importieren** drücken – alternativ der
  Service `recipe_box.import_recipe`
- **Chefkoch-Adapter** über die offene `api.chefkoch.de/v2`-Schnittstelle
  (kein API-Key nötig), mit automatischem Fallback auf die Webseite
- **Generischer Import** für alle Seiten, die schema.org-Rezeptdaten als
  JSON-LD ausliefern (Lecker, Allrecipes, Kitchen Stories, BBC Good Food …)
- **Ein Sensor pro Rezept** mit allen Details als Attribute
- **Rezeptliste als Lovelace-Karte** `custom:recipe-box-list`: alle Rezepte
  alphabetisch, ein Klick öffnet das gewählte Rezept, der Zurück-Pfeil führt
  wieder zur Liste
- **Rezepte entfernen**: Papierkorb-Button in der Liste (zum Bestätigen
  zweimal antippen) oder Service `recipe_box.remove_recipe` – Gerät und
  Entitäten werden mit entfernt
- **Detail-Karte** `custom:recipe-box-card` mit Bild, Chips für Zeit, Portionen
  und Bewertung, Zutaten zum Abhaken und Zubereitungsschritten
- **Portionen anpassen**: in der Detailansicht mit −/+ die Portionszahl
  ändern, die Zutatenmengen werden live umgerechnet – auch Angaben wie
  „1/2 TL“ oder „2–3 EL“
- **Einkaufsliste**: Service `recipe_box.add_to_shopping_list` übernimmt alle
  Zutaten in die Home-Assistant-Einkaufsliste, auf Wunsch in den skalierten
  Mengen der eingestellten Portionszahl
- **Offline-Cache**: das zuletzt geladene Rezept wird lokal gespeichert und
  bleibt verfügbar, wenn die Quellseite nicht erreichbar ist
- **Einstellbares Aktualisierungsintervall** (Standard: 24 Stunden, 0 = nie)
- **Einkaufsliste ohne Dubletten**: gleiche Zutaten werden zusammengerechnet („2 Zwiebeln“ + „3 Zwiebeln“ → „5 Zwiebeln“, 500 g + 500 g → 1 kg), auch über mehrere Rezepte hinweg
- **Nur fehlende Zutaten**: abgehakte Zutaten bleiben auf Wunsch von der Einkaufsliste
- **Suche und Filter** in der Rezeptliste: Textsuche, Tags, Zeitfilter, Sortierung und „Was kochen?“ für einen Zufallsvorschlag
- **Gruppen**: Gruppen wie „Familie“ oder „Backen“ im Tab **Daten** anlegen, sortieren, umbenennen und löschen, Rezepte in der Detailansicht zuweisen und in der Rezeptliste über einen Tab je Gruppe direkt wechseln
- **Koch-Sitzung bleibt erhalten**: abgehakte Zutaten und gewählte Portionen überleben Neuladen und Handy-Sperre
- **Eigene Rezepte** ohne Link anlegen (Familienrezepte, Karten) – direkt in der Liste oder über den Service, auf Wunsch mit Foto von der Rezeptkarte, das sich später in der Detailansicht ändern oder entfernen lässt; nicht mehr benötigte Fotos räumt **Fotos aufräumen** im Tab **Daten** weg
- **Wochenplan** für die nächsten sieben Tage inklusive Einkauf für die ganze Woche
- **Sicherung**: alle Rezepte und den Wochenplan als JSON herunterladen und wieder einlesen
- **Mehr pro Rezept**: Nährwerte, Druckansicht, Schritt-Timer („25 Minuten“ antippen) und ein Aktualisieren-Button mit sichtbarem Fehlerstatus
- **Button-Entität** „Zutaten auf die Liste“ je Rezept für Dashboard und Automationen

Getestet gegen Home Assistant ab Version **2025.1**.

## Installation

### Über HACS (empfohlen)

1. HACS öffnen → **Integrationen** → nach **Rezeptbox** suchen
2. **Rezeptbox** installieren und Home Assistant neu starten

Taucht die Integration in der Suche noch nicht auf, hilft ein Neustart von Home
Assistant – HACS lädt den Standardkatalog nur beim Start neu.

### Über HACS als benutzerdefiniertes Repository

Falls die Suche die Integration gar nicht findet (etwa bei einer älteren
HACS-Version), lässt sie sich weiterhin manuell hinzufügen:

1. HACS öffnen → **Integrationen** → Drei-Punkte-Menü → **Benutzerdefinierte
   Repositories**
2. URL dieses Repositories eintragen, Kategorie **Integration** wählen
3. **Rezeptbox** installieren und Home Assistant neu starten

### Manuell

Den Ordner `custom_components/recipe_box` nach
`/config/custom_components/recipe_box` kopieren und Home Assistant neu starten.

## Einrichtung

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. **Rezeptbox** auswählen – die Integration wird ohne weitere Angaben
   angelegt, die Rezeptliste ist zunächst leer
3. Die Karte `custom:recipe-box-list` in ein Dashboard legen (siehe unten)

Das Aktualisierungsintervall für alle Rezepte lässt sich über
**Konfigurieren** am Eintrag ändern.

## Rezept importieren

**Über die Karte:** In der Rezeptliste oben eine oder mehrere Rezept-URLs
einfügen (eine pro Zeile, alternativ durch Komma getrennt) und **Importieren**
drücken. Die Rezepte erscheinen sofort in der Liste, am Ende zeigt eine
Benachrichtigung die Zusammenfassung (z. B. „3 von 4 importiert, 1
fehlgeschlagen“). Ein fehlerhafter Link blockiert die übrigen nicht. Mit
**Strg+Enter** (bzw. Cmd+Enter) startest du den Import aus dem Feld.

**Über einen Service** (z. B. in einem Skript oder einer Automation):

```yaml
action: recipe_box.import_recipe
data:
  url: https://www.chefkoch.de/rezepte/2060241333351072/Die-beste-Okroschka-nach-Mamas-Rezept.html
```

Bei einer URL gibt der Service `title` und `url` zurück, bei mehreren eine
Zusammenfassung mit `imported`, `failed` und `total`. Jedes Rezept wird als
eigenes Gerät mit zwei Sensoren angelegt.

Mehrere Adressen auf einmal:

```yaml
action: recipe_box.import_recipe
data:
  urls:
    - https://www.chefkoch.de/rezepte/2060241333351072/Die-beste-Okroschka-nach-Mamas-Rezept.html
    - https://www.chefkoch.de/rezepte/1065461220711547/Lasagne.html
```

`url` und `urls` lassen sich kombinieren; doppelte Adressen werden nur einmal
importiert. Schlägt ein Link fehl, erscheint er unter `failed` mit Fehlercode,
während die übrigen Rezepte importiert werden.

## Sidebar-Seite (automatisch)

Nach dem Neustart erscheint links in der Seitenleiste **Rezeptbox** (Scheren-
und-Gabel-Symbol). Diese Seite wird von der Integration selbst registriert: Sie
enthält Importfeld, Rezeptliste, Detailansicht und Löschen – ohne dass du ein
Dashboard bearbeiten oder eine Karte hinzufügen musst.

Die Karten bleiben trotzdem verfügbar, wenn du die Liste in ein bestehendes
Dashboard einbauen willst.

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
show_import: true       # Importfeld für neue Rezepte
show_delete: true       # Löschen-Button je Rezept
show_tools: true        # Tabs für Daten (Import, Sicherung, eigenes Rezept) und Wochenplan einblenden
```

Die Karte ist in drei Tabs aufgeteilt: **Rezepte**, **Daten** und
**Wochenplan**. Mit `show_tools: false` bleibt nur die Rezeptliste sichtbar.
Die Karte merkt sich im Browser den zuletzt geöffneten Tab und die zuletzt
gewählte Gruppe und startet nach einem Neuladen dort wieder.

Der Tab **Rezepte** zeigt die Liste: Suchfeld, Tag-Auswahl, Zeitfilter und
Sortierung filtern sie; **Was kochen?** öffnet ein zufälliges Rezept aus der
aktuellen Auswahl. Rechts neben jedem Eintrag entfernt der Papierkorb das
Rezept – der erste Klick fragt mit **Löschen?** nach, der zweite löscht
endgültig. In der Detailansicht sitzt derselbe Button oben rechts.

Sobald Gruppen angelegt sind, sitzt über der Liste eine Tab-Leiste: **Alle**
zeigt jedes Rezept, ein Tipp auf einen Gruppennamen nur die Rezepte dieser
Gruppe. Der aktive Tab ist farbig hinterlegt und wird – wie der Haupttab – im
Browser gemerkt.

Gruppen legt man im Tab **Daten** unter **Gruppen** an: Namen in das Feld
eintippen und **Anlegen** drücken; neue Gruppen hängen hinten an. Die
Reihenfolge der Chips ist die Reihenfolge der Tabs und lässt sich mit ▲ und ▼
verschieben. Jede Gruppe zeigt, wie viele Rezepte ihr zugewiesen sind; das ✎
benennt sie um, ohne die Zuweisungen anzufassen, und das × löscht sie wieder
(der erste Klick fragt mit **Löschen?** nach) und nimmt die Zuordnung von allen
Rezepten. Zuweisen lässt sich eine Gruppe in der
Detailansicht unter **Gruppen**: eine vorhandene Gruppe aus der Liste wählen
und **Hinzufügen** drücken oder unter **Neue Gruppe** einen Namen eintippen und
**Neue Gruppe** drücken – das × am Chip nimmt das Rezept wieder heraus. Eine
dort neu eingegebene Gruppe wird automatisch mit angelegt.

Mehrere Rezepte auf einmal bearbeiten: in der Rezeptliste ein Rezept länger
gedrückt halten (oder lange mit der Maus drücken), danach weitere antippen.
Über der Liste erscheint dann eine Leiste, in der sich die markierten Rezepte
gemeinsam einer vorhandenen Gruppe zuweisen (**Zuweisen**) oder daraus
entfernen (**Entfernen**) sowie löschen lassen; **Abbrechen** beendet die
Auswahl. Vor dem Löschen fragt die Karte in einem Dialog noch einmal nach.
Kleine Bewegungen des Fingers beim Halten stören die Auswahl nicht, und das
Kontextmenü des Browsers erscheint über der Liste nicht.

Der Tab **Daten** ist in vier getrennte Abschnitte gegliedert: **Rezepte
importieren** (eine oder mehrere URLs einfügen, **Importieren** drücken –
die Liste füllt sich sofort, ohne Neustart), **Gruppen** (anlegen, sortieren,
umbenennen, löschen, jeweils mit der Anzahl ihrer Rezepte), **Sicherung** sowie
**Eigenes Rezept**. Der Tab **Daten** steht rechts neben **Wochenplan**.

Unter **Sicherung** öffnet **Sichern** den Speichern-Dialog des Browsers
(Chrome/Edge); Browser ohne diesen Dialog legen die JSON-Datei im
Download-Ordner ab, in der Home-Assistant-App erscheint stattdessen das
Teilen-Menü. **Laden** daneben liest eine solche Sicherung wieder ein. Unter
**Eigenes Rezept** entsteht ein Rezept mit Titel, Portionen, Zutaten, Schritten
und Tags. Über **Foto hinzufügen** lässt sich ein Bild der Rezeptkarte auswählen
oder direkt mit der Handy-Kamera aufnehmen; es wird vor dem Hochladen auf
handliche Größe verkleinert und erscheint danach als Rezeptbild in Liste und
Detailansicht. **Foto entfernen** verwirft die Auswahl wieder. Bei einem
gespeicherten eigenen Rezept stehen in der Detailansicht **Foto ändern** und
**Foto entfernen** bereit. HEIC-Fotos vom iPhone kann nicht jeder Browser
umwandeln; die Karte weist dann darauf hin, das Foto als JPG zu speichern oder
direkt mit der Handy-Kamera aufzunehmen. Der Upload nutzt Home Assistants
Bildablage (`image_upload`, in `default_config` enthalten); fehlt sie, sagt die
Karte das beim Hochladen. Schlägt ein Foto fehl, nennt die Meldung die
Rezeptbox-Version sowie getrennt, ob das Hochladen oder das Speichern
scheiterte.

Unter **Fotos** im Tab **Daten** entfernt **Fotos aufräumen** die Bilder eigener
Rezepte, die zu keinem Rezept mehr gehören – etwa nach dem Löschen eines
Rezepts oder nach dem Ersetzen eines Fotos. Die Rezeptbox löscht dabei nur
Bilder, die sie selbst hochgeladen hat (erkennbar am Namenspräfix
`rezeptbox-` und an einer internen Liste); Profilfotos und Bilder anderer
Integrationen bleiben unangetastet. Fotos aus Versionen vor 2.4.2, deren
Rezept längst gelöscht wurde, lassen sich nicht sicher zuordnen und bleiben
deshalb liegen.

Sicherungen bleiben nach dem Aufräumen einlesbar. Fotos von Rezepten, die beim
Sichern noch existieren, werden nie gelöscht; nur Sicherungen von zuvor
gelöschten Rezepten verlieren deren Bilder. Verweist ein Rezept auf ein nicht
mehr vorhandenes Foto, warnt die Karte beim Sichern mit „Achtung: fehlende
Fotos bei …“.

Im Tab **Wochenplan** lassen sich die nächsten sieben Tage füllen (inklusive
**Woche auf die Einkaufsliste**).

### Einzelnes Rezept

```yaml
type: custom:recipe-box-card
entity: sensor.die_beste_okroschka_nach_mamas_rezept
show_image: true   # optional
show_steps: true   # optional
```

Beide Karten bieten eine Zutaten-Checkliste (zum Abhaken beim Kochen) und den
Button **Zutaten auf die Liste**, der den Service aufruft. Die Häkchen und die
eingestellte Portionszahl werden im Browser gespeichert und sind nach einem
Neuladen wieder da. Mit **nur fehlende** landen abgehakte Zutaten nicht auf der
Liste.

In der Detailansicht stehen außerdem Nährwerte (falls die Quelle sie liefert),
ein **Drucken**-Button, der das Rezept in einer eigenen Druckansicht öffnet und
den Standard-Druckdialog des Geräts aufruft (Drucker wählen oder als PDF
speichern), ein **Aktualisieren**-
Button für genau dieses Rezept (mit Hinweis, wenn der letzte Abruf scheiterte)
und Timer-Knöpfe an Schritten mit Zeitangabe („25 Minuten köcheln“ →
`⏱ 25 Min.`, mit Signalton am Ende). Zeitangaben über einer Stunde werden
 ebenfalls erkannt.

Über der Zutatenliste sitzt die Portionssteuerung **− 4 Portionen +**. Jeder
Klick rechnet die Mengen sofort um; der Chip oben zeigt die gewählte
Portionszahl. Einheiten und gängige Zutaten werden dabei mitpluralisiert („1 Prise“ → „2 Prisen“, „1 Glas“ → „2 Gläser“, „1 Zwiebel“ → „2 Zwiebeln“, „1 ganzer Apfel“ → „2 ganze Äpfel“, „1 Zwiebel rot“ → „2 Zwiebeln rot“); Rezepttitel, Markennamen und der Rest der Zutatenzeile bleiben unberührt. Beim Verringern der Portionen geht es mit dem Genus der Zutat zurück in den Singular („2 ganze Äpfel“ → „1 ganzer Apfel“, „2 große Zwiebeln“ → „1 große Zwiebel“, „2 kleine Eier“ → „1 kleines Ei“). Ohne Änderung bleibt der Originaltext samt Bruchschreibweise erhalten. Der Button **Zutaten auf die Liste** übernimmt genau diese
Mengen in die Einkaufsliste. Die Umrechnung ist nur eine Anzeige – das
importierte Rezept selbst bleibt unverändert.

## Entitäten und Attribute

| Entität | Zustand |
| --- | --- |
| `sensor.<rezept>` | Gesamtzeit in Minuten (Device-Class `duration`) |
| `sensor.<rezept>_portionen` | Anzahl der Portionen |
| `sensor.rezeptbox_wochenplan` | Anzahl der geplanten Tage; Attribut `plan` mit Datum, Titel, Quelle und Portionen, Attribut `groups` mit allen angelegten Gruppen |
| `button.<rezept>_zutaten_auf_die_liste` | Fügt die Zutaten des Rezepts der Einkaufsliste hinzu |

Der Haupt-Sensor trägt alle Rezeptdaten als Attribute:

| Attribut | Inhalt |
| --- | --- |
| `title`, `description`, `author` | Titel, Beschreibung, Autor |
| `source_url`, `site` | Quell-URL und Seitenname |
| `image_url` | Rezeptbild (auch als `entity_picture`) |
| `servings` | Portionen |
| `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes` | Zeiten |
| `ingredients` | Liste der Zutaten, z. B. `["500 g Kartoffeln", …]` |
| `ingredients_structured` | Zutaten mit `amount`, `unit`, `name` (und `group`) für die Portionsumrechnung |
| `ingredient_groups` | Zutaten nach Gruppen (`name`, `items`) |
| `instructions` | Liste der Zubereitungsschritte |
| `tags`, `cuisine`, `category`, `difficulty` | Einordnung |
| `rating`, `rating_count` | Bewertung |
| `nutrition` | Nährwerte, falls vorhanden |
| `updated_at`, `update_error` | Zeitpunkt des letzten erfolgreichen Abrufs und Fehlercode, falls der letzte Abruf scheiterte |

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

## Services

### `recipe_box.import_recipe`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `url` | eins von beiden | Adresse einer Rezeptseite |
| `urls` | eins von beiden | Liste von Rezept-Adressen |

Importiert ein oder mehrere Rezepte und legt sie als Geräte mit Sensoren an.
Bei einer URL enthält die Antwort `title` und `url`, bei mehreren `imported`,
`failed` und `total`. Fehlerhafte Links blockieren die übrigen nicht.

### `recipe_box.remove_recipe`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `url` | eins von beiden | Quelladresse des importierten Rezepts |
| `entity_id` | eins von beiden | Rezept-Sensor |

Entfernt das Rezept samt Gerät und Entitäten aus der Rezeptbox. Es wird auch
nach einem Neustart nicht wiederhergestellt.

### `recipe_box.add_to_shopping_list`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `entity_id` | ja | Rezept-Sensor (auch mehrere möglich) |
| `servings` | nein | Ziel-Portionszahl; die Zutatenmengen werden umgerechnet (Standard: Portionen des Rezepts) |
| `exclude` | nein | Zutatenzeilen, die nicht auf die Liste sollen (z. B. bereits vorhandene) |
| `merge` | nein | Gleiche Zutaten mit vorhandenen Einträgen zusammenrechnen (Standard: `true`) |

Der Service nutzt die eingebaute Einkaufsliste (`shopping_list`). Ist sie nicht
eingerichtet, meldet Home Assistant einen Fehler. Ohne `servings` werden die
Originalmengen übernommen; Rezepte aus älteren Versionen ohne strukturierte
Zutaten werden dabei aus dem Zutatentext umgerechnet. Mit `merge` werden
gleiche Zutaten zusammengeführt, auch mit Einträgen, die schon auf der Liste
stehen – aus zweimal „500 g Kartoffeln“ wird „1 kg Kartoffeln“.

### `recipe_box.add_recipe`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `title` | ja | Name des Rezepts |
| `ingredients` | ja | Zutatenzeilen, eine pro Eintrag |
| `instructions` | nein | Zubereitungsschritte |
| `servings` | nein | Portionen |
| `tags` | nein | Schlagwörter für die Suche |
| `image_url` | nein | Bild zum Rezept |
| `url` | nein | Quelladresse, falls vorhanden |

Legt ein Rezept ohne Quellseite an (Familienrezept, Karte, PDF-Abschrift).
Ohne `url` bekommt es einen internen Schlüssel (`manual://…`); es erscheint wie
ein importiertes Rezept als Gerät mit Sensoren und Button.

### `recipe_box.set_recipe_image`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `image_url` | nein | Adresse des Fotos, z. B. `/api/image/serve/…/original`; leer entfernt das Foto |
| `entity_id` oder `url` | eins von beiden | Rezept-Sensor oder Quelladresse |

Setzt oder entfernt das Foto eines **eigenen** Rezepts (angelegt mit
`add_recipe`). Importierte Rezepte behalten das Bild ihrer Quellseite, weil ein
späteres Aktualisieren es sonst wieder überschreiben würde. Die Karte nutzt
denselben Service für **Foto ändern** und **Foto entfernen** in der
Detailansicht.

### `recipe_box.cleanup_recipe_images`

Entfernt ohne Felder alle Fotos eigener Rezepte, die kein Rezept mehr
verwendet. Antwortet mit `removed`, `kept` und `available` (letzteres ist
`false`, wenn der Bild-Upload in Home Assistant nicht aktiv ist). Die Karte
nutzt denselben Service für **Fotos aufräumen** im Tab **Daten**.

### `recipe_box.refresh_recipe`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `url` | eins von beiden | Quelladresse |
| `entity_id` | eins von beiden | Rezept-Sensor |

Lädt genau ein Rezept neu, ohne auf das Aktualisierungsintervall zu warten.
Bei einem Fehler bleibt der gespeicherte Stand sichtbar und `update_error` am
Sensor nennt den Grund. Eigene Rezepte ohne Quellseite lassen sich nicht
aktualisieren.

### `recipe_box.export_recipes`

Gibt `recipes`, `plan`, `groups` und `missing_images` als JSON zurück (für
Sicherungen oder eigene Skripte). `missing_images` nennt Rezepte, deren eigenes
Foto nicht mehr existiert; die Karte hängt dann beim Sichern einen Hinweis an.
Der Button **Sichern** unter **Daten → Sicherung** nutzt denselben Service.

### `recipe_box.import_recipes`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `recipes` | ja | Rezeptdaten aus einem Export |
| `plan` | nein | Wochenplan aus einem Export |
| `groups` | nein | Gruppen aus einem Export |

Liest eine Sicherung wieder ein und antwortet mit `imported` und `failed`.

### `recipe_box.plan_recipe` / `recipe_box.clear_meal_plan`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `date` | ja / nein | Tag im Format `YYYY-MM-DD` (bei `clear_meal_plan` ohne Datum: ganzer Plan) |
| `entity_id` oder `url` | ja (nur `plan_recipe`) | Rezept, das eingeplant wird |
| `servings` | nein | Portionen für diesen Tag |

Der Plan liegt im Speicher der Integration und ist über
`sensor.rezeptbox_wochenplan` verfügbar; die Karte zeigt die nächsten sieben
Tage und kann die ganze Woche auf die Einkaufsliste übernehmen.

### `recipe_box.set_groups`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `groups` | ja | Alle Gruppen des Rezepts, z. B. `["Familie", "Backen"]`; eine leere Liste entfernt alle |
| `entity_id` oder `url` | eins von beiden | Rezept-Sensor oder Quelladresse |

Setzt die Gruppenzugehörigkeit eines Rezepts neu. Gruppen sind frei wählbare
Namen; sie stehen am Rezept-Sensor im Attribut `groups`, die angelegten Gruppen
auch am Wochenplan-Sensor. Die Karte nutzt denselben Service für **Gruppen** in
der Detailansicht.

### `recipe_box.add_group` / `recipe_box.remove_group`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `group` | ja | Name der Gruppe |

`add_group` legt eine Gruppe an, auch ohne zugewiesene Rezepte – so lässt sie
sich vorbereiten und erscheint sofort als Tab in der Rezeptliste. `remove_group`
löscht die Gruppe und entfernt sie von allen Rezepten. Alle drei antworten mit
der aktualisierten Liste unter `groups`. Die Karte nutzt sie im Tab **Daten**.
Gruppen werden mit exportiert und beim Einlesen einer Sicherung
wiederhergestellt.

### `recipe_box.rename_group`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `group` | ja | Bisheriger Name der Gruppe |
| `name` | ja | Neuer Name der Gruppe |

Benennt eine Gruppe um und lässt alle Zuweisungen bestehen – die Rezepte
müssen nicht einzeln angefasst werden. Gibt es den neuen Namen schon, werden
die Rezepte der alten Gruppe dorthin zusammengeführt. Die Karte nutzt den
Service über das ✎ im Tab **Daten**.

### `recipe_box.move_group`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `group` | ja | Name der Gruppe |
| `direction` | ja | `up` oder `down` |

Verschiebt eine Gruppe einen Platz nach oben oder unten. Die gespeicherte
Reihenfolge bestimmt die Tab-Leiste der Rezeptliste und bleibt über Neustarts
hinweg erhalten; die Karte nutzt den Service über die Pfeile im Tab **Daten**.

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

Alle importierten Rezepte werden unter `.storage/recipe_box.<eintrag>`
gespeichert. Schlägt ein Abruf fehl, bleiben
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
  coordinator.py     Rezeptsammlung, Abruf, Cache, Aktualisierungsintervall
  scraper.py         HTTP: Chefkoch-API und HTML-Abruf
  parser.py          Reine Parser (JSON-LD, Chefkoch, Zeiten, Mengen)
  sensor.py          Rezept-, Portionen- und Wochenplan-Sensor
  button.py          Button „Zutaten auf die Liste“ je Rezept
  shopping.py        Schreiben und Zusammenführen auf der Einkaufsliste
  frontend.py        Auslieferung der Lovelace-Karte
  www/recipe-card.js Lovelace-Karten und Sidebar-Panel
  brand/icon.png     Integrations-Icon (256 px, 512 px als @2x)
tests/               Unit-Tests und Fixtures
```

`parser.py` kommt ohne Home-Assistant-Importe aus und ist damit direkt
testbar:

```bash
python3 -m unittest discover -s tests -v
node tests/card_scaling_test.js
```

Der zweite Befehl prüft die Umrechnung der Lovelace-Karte direkt in Node
(Einheiten, Zutaten im Plural und der unveränderte Originaltext).

Der Einkaufslisten-Service wird zusätzlich mit einem Home-Assistant-Smoke-Test
abgesichert (Portionen mit und ohne `servings`, ein altes Rezept ohne
strukturierte Zutaten sowie pluralisierte Zutatennamen):

```bash
python3 -m venv .venv
.venv/bin/pip install "homeassistant==2025.1.4" "pytest-homeassistant-custom-component==0.13.205"
.venv/bin/python -m pytest tests/ha_smoke -q -o asyncio_mode=auto -p no:cacheprovider
```

## Lizenz

MIT – siehe [LICENSE](LICENSE).
