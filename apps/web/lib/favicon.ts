/**
 * Favicon dinámico: el escudo del logo de Aegis, cuyo color refleja el estado de
 * seguridad de la sesión.
 *   - seguro      → lima (#D7FF00), igual que el logo
 *   - poco seguro → ámbar (#fbbf24)
 *
 * Sustituye en runtime el <link rel="icon"> que Next genera desde app/icon.svg.
 */

function shieldSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 10 160 240"><g fill="${color}" stroke="${color}"><path d="M90 40 L160 20 L230 40 L230 120 C230 180 190 220 160 240 C130 220 90 180 90 120 Z" fill="none" stroke-width="12"/><circle cx="160" cy="120" r="42" fill="${color}"/><path d="M142 120 l14 14 l28 -30" fill="none" stroke="#131313" stroke-width="10"/></g></svg>`;
}

const COLORS = {
  secure: "#D7FF00",
  insecure: "#fbbf24",
} as const;

export function setFaviconSecure(secure: boolean): void {
  if (typeof document === "undefined") return;
  const color = secure ? COLORS.secure : COLORS.insecure;
  const href = `data:image/svg+xml,${encodeURIComponent(shieldSvg(color))}`;

  let link = document.querySelector<HTMLLinkElement>("link#dynamic-favicon");
  if (!link) {
    link = document.createElement("link");
    link.id = "dynamic-favicon";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = href;
}
