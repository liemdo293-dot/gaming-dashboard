# Gaming Dashboard – Einrichtung

Das Dashboard ist eine Web-App. Sie läuft auf dem Tablet im Vollbild wie eine normale App und braucht keinen Play Store. Die Einrichtung dauert etwa 20 Minuten und passiert einmalig, das meiste davon bequem am PC.

**Was du brauchst:** ein kostenloses GitHub-Konto, Spotify Premium, ein Google-Konto (für den Kalender) und Chrome auf dem Tablet.

---

## Schritt 1 · App ins Internet stellen (GitHub Pages, kostenlos)

1. Auf [github.com](https://github.com) anmelden oder ein kostenloses Konto anlegen.
2. Oben rechts auf **+** → **New repository**.
   - Name: `gaming-dashboard`
   - **Public** auswählen (nur dann ist GitHub Pages kostenlos; im Code stehen keine Passwörter, deine Einstellungen bleiben auf deinen Geräten)
   - **Create repository**
3. Auf der neuen Seite den Link **uploading an existing file** anklicken.
4. Die ZIP-Datei entpacken und **den Inhalt** des Ordners (also `index.html`, `css`, `js`, `icons` usw.) ins Browserfenster ziehen, nicht den Ordner selbst. Unten auf **Commit changes**.
5. Im Repository: **Settings** → links **Pages** → bei *Branch* `main` und `/ (root)` wählen → **Save**.
6. Nach 1–2 Minuten ist die App online unter:
   `https://DEIN-GITHUB-NAME.github.io/gaming-dashboard/`

Diese Adresse brauchst du gleich mehrmals.

---

## Schritt 2 · Auf dem Tablet installieren

1. Auf dem Redmi Pad Pro **Chrome** öffnen (nicht den Xiaomi-Browser) und die Adresse aus Schritt 1 eingeben.
2. Menü **⋮** → **App installieren** (oder **Zum Startbildschirm hinzufügen**).
3. Ab jetzt die App über das neue Symbol auf dem Startbildschirm starten. Sie öffnet sich im Vollbild und im Querformat.
4. Wenn gefragt wird, ob die App deinen Standort nutzen darf: **Zulassen** (für das Wetter). Alternativ kannst du später in den Einstellungen einen Ort per Hand wählen.

**Damit das Tablet nicht einschläft:** Die App hält den Bildschirm an, solange sie offen ist. Xiaomi bremst Apps aber gern im Hintergrund. Unter *Einstellungen → Apps → Chrome → Akku-Sparmodus* auf **Keine Einschränkungen** stellen. Das Tablet am besten am Ladekabel lassen.

---

## Schritt 3 · Spotify-App anlegen (einmalig)

Spotify erlaubt eigene Steuer-Apps nur über eine kleine „Developer-App“. Das ist kostenlos, setzt aber Spotify Premium voraus.

1. Am PC auf [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) mit deinem Spotify-Konto anmelden und die Nutzungsbedingungen bestätigen.
2. **Create app**:
   - App name: `Gaming Dashboard`
   - App description: `Mein Tablet-Dashboard`
   - **Redirect URI:** genau deine Adresse aus Schritt 1, **mit** Schrägstrich am Ende, z. B. `https://DEIN-GITHUB-NAME.github.io/gaming-dashboard/` → **Add**
   - Bei *Which API/SDKs are you planning to use?* **Web API** anhaken
   - Bedingungen anhaken → **Save**
3. In der App auf **Settings** gehen und die **Client ID** kopieren (32 Zeichen). Das Client Secret brauchst du **nicht**.
4. Falls später beim Login „User not registered“ kommt: in der App unter **User Management** deinen eigenen Namen und die E-Mail deines Spotify-Kontos eintragen.

---

## Schritt 4 · Spotify im Dashboard verbinden

Am bequemsten am PC:

1. Die Adresse aus Schritt 1 im PC-Browser öffnen.
2. Zahnrad (unten rechts bzw. oben in der Mitte) → **Spotify**.
3. Client-ID einfügen. Darunter steht die Redirect-URI; sie muss genau mit der aus Schritt 3 übereinstimmen.
4. **Mit Spotify verbinden** → bei Spotify **Zustimmen**. Danach landest du wieder im Dashboard.

---

## Schritt 5 · Kalender verbinden (Google Kalender)

Browser dürfen Kalenderdaten aus Sicherheitsgründen nicht direkt abholen. Deshalb gibt es ein kleines Skript, das in **deinem eigenen** Google-Konto läuft und deine Termine nur mit einem Geheimwort herausgibt.

1. Am PC [script.google.com](https://script.google.com) öffnen → **Neues Projekt**.
2. Den vorhandenen Code löschen und den Inhalt der Datei `apps-script/Kalender.gs` aus der ZIP einfügen.
3. Oben im Code bei `GEHEIMWORT` ein eigenes, langes Wort eintragen (nur Buchstaben und Zahlen, z. B. `zock7Kq29mXv`). Speichern (Disketten-Symbol).
4. **Bereitstellen** → **Neue Bereitstellung** → Zahnrad bei *Typ auswählen* → **Web-App**:
   - Ausführen als: **Ich**
   - Zugriff: **Jeder** (ohne Geheimwort bekommt trotzdem niemand Termine)
   - **Bereitstellen**
5. Google fragt nach Berechtigung → **Zugriff autorisieren** → dein Konto wählen. Bei „Google hat diese App nicht überprüft“ auf **Erweitert** → **Zu … wechseln** tippen. Das ist dein eigenes Skript.
6. Die **Web-App-URL** kopieren (endet auf `/exec`) und `?token=` plus dein Geheimwort anhängen, z. B.:
   `https://script.google.com/macros/s/AKfy…/exec?token=zock7Kq29mXv`
7. Im Dashboard: Zahnrad → **Kalender** → Link einfügen → **Speichern und testen**.

Angezeigt werden alle Kalender, die in Google Kalender eingeblendet sind. Andere Kalender (z. B. Outlook) kannst du im Skript bei `ICAL_LINKS` als iCal-Link ergänzen. Danach musst du die Bereitstellung aktualisieren: **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Version: Neu**.

---

## Schritt 6 · Einstellungen aufs Tablet holen

1. Am PC: Zahnrad → **Sync mit PC**. Dort erscheint ein QR-Code.
2. Mit der Kamera des Tablets scannen → der Link öffnet sich in Chrome → **Übernehmen**.
3. Die Dashboard-App vom Startbildschirm öffnen → Zahnrad → **Spotify** → **Mit Spotify verbinden** (der Login wird aus Sicherheitsgründen pro Gerät einmal gemacht).

Fertig.

---

## Bedienung

- **Layout wechseln:** auf dem Dashboard nach links oder rechts wischen, oder den Layout-Knopf neben dem Zahnrad antippen.
- **Cover antippen:** Play/Pause.
- **Gerät-Knopf:** auswählen, wo Spotify spielen soll (PC, Handy, Box …).
- **Einstellungen → Ansicht:** Akzentfarbe, Albumcover oder Plattenspieler, Sekunden, Hintergrund-Licht passend zum Cover.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Spotify meldet „INVALID_CLIENT: Invalid redirect URI“ | Die Redirect-URI in der Spotify-App muss Zeichen für Zeichen der im Dashboard angezeigten entsprechen, inklusive `/` am Ende. |
| „User not registered in the Developer Dashboard“ | Schritt 3, Punkt 4: dich selbst unter *User Management* eintragen. |
| „Kein aktives Gerät“ | Spotify am PC öffnen und kurz etwas abspielen, dann im Dashboard das Gerät wählen. |
| Login hängt in der installierten App | Die Adresse einmal im normalen Chrome-Tab öffnen und dort verbinden. Die App übernimmt die Anmeldung. |
| Kalender: „lässt sich nicht abrufen“ | Beim Bereitstellen *Zugriff: Jeder* wählen und den Link mit `?token=…` verwenden. |
| Kalender: „Falsches oder fehlendes Geheimwort“ | Geheimwort im Link und im Skript vergleichen. Nach Änderungen am Skript neu bereitstellen. |
| Wetter zeigt „Kein Standort“ | Standort für Chrome erlauben oder unter *Wetter → Ort wählen* eine Stadt suchen. |
| Bildschirm geht trotzdem aus | Akku-Sparmodus für Chrome ausschalten (Schritt 2) und Tablet ans Ladekabel. |

## Updates

Wenn du neue Dateien bekommst: in GitHub im Repository auf **Add file → Upload files**, die geänderten Dateien hineinziehen und **Commit changes**. Das Tablet lädt die neue Version beim nächsten Öffnen automatisch.

## Datenschutz

Alle Einstellungen und der Spotify-Login liegen nur im Browser deiner Geräte. Es gibt keinen eigenen Server. Die App spricht direkt mit Spotify, Open-Meteo (Wetter), BigDataCloud (Ortsname zum GPS-Standort) und deinem eigenen Google-Skript.
