/**
 * Marca de Aegis. El escudo se toma del emblema de apps/web/public/Aegis.svg
 * (mismas rutas y colores) inlineado como SVG para escalar nítido y controlar el
 * tamaño. El lockup completo con wordmark sigue disponible en /Aegis.svg.
 */
export function LogoMark({
  className = "h-5 w-5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="80 10 160 240"
      className={className}
      role="img"
      aria-label="Aegis"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="#D7FF00" stroke="#D7FF00">
        <path
          d="M90 40 L160 20 L230 40 L230 120 C230 180 190 220 160 240 C130 220 90 180 90 120 Z"
          fill="none"
          strokeWidth={10}
        />
        <circle cx={160} cy={120} r={42} fill="#D7FF00" />
        <path
          d="M142 120 l14 14 l28 -30"
          fill="none"
          stroke="#222831"
          strokeWidth={8}
        />
      </g>
    </svg>
  );
}
