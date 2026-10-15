/**
 * Kalender-Brücke für das Gaming Dashboard.
 * Läuft in DEINEM Google-Konto (script.google.com) und gibt deine Termine
 * als JSON an das Dashboard weiter. Niemand sonst kommt ohne das Geheimwort dran.
 *
 * Einrichtung: siehe ANLEITUNG.md, Schritt 5.
 */

// 1) Denk dir ein langes Geheimwort aus (nur Buchstaben und Zahlen) und trag es hier ein:
const GEHEIMWORT = 'HIER-DEIN-GEHEIMWORT';

// 2) Wie viele Tage im Voraus sollen geladen werden?
const TAGE = 14;

// 3) Optional: weitere Kalender als iCal-Link (z. B. Outlook, Schule, Verein).
//    Beispiel: const ICAL_LINKS = ['https://outlook.office365.com/owa/calendar/.../calendar.ics'];
const ICAL_LINKS = [];

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== GEHEIMWORT || GEHEIMWORT === 'HIER-DEIN-GEHEIMWORT') {
    return antwort({ error: 'Falsches oder fehlendes Geheimwort' });
  }

  const jetzt = new Date();
  const start = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 7);
  const ende = new Date(jetzt.getTime() + TAGE * 24 * 60 * 60 * 1000);
  const zone = Session.getScriptTimeZone();
  const termine = [];

  CalendarApp.getAllCalendars().forEach(function (kal) {
    if (kal.isHidden() || !kal.isSelected()) return;
    kal.getEvents(start, ende).forEach(function (ev) {
      if (ev.isAllDayEvent()) {
        termine.push({
          title: ev.getTitle(),
          start: Utilities.formatDate(ev.getAllDayStartDate(), zone, 'yyyy-MM-dd'),
          end: Utilities.formatDate(ev.getAllDayEndDate(), zone, 'yyyy-MM-dd'),
          allDay: true,
        });
      } else {
        termine.push({
          title: ev.getTitle(),
          start: ev.getStartTime().toISOString(),
          end: ev.getEndTime().toISOString(),
          allDay: false,
        });
      }
    });
  });

  const ical = [];
  ICAL_LINKS.forEach(function (url) {
    try { ical.push(UrlFetchApp.fetch(url).getContentText()); } catch (err) { /* Link nicht erreichbar */ }
  });

  return antwort({ events: termine, ics: ical });
}

function antwort(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
