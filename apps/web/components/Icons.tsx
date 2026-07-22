/** Set mínimo de iconos inline (sin dependencia de icon-font). */
type IconProps = { className?: string };

const make =
  (path: React.ReactNode, fill = false) =>
  ({ className = "w-5 h-5" }: IconProps) =>
    (
      <svg
        viewBox="0 0 24 24"
        fill={fill ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );

export const IconSend = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconMic = make(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>,
);
export const IconClip = make(
  <path d="M21 8l-9 9a4 4 0 0 1-6-6l9-9a2.5 2.5 0 0 1 4 4l-9 9" />,
);
export const IconLogout = make(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>,
);
export const IconCheck = make(<path d="M20 6L9 17l-5-5" />);
export const IconCopy = make(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
);
export const IconChat = make(
  <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
);
export const IconKey = make(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2L21 2M17 6l2 2M15 8l1.5 1.5" />
  </>,
);
export const IconTerminal = make(<path d="M4 5h16v14H4zM8 10l3 2-3 2M13 14h3" />);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </>,
);
export const IconShield = make(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />);
export const IconDownload = make(
  <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />,
);
export const IconPlay = make(<path d="M6 4l14 8-14 8z" />, true);
export const IconPause = make(
  <>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </>,
  true,
);
export const IconTrash = make(
  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />,
);
export const IconUsers = make(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
);

export const IconQr = make(
  <>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
    <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
  </>,
);

export const IconImage = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5-6 6-3-3-4 4" />
  </>,
);
