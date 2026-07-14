import { transportStatus } from "@aegis/ui-kit/tokens";

type Mode = keyof typeof transportStatus;

/**
 * Punto de estado de transporte (DISENO.md §6). El accent verde solo aparece
 * como señal criptográfica/de estado, nunca como decoración.
 */
export function StatusDot({
  mode = "relay",
  className = "w-2 h-2",
  glow = true,
}: {
  mode?: Mode;
  className?: string;
  glow?: boolean;
}) {
  const color = transportStatus[mode];
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        backgroundColor: color,
        boxShadow: glow ? `0 0 8px ${color}` : undefined,
      }}
    />
  );
}
