/** Small decorative icons; hidden from screen readers because the text beside them says the same thing. */
const base = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "icon",
} as const;

export function PinIcon() {
  return (
    <svg {...base}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function NavigationIcon() {
  return (
    <svg {...base}>
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function BagIcon() {
  return <svg {...base}><path d="M5 7h14l1 14H4L5 7Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
}
export function ReceiptIcon() {
  return <svg {...base}><path d="M5 3l2 1 2-1 3 1 3-1 2 1 2-1v18l-2-1-2 1-3-1-3 1-2-1-2 1V3Z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
}
export function TruckIcon() {
  return <svg {...base}><path d="M3 5h11v12H3V5ZM14 9h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
}
export function SettingsIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
}
export function LogoutIcon() {
  return <svg {...base}><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></svg>;
}
