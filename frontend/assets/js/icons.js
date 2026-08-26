/* Minimal inline-SVG icon set — no external font/icon library dependency,
   so it renders identically everywhere. Usage: icon("dashboard", 18) */

const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  factory: '<path d="M3 21V10l5 3V10l5 3V10l5 3v8"/><path d="M3 21h18"/><path d="M7 17v-2M11 17v-2M15 17v-2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.3c2.6.4 4.5 2.3 5 5.7"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  message: '<path d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4.2 3.4a.5.5 0 0 1-.8-.4V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"/>',
  gem: '<path d="M4 8.5 8 3h8l4 5.5-9.5 12z"/><path d="M4 8.5h16M9.5 8.5 12 20.5l2.5-12M8 3l1.5 5.5M16 3l-1.5 5.5"/>',
  medal: '<circle cx="12" cy="14.5" r="6"/><path d="M9.5 9 7 3M14.5 9 17 3"/><path d="m12 12 1.1 2.2 2.4.35-1.75 1.7.4 2.4L12 17.5l-2.15 1.15.4-2.4-1.75-1.7 2.4-.35Z"/>',
  trending: '<path d="M3 17 9.5 10.5 13.5 14.5 21 6"/><path d="M15.5 6H21v5.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5"/>',
  chevronLeft: '<path d="M14.5 5 8 12l6.5 7"/>',
  chevronRight: '<path d="M9.5 5 16 12l-6.5 7"/>',
  x: '<path d="M5 5 19 19M19 5 5 19"/>',
  send: '<path d="M21 3 3 10.5l7 2.5M21 3l-7.5 18-2.5-8M21 3 10.5 12.5"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>',
  star: '<path d="m12 3 2.7 5.9 6.3.6-4.8 4.3 1.4 6.3L12 16.9l-5.6 3.2 1.4-6.3-4.8-4.3 6.3-.6z"/>',
};

function icon(name, size = 18, extraClass = "") {
  const path = ICON_PATHS[name] || "";
  return `<svg class="ui-icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
