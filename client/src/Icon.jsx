import React from 'react';

// One quiet, consistent icon family for the table's controls and status labels.
const shapes = {
  rules: <><rect x="5" y="2" width="14" height="20" rx="1" /><path d="M9 7h6m-6 5h6m-6 5h3" /></>,
  scores: <><path d="M4 12h3v9H4zM10.5 3h3v18h-3zM17 7h3v14h-3z" /></>,
  history: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 5v6h6" /><path d="M12 7v5l3 2" /></>,
  sound: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  muted: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="m16 9 5 6m0-6-5 6" /></>,
  leave: <><path d="M10 4H4v16h6m-1-8h12m-4-4 4 4-4 4" /></>,
  chat: <path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  pause: <><path d="M8 5v14m8-14v14" /></>,
  play: <path d="m8 4 12 8-12 8V4Z" />,
  check: <path d="m4 12 5 5L20 6" />,
  crown: <><path d="m3 6 5 4 4-6 4 6 5-4-2 11H5L3 6Zm3 14h12" /></>,
  buy: <><rect x="5" y="7" width="13" height="14" rx="2" /><path d="M9 3h10a2 2 0 0 1 2 2v11m-9-5v6m-3-3h6" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></>,
  alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  down: <path d="M12 3v14m-5-5 5 5 5-5M4 20h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <><path d="m3 3 18 9-18 9 3-9-3-9Z" /><path d="M6 12h15" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.3 7a8 8 0 0 1 13-2L20 7M4 17l1.7 2a8 8 0 0 0 13-2" /></>,
  watch: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
};

export default function Icon({ name, size = 18, className = '', label }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`ui-icon ${className}`}
    aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false">
    {shapes[name] || shapes.check}
  </svg>;
}
