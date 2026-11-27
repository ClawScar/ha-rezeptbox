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
- **Suche und Filter** in der Rezeptliste: Textsuche, Tags, Zeitfilter, Sortierung und „Was kochen?“ für einen Zufallsvorschlag, der Favoriten bevorzugt und zuletzt Vorgeschlagenes überspringt
- **Gruppen**: Gruppen wie „Familie“ oder „Backen“ im Tab **Daten** anlegen, sortieren, umbenennen und löschen, Rezepte in der Detailansicht zuweisen und in der Rezeptliste über einen Tab je Gruppe direkt wechseln
- **Koch-Sitzung bleibt erhalten**: abgehakte Zutaten und gewählte Portionen überleben Neuladen und Handy-Sperre
- **Eigene Rezepte** ohne Link anlegen (Familienrezepte, Karten) – direkt in der Liste oder über den Service, auf Wunsch mit Foto von der Rezeptkarte, das sich später in der Detailansicht ändern oder entfernen lässt; nicht mehr benötigte Fotos löscht die Rezeptbox dabei automatisch
- **Tabs bleiben stehen**: „Rezepte“, „Wochenplan“ und „Daten“ kleben beim Scrollen oben am Rand, solange die Karte sichtbar ist
- **Foto-Scanner** für gedruckte Rezeptkarten: mehrere Seiten fotografieren, Text mit Tesseract direkt im Browser erkennen lassen und als Rezeptvorschlag im Formular prüfen – ohne KI-Dienst, ohne Internet, ohne Serverpakete; auf Wunsch liest stattdessen die in Home Assistant eingerichtete KI (z. B. Gemini) die Fotos und erkennt dann auch Handschrift; das erste Foto wird das Rezeptfoto
- **Rezepte bearbeiten**: Titel, Portionen, Zutaten, Zubereitung, Tags und Foto eines gespeicherten Rezepts über **Bearbeiten** in der Detailansicht oder den Service `recipe_box.update_recipe` ändern
- **Wochenplan** zum Blättern: sieben Tage ab heute, eine Woche vor und zurück, Rezeptbilder, Heute-Markierung, geplante Tage direkt an der Rezeptzeile, Reste-/Auswärts-Tage ohne Rezept und Einkauf für die sichtbare Woche
- **Sicherung**: alle Rezepte und den Wochenplan per Speichern-Dialog als JSON sichern und wieder einlesen
- **Mehr pro Rezept**: Nährwerte, Druckansicht, Schritt-Timer („25 Minuten“ antippen) und ein Aktualisieren-Button mit sichtbarem Fehlerstatus
- **Button-Entität** „Zutaten auf die Liste“ je Rezept für Dashboard und Automationen

## Sprache der Oberfläche

Karten und Sidebar-Seite richten sich nach der Sprache von Home Assistant:
Läuft Home Assistant auf Englisch (`language` beginnt mit „en“, also auch
`en-GB` oder `en_US`), zeigen sie englische Beschriftungen – Tabs, Buttons,
Platzhalter, Meldungen und Dialoge. Für jede andere Sprache bleiben die
deutschen Texte. Einrichtung, Optionen und Services sind unabhängig davon über
`translations/en.json` und `translations/de.json` übersetzt. Rezeptinhalte
selbst bleiben in der Sprache der Quellseite.

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
**Konfigurieren** am Eintrag ändern. Dort steht auch die **Ziel-Einkaufsliste**:
eine beliebige To-do-Liste aus Home Assistant, zum Beispiel die
Alexa-Einkaufsliste aus der Integration **Alexa Devices**. Bleibt das Feld leer,
schreiben Button, Karte und Service wie bisher in die
Home-Assistant-Einkaufsliste. Dort lässt sich außerdem ein **Zielordner für
Sicherungen** angeben: ein Ordner im
Home-Assistant-Konfigurationsordner, zum Beispiel `backups`. Er gilt für den
Service `recipe_box.export_recipes` mit `write_backup: true`. Der Button
**Sichern** in der Karte fragt stattdessen in einem Dialog, ob die JSON-Datei
über den Speichern-Dialog des Browsers abgelegt, auf dem Handy geteilt oder
heruntergeladen werden soll.

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

Auf dem Handy (und wenn die Seitenleiste dauerhaft versteckt ist) steht oben die
Kopfzeile **Rezeptbox** mit dem Menü-Knopf, der die
Home-Assistant-Seitenleiste öffnet – am Desktop übernimmt das die App selbst.
Tab und geöffnetes Rezept stehen in der
Adresse (`/rezeptbox/plan`, `/rezeptbox/recipe/sensor.lasagne`): Die
Zurück-Taste des Handys geht dadurch erst einen Schritt in der Rezeptbox zurück
und verlässt die Seite erst danach. Ein Lesezeichen auf einen dieser Pfade
öffnet direkt den passenden Tab oder das Rezept.

Die Karten bleiben trotzdem verfügbar, wenn du die Liste in ein bestehendes
Dashboard einbauen willst.

## Dashboard-Karten

Die Karten werden beim Start automatisch als JavaScript-Modul geladen, mit der
Version in der URL (`/recipe_box/recipe-card.js?v=…`). So holt der Browser nach
einem Update sicher die neue Datei. Falls die Karten in deiner Installation
nicht auftauchen, trage die Ressource einmal manuell unter **Einstellungen →
Dashboards → Ressourcen** ein – am besten mit derselben Versionskennung:

```yaml
url: /recipe_box/recipe-card.js?v=2.9.1-beta.1
type: module
```

Eine ältere manuelle Ressource ohne `?v=` kann noch aus dem Cache laufen und
Änderungen verdecken; dann diese Ressource löschen, Home Assistant neu starten
und in der App zusätzlich den Frontend-Cache leeren. Welche Kartenversion
aktiv ist, steht unter **Daten → Sicherung** („Karte 2.9.1-beta.1“).

### Rezeptliste mit Detailansicht

Zeigt alle importierten Rezepte alphabetisch als Liste. Ein Klick öffnet das
gewählte Rezept in derselben Karte, der Zurück-Pfeil führt wieder zur Liste.

```yaml
type: custom:recipe-box-list
title: Unsere Rezepte   # optional
# entities:             # optional, sonst alle Rezepte
#   - sensor.lasagne
#   - sensor.curry
show_image: true        # Vorschaubilder in Liste, Detailansicht und Wochenplan
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
Sortierung filtern sie; **Nur Favoriten** blendet alle Rezepte aus, die nicht
mit dem Stern markiert sind, und macht die Favoriten so zur eigenen Sammlung –
auch „Was kochen?“ zieht dann nur aus dieser Auswahl. **Was kochen?** öffnet ein
zufälliges Rezept aus der aktuellen Auswahl. Favoriten (★ in der Zeile oder in der Detailansicht) werden
dabei dreifach gewichtet, die letzten drei Vorschläge übersprungen. Die
Favoriten speichert die Integration, nicht der Browser: Sie gelten damit auf
allen Geräten und für alle Benutzer der Installation. Unter den
Angaben eines Rezepts steht, für welche Tage es schon eingeplant ist
(„Mi 26 · Fr 28“); das Kalender-Symbol trägt dann einen Punkt. Rechts neben
jedem Eintrag entfernt der Papierkorb das Rezept – der erste Klick fragt mit
**Löschen?** nach, der zweite löscht endgültig. In der Detailansicht sitzt
derselbe Button oben rechts.

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

Unter **Sicherung** lädt **Sichern** die JSON-Datei und öffnet einen Dialog:
**Speichern…** zeigt den Speichern-Dialog des Browsers, in dem sich Dateiname
und Ordner frei wählen lassen, **Teilen…** öffnet auf dem Handy das
Teilen-Menü, und **Herunterladen** legt die Datei im Download-Ordner ab.
**Laden** daneben liest eine solche Sicherung
wieder ein. Unter
**Eigenes Rezept** entsteht ein Rezept mit Titel, Portionen, Zutaten, Schritten
und Tags. Über **Bearbeiten** in der Detailansicht eines gespeicherten Rezepts
öffnet sich dasselbe Formular mit den vorhandenen Werten; **Rezept
aktualisieren** speichert die Korrektur über `recipe_box.update_recipe`.

Für gedruckte Rezeptkarten gibt es im Formular den **Foto-Scanner**: mit
**Foto hinzufügen** nimmt ein Bild pro Auswahl auf – Kamera oder Galerie, je
nachdem, was der Datei-Dialog des Geräts anbietet; für jede weitere Seite wird
erneut getippt. Die gewählten Seiten erscheinen mit Vorschaubild in der Liste.
Ein Feld mit Mehrfachauswahl oder Foto-Filter liefert auf Android keine Dateien,
deshalb bewusst ein einfaches Dateifeld. Mit **Text erkennen** werden sie der
Reihe nach eingelesen und das Ergebnis im Formular geprüft. Abschnitte wie „Zutaten“
und „Zubereitung“ dürfen sich auf späteren Seiten wiederholen; sie werden
fortgesetzt statt neu begonnen. Das erste Foto wird das Rezeptfoto. Die
Texterkennung läuft mit Tesseract und dem deutschen Sprachmodell direkt im
Browser – rund 5,5 MB liegen dafür unter `www/ocr/`. Solange das Häkchen
**Mit KI lesen** aus ist, geht kein Foto und kein Text an einen Dienst, und eine
KI ist nicht beteiligt. Vor der Erkennung wird
jede Seite auf etwa 2000 Pixel lange Kante gebracht (kleine Fotos bis zur
doppelten Größe), in Graustufen umgewandelt, im Kontrast angehoben und an der
Schwelle zwischen Papier und Druck in Schwarz-Weiß getrennt. Bleibt eine Seite
dabei ohne Text (etwa bei harten Schatten), liest der Scanner sie zusätzlich in
Graustufen und nimmt das bessere Ergebnis. Findet der Durchlauf keinen Titel oder
nur Buchstabensalat (etwa „DEE u EEE ER“), wird der obere Bereich des ersten
Fotos noch einmal mit stärkerer Vergrößerung und Schwarz-Weiß gelesen;
übernommen wird der besser lesbare der beiden Titel. Zutaten und Zubereitung
liest der Scanner anschließend als eigene Zonen: Die gedruckten Überschriften
werden in den Wortkästen gesucht, und nur der Bereich dazwischen wird noch
einmal größer gelesen; Zeilen, bei denen sich die Erkennung unsicher ist,
bleiben dabei draußen. So landen Illustration und Nachbarabschnitt nicht in den
Zutaten. Reste der Zeichnung werden entfernt (einzelne Großbuchstaben mitten im
Satz, Symbole am Zeilenrand, Bruchstücke ohne Menge), zwei in einer Zeile
gelesene Zutaten werden an der zweiten Menge getrennt, und eine Ziffer hinter
dem Titel gilt als Verzierung. Eine zweite Seite ohne eigene Überschrift gilt als Fortsetzung der
Zubereitung; ein Absatz mit mehreren Sätzen wird in einzelne Schritte zerlegt
und in Seitenreihenfolge als nummerierte Liste angezeigt; im Formular steht
zwischen zwei Schritten eine Leerzeile, damit sie beim Prüfen getrennt bleiben. Handschrift erkennt der
Scanner nicht; bei Reflexen oder schräger Aufnahme steigt die Fehlerquote, ein
gerades, gut beleuchtetes Foto liefert die besten Ergebnisse. Bei älteren
Browsern ohne WebAssembly-SIMD erscheint eine Fehlermeldung.

Wer in Home Assistant bereits eine KI eingerichtet hat – etwa Google Gemini,
OpenAI oder ein lokales Modell über Ollama –, kann statt Tesseract sie lesen
lassen: Im Formular erscheint dann das Häkchen **Mit KI lesen**. Es ist nur
sichtbar, wenn Home Assistant eine KI-Aufgabe mit Bild-Unterstützung kennt (AI
Task, ab Home Assistant 2025.8; ältere Versionen scannen unverändert mit
Tesseract). Die Rezeptbox speichert dabei keinen Schlüssel und spricht auch
nicht selbst mit einem Anbieter: Sie übergibt die Fotos als Anhang an die
KI-Aufgabe, und die dort eingerichtete KI entscheidet, wohin sie gehen. Ein
Abo ist dafür nicht nötig, solange der kostenlose Tarif reicht – für ein
Rezept genügen wenige Bilder, auch wenn Googles kostenloser Tarif nur wenige
Anfragen pro Tag erlaubt. Der Vorteil sind Handschrift, schräge Fotos und
saubere Abschnitte; dafür gehen die Fotos an den Anbieter, und ein lokales
Modell braucht je nach Hardware etwas länger. Auch hier steht nichts ungeprüft
im Rezept: Titel, Zutaten und Schritte landen zuerst im Formular.

Über **Foto hinzufügen** lässt sich ein Bild der Rezeptkarte auswählen
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

Beim Löschen eines Rezepts und beim Ersetzen oder Entfernen eines Fotos löscht
die Rezeptbox das nicht mehr benötigte Bild sofort mit. Sie fasst dabei nur
Bilder an, die sie selbst hochgeladen hat (erkennbar am Namenspräfix
`rezeptbox-` und an einer internen Liste); Profilfotos und Bilder anderer
Integrationen bleiben unangetastet. Fotos aus Versionen vor 2.4.2, deren
Rezept längst gelöscht wurde, lassen sich nicht sicher zuordnen und bleiben
deshalb liegen; für solche Reste gibt es den Service
`recipe_box.cleanup_recipe_images`. Solange ein Foto hochlädt, zeigt
**Rezept speichern** einen Kreisel und nimmt keine weiteren Klicks an.

Sicherungen bleiben nach dem Aufräumen einlesbar. Fotos von Rezepten, die beim
Sichern noch existieren, werden nie gelöscht; nur Sicherungen von zuvor
gelöschten Rezepten verlieren deren Bilder. Verweist ein Rezept auf ein nicht
mehr vorhandenes Foto, warnt die Karte beim Sichern mit „Achtung: fehlende
Fotos bei …“.

Im Tab **Wochenplan** lässt sich jede Woche füllen: die sieben Tage ab heute,
mit ‹ und › eine Woche vor und zurück (höchstens bis zum ältesten geplanten Tag)
und **Heute** zurück zur aktuellen Woche. Die Kopfzeile nennt den Zeitraum und
wie viele der sieben Tage geplant sind. Jede Zeile zeigt das Foto des geplanten
Rezepts; ohne Foto steht dort ein Platzhalter, leere Tage bleiben gestrichelt.
Die sieben Tage stehen immer untereinander – auch auf breiten Bildschirmen, wo jede Zeile nur einen Rahmen bekommt.

Im Auswahlfeld eines Tages stehen neben den Rezepten auch **Reste** und
**Auswärts** für Tage ohne Rezept. Sie zählen als geplant, tauchen aber nicht
auf der Einkaufsliste auf. **Woche auf die Einkaufsliste** übernimmt nur die
Rezepte der sichtbaren Woche. Vergangene Tage bleiben im Plan, bis sie über
**Aufräumen** in der Hinweiszeile entfernt werden – auf die Einkaufsliste
kommen sie nie.

Schneller geht es aus der Rezeptliste: Das Kalender-Symbol in einer Zeile
klappt die nächsten sieben Tage auf. Ein Tipp plant das Rezept für diesen Tag;
Tage, an denen schon ein Rezept steht, sind markiert und nennen beim Antippen,
was ersetzt wird. Tage mit diesem Rezept sind gefüllt.

Die Detailansicht bleibt beim Rezept: Zutaten, Zubereitung und der Stern
**Favorit** stehen dort ohne eigenen Einplanen-Block, damit das Rezept den Platz
behält. Geplant wird über das Kalender-Symbol in der Rezeptliste oder im Tab
**Wochenplan**. Der Stern markiert das Rezept für „Was kochen?“. Die Markierung
liegt im Speicher der Integration und ist damit auf allen Geräten und für alle
Benutzer sichtbar; sie lässt sich auch per Service setzen.

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
| `sensor.rezeptbox_wochenplan` | Anzahl der geplanten Tage; Attribut `plan` mit Datum, Titel, Quelle und Portionen, Attribut `groups` mit allen angelegten Gruppen und `favorites` mit den Quell-URLs aller Favoriten |
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
| `favorite` | `true`, wenn das Rezept als Favorit markiert ist |
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

Ohne Ziel-Einkaufsliste nutzt der Service die eingebaute Einkaufsliste
(`shopping_list`); ist sie nicht eingerichtet, meldet Home Assistant einen
Fehler. Ohne `servings` werden die Originalmengen übernommen; Rezepte aus
älteren Versionen ohne strukturierte Zutaten werden dabei aus dem Zutatentext
umgerechnet. Mit `merge` werden gleiche Zutaten zusammengeführt, auch mit
Einträgen, die schon auf der Liste stehen – aus zweimal „500 g Kartoffeln“
wird „1 kg Kartoffeln“.

Ist in den Optionen eine Ziel-Einkaufsliste gewählt, gehen die Zutaten
stattdessen in diese To-do-Liste. Für die Alexa-Einkaufsliste braucht es die
Integration **Alexa Devices** (Amazon-Konto mit 2FA über eine
Authenticator-App); sie stellt die Liste als `todo`-Entität bereit, und der
Service schreibt direkt hinein. Das Zusammenführen funktioniert dort genauso:
passende Einträge werden umbenannt, abgehakte Einträge bleiben unberührt und
werden nicht erneut zusammengerechnet.

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

### `recipe_box.update_recipe`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `entity_id` oder `url` | eins von beiden | Rezept-Sensor oder Quelladresse |
| `title` | nein | Neuer Name |
| `ingredients` | nein | Alle Zutatenzeilen; ersetzt die bisherige Liste |
| `instructions` | nein | Alle Zubereitungsschritte; ersetzt die bisherige Liste |
| `servings` | nein | Portionen |
| `tags` | nein | Schlagwörter für die Suche |
| `image_url` | nein | Neues Foto |

Ändert ein gespeichertes Rezept, ohne es neu anzulegen; weggelassene Felder
bleiben, wie sie sind. Zutaten werden dabei neu strukturiert, damit Portionen
und Einkaufsliste weiter funktionieren. Ein späteres **Aktualisieren** eines
importierten Rezepts holt die Quellseite erneut und ersetzt die Änderungen.
Die Karte nutzt denselben Service für **Bearbeiten** in der Detailansicht.

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
ruft ihn nicht auf: beim Löschen und Ersetzen räumt die Integration
automatisch auf. Der Service ist für Reste und Automationen gedacht.

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

Gibt `recipes`, `plan`, `groups`, `favorites` und `missing_images` als JSON zurück (für
Sicherungen oder eigene Skripte). `missing_images` nennt Rezepte, deren eigenes
Foto nicht mehr existiert; die Karte hängt dann beim Sichern einen Hinweis an.
Mit `write_backup: true` schreibt der Service die Datei zusätzlich in den
eingestellten Zielordner und liefert `path` (vollständiger Pfad) und
`filename` mit. Der Button **Sichern** unter **Daten → Sicherung** nutzt
denselben Service ohne dieses Flag und bietet danach Speichern, Teilen oder
Herunterladen an.

### `recipe_box.import_recipes`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `recipes` | ja | Rezeptdaten aus einem Export |
| `plan` | nein | Wochenplan aus einem Export |
| `groups` | nein | Gruppen aus einem Export |
| `favorites` | nein | Favoriten (Quell-URLs) aus einem Export |

Liest eine Sicherung wieder ein und antwortet mit `imported` und `failed`.
Favoriten aus der Sicherung werden nur übernommen, wenn das Rezept vorhanden
ist.

### `recipe_box.plan_recipe` / `recipe_box.clear_meal_plan`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `date` | ja / nein | Tag im Format `YYYY-MM-DD` (bei `clear_meal_plan` ohne Datum: ganzer Plan) |
| `entity_id` oder `url` | eins von beiden | Rezept, das eingeplant wird |
| `label` | nein | Freier Tag ohne Rezept, z. B. `Reste` oder `Auswärts` (statt `entity_id`/`url`) |
| `servings` | nein | Portionen für diesen Tag |

Der Plan liegt im Speicher der Integration und ist über
`sensor.rezeptbox_wochenplan` verfügbar; die Karte zeigt sieben Tage ab heute
und kann die sichtbare Woche auf die Einkaufsliste übernehmen.

### `recipe_box.set_favorite`

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `entity_id` oder `url` | eins von beiden | Rezept-Sensor oder Quelladresse |
| `favorite` | nein | `true` markiert das Rezept, `false` entfernt die Markierung; ohne Feld wird umgeschaltet |

Setzt oder entfernt die Favoritenmarkierung. Sie liegt im Speicher der
Integration und gilt damit für alle Benutzer und Geräte; „Was kochen?“ gewichtet
markierte Rezepte dreifach. Die Karte nutzt denselben Service für den Stern in
der Rezeptzeile und in der Detailansicht. Die Antwort enthält `title`, `url`
und den neuen Stand `favorite`.

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
