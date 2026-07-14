import { SecurityGate } from "@/components/SecurityGate";

// /panel — comprueba por código la seguridad de acceso del usuario.
export default function PanelGate() {
  return (
    <SecurityGate
      phase="Fase 1 · Acceso"
      title="Verificando identidad"
      subtitle="Comprobando que la sesión y el almacén local son válidos."
      variant="acceso"
      nextHref="/panel/seguro"
    />
  );
}
