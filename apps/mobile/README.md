# `apps/mobile` — cliente nativo (Expo / React Native)

Esqueleto del track móvil. **Todavía no es la app**: lo que hay es la cadena que había que probar
antes de construir nada encima — CSPRNG polirellenado → semilla en el llavero del sistema → firma
Ed25519 → challenge-response contra el relay → token de sesión.

## Estado honesto

| Pieza | Estado |
| --- | --- |
| Polyfills (`getRandomValues`, `randomUUID`) | escrito |
| Semilla en el llavero del sistema (`expo-secure-store`) | escrito |
| Auth Ed25519 contra el relay (challenge → firma → token) | escrito |
| Pantalla mínima que encadena lo anterior | escrito |
| **Instalado y ejecutado en un dispositivo** | ⬜ **no** |
| Mensajería (contactos, sobre, buzón) | ⬜ |
| Modo C (malla BLE) | ⬜ — decisiones en `docs/aegis-modo-c-mesh-ble.md` |

Las versiones de `expo` / `react-native` del `package.json` son un punto de partida razonable, **sin
verificar**: la alineación entre SDK de Expo y React Native la fija Expo, así que el primer paso real
es `npx expo install --fix`, que las ajusta al set compatible. No des por buenas esas versiones.

## Arrancarlo

**Expo Go no sirve.** BLE y el llavero necesitan módulos nativos, así que desde el primer día esto es
prebuild + dev client:

```bash
pnpm --filter @aegis/mobile exec expo install --fix   # alinea versiones al SDK
pnpm --filter @aegis/mobile prebuild                  # genera android/ e ios/
pnpm --filter @aegis/mobile android                   # o `ios` (necesita macOS)
```

Variables (prefijo `EXPO_PUBLIC_`, se hornean en el bundle):

```
EXPO_PUBLIC_RELAY_ORIGIN=https://useaegis.app/api
```

Ojo con una diferencia de fondo respecto a la web: allí el cliente va **same-origin** (`/api`) y el
transporte sigue la puerta por la que entraste, clearnet o `.onion`, sin CORS ni toggle. Aquí hay que
apuntar a un origen explícito, así que el día que el móvil quiera hablar por `.onion` hará falta un
SOCKS5 embebido (Arti) — está anotado como track nativo en `ROADMAP.md`.

## Decisiones ya tomadas (y por qué no son obvias)

- **La semilla vive en el llavero del sistema, no bajo Argon2id.** La web cifra con Argon2id +
  AES-GCM porque el navegador no le da nada mejor; el móvil sí tiene almacén respaldado por
  hardware. Reimplementar Argon2id encima añadiría dependencia nativa y una contraseña más sin ganar
  nada. Compromiso honesto: en el móvil la semilla está tan protegida como el bloqueo del
  dispositivo. La recuperación sigue siendo la frase BIP39, no el backup del sistema — por eso el
  elemento se guarda como `THIS_DEVICE_ONLY`.
- **Sin SSE de momento.** `openMessageStream` de la web usa `fetch` con streaming a propósito
  (EventSource no puede mandar la cabecera de sesión) y el `fetch` de React Native no hace streaming.
  El móvil usa el polling que en la web es la red de seguridad. Funciona y gasta más batería;
  decidir entre `expo/fetch`, una librería de SSE o un servicio nativo es trabajo pendiente.
- **La cripto no se reimplementa.** Viene de `@aegis/crypto-core` y `@aegis/protocol`, y el vector
  congelado de `envelope.test.ts` es el contrato que este cliente tiene que satisfacer. Reimplementar
  cripto no es duplicar código: es arriesgarse a derivar una clave distinta y que la misma identidad
  deje de ser la misma persona al cambiar de dispositivo.
