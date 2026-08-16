/**
 * Pantalla mínima del esqueleto: crear/cargar la identidad del llavero y autenticarse contra el
 * relay. No es la app: es la prueba de que la cadena entera (CSPRNG polirellenado → semilla en el
 * llavero → firma Ed25519 → challenge-response → token) funciona en un dispositivo real.
 *
 * Deliberadamente sin diseño: los tokens visuales (`stitch-aegis/DESIGN.md`) se traen cuando haya
 * pantallas de verdad, no ahora — un esqueleto maquillado esconde lo que todavía no hace.
 */
import "./src/polyfills";

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { authenticate, fetchMe, health, RelayError } from "./src/lib/relay";
import { createIdentity, hasIdentity, publicKey, sign, unlockIdentity } from "./src/lib/keystore";

type Estado =
  | { fase: "cargando" }
  | { fase: "sin-identidad" }
  | { fase: "lista"; pub: string }
  | { fase: "sesion"; pub: string; huella: string; usuario: string | null }
  | { fase: "error"; mensaje: string };

export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [ocupado, setOcupado] = useState(false);
  const [relay, setRelay] = useState<string>("sin comprobar");

  useEffect(() => {
    void (async () => {
      try {
        setEstado((await hasIdentity()) ? { fase: "lista", pub: await unlockIdentity() } : { fase: "sin-identidad" });
      } catch (err) {
        setEstado({ fase: "error", mensaje: mensaje(err) });
      }
    })();
    void health()
      .then((h) => setRelay(`${h.status} · bbdd ${h.db}`))
      .catch((err) => setRelay(mensaje(err)));
  }, []);

  async function crear() {
    setOcupado(true);
    try {
      setEstado({ fase: "lista", pub: await createIdentity() });
    } catch (err) {
      setEstado({ fase: "error", mensaje: mensaje(err) });
    } finally {
      setOcupado(false);
    }
  }

  async function entrar() {
    setOcupado(true);
    try {
      const pub = await publicKey();
      const sesion = await authenticate(pub, sign);
      const yo = await fetchMe(sesion.token);
      setEstado({ fase: "sesion", pub, huella: yo.fingerprint, usuario: yo.username });
    } catch (err) {
      setEstado({ fase: "error", mensaje: mensaje(err) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.pantalla}>
      <StatusBar style="light" />
      <Text style={estilos.titulo}>Aegis · esqueleto nativo</Text>
      <Text style={estilos.dato}>relay: {relay}</Text>

      {estado.fase === "cargando" && <ActivityIndicator />}

      {estado.fase === "sin-identidad" && (
        <Boton texto="Crear identidad" onPress={crear} disabled={ocupado} />
      )}

      {estado.fase === "lista" && (
        <>
          <Text style={estilos.dato}>identidad: {estado.pub.slice(0, 16)}…</Text>
          <Boton texto="Entrar" onPress={entrar} disabled={ocupado} />
        </>
      )}

      {estado.fase === "sesion" && (
        <>
          <Text style={estilos.ok}>sesión abierta</Text>
          <Text style={estilos.dato}>huella: {estado.huella}</Text>
          <Text style={estilos.dato}>usuario: {estado.usuario ?? "(sin nombre público)"}</Text>
        </>
      )}

      {estado.fase === "error" && <Text style={estilos.error}>{estado.mensaje}</Text>}
    </ScrollView>
  );
}

function Boton({ texto, onPress, disabled }: { texto: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[estilos.boton, disabled && estilos.botonApagado]}>
      <Text style={estilos.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

function mensaje(err: unknown): string {
  if (err instanceof RelayError) return `relay ${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : "Error desconocido";
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, gap: 12, padding: 24, paddingTop: 72, backgroundColor: "#0a0a0a" },
  titulo: { color: "#fafafa", fontSize: 20, fontWeight: "600" },
  dato: { color: "#a1a1a1", fontFamily: "monospace", fontSize: 12 },
  ok: { color: "#a3e635", fontSize: 14 },
  error: { color: "#f87171", fontSize: 13 },
  boton: { backgroundColor: "#a3e635", borderRadius: 4, paddingVertical: 12, alignItems: "center" },
  botonApagado: { opacity: 0.4 },
  botonTexto: { color: "#0a0a0a", fontWeight: "600" },
});
