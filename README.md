# Our Travels — Love for Mena

A little trip planner for the two of us. Make a trip, plan each day, pack
together, and keep an eye on the budget — all on your own device. Part of the
**Love for Mena** collection.

**Live:** https://menaammarpro.github.io/love-travel/

## What it does

- **Trips** with a name, destination and start/end dates
- A **countdown** to the next trip (and "Day 3 of 5" while you're away)
- An **itinerary per day** — time, activity and place, grouped by date
- A **packing checklist** by category with a progress bar and "reset packed"
- A **budget estimate** by category, with a total and a rough per-day figure
- **Print** the selected trip, or **export/import** every trip as JSON
- Installable PWA with offline support

## How it works

Everything is kept in `localStorage` under `mena-travel` on that device only —
no tracking, no network calls, no accounts. Export writes a small JSON file you
can keep safe; importing merges trips by id and skips duplicates.

The pure logic (date maths, trip status/countdown, sorting, itinerary grouping,
packing, budget and export/import) is exposed on `window.MenaTravel` and covered
by `test/harness.js`.

## Files

- `index.html` — the page
- `css/theme.css` — shared love-theme (copied from `_love-theme/`)
- `css/app.css` — page-specific styles
- `js/theme-main.js`, `js/effects.js` — shared behaviour/effects
- `js/app.js` — travel logic
- `manifest.webmanifest`, `sw.js` — PWA
- `assets/` — favicon and icons
- `test/harness.js` — dependency-free Node tests (`node test/harness.js`)

## Run locally

```powershell
py -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

Static site, deployed with GitHub Pages from `main`.

## License

Creative Commons BY-NC-ND 4.0 — see [`LICENSE`](LICENSE).
© 2026 Ammar (MenaAmmarPro). Made with care for Mena.
