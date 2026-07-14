import { SecurityGate } from "@/components/SecurityGate";

// /panel/seguro — comprueba cifrado y estado de sesión segura por código.
// Si "Sesión segura" se desactivó en el login, este paso lo marca como aviso
// y la sesión no se muestra como segura más adelante.
export default function SeguroGate() {
  return (
    <SecurityGate
      phase="Fase 2 · Canal"
      title="Asegurando el canal"
      subtitle="Estableciendo el cifrado extremo a extremo y comprobando la sesión."
      variant="canal"
      nextHref="/panel/seguro/dashboard"
    />
  );
}
