# Shiftly – Shift Scheduler & Salary Calculator

Static site (HTML + CSS + vanilla JS). No backend. Open `index.html` in a browser (internet needed for the Inter font, Lucide icons and Chart.js CDN).

- **21-day cycle** from 1 Nov 2026 (Day 0, Rest): 1–7 Inter, 8 Rest, 9–12 Morning, 13 Rest, 14–20 Night. Repeats forever, forwards and backwards.
- **All times are IST**, whatever the device time zone. Dates use calendar arithmetic (`Date.UTC`), so DST cannot shift them.
- **Earnings**: cycle table (one 21-day cycle) vs. real calendar-month and year totals computed per actual date.
- **Settings** (start date, rate, currency, shift names/times/colors, theme) persist in `localStorage`.

Files: `index.html`, `style.css`, `script.js`, `README.md`.
