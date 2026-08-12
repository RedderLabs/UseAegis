import { SecurityGate } from "@/components/SecurityGate";

// /panel — comprueba por código la seguridad de acceso del usuario.
export default function PanelGate() {
  return <SecurityGate variant="acceso" nextHref="/panel/seguro" />;
}
