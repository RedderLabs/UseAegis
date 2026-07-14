# Aegis Private Messenger — export de Stitch

Descargado el 2026-07-12 desde el proyecto Stitch `Aegis Private Messenger`
(`projects/8014841756174636934`). Todas las pantallas son DESKTOP (2560px de ancho).

## Pantallas

| # | Archivo | Título en Stitch | Screenshot |
|---|---------|------------------|------------|
| 1 | `01-aegis-secure-messenger.html` | Aegis Secure Messenger | `screenshots/01-aegis-secure-messenger.png` |
| 2 | `02-aegis-landing-page.html` | Aegis Landing Page | `screenshots/02-aegis-landing-page.png` |
| 3 | `03-privacy-vault.html` | Privacy Vault | `screenshots/03-privacy-vault.png` |
| 4 | `04-encryption-logs-noise-transport.html` | Encryption Logs (Noise Transport) | `screenshots/04-encryption-logs.png` |
| 5 | *(solo imagen)* | Aegis Brand Logo | `screenshots/05-aegis-brand-logo.png` |
| 6 | `06-aegis-login.html` | Aegis Login - Secure Session Initialization | `screenshots/06-aegis-login.png` |
| 7 | `07-aegis-register.html` | Aegis Register - Automatic Identity Generation | `screenshots/07-aegis-register.png` |

> **Actualización 2026-07-12:** añadidas las pantallas 6 y 7 (login y registro),
> necesarias para el flujo de acceso al chat. Ver notas de coherencia abajo.

> La pantalla "Aegis Brand Logo" no tiene código HTML en Stitch — es solo un
> asset de imagen, por eso únicamente existe su screenshot.

## Notas

- Los HTML son autocontenidos tal como los genera Stitch (Tailwind vía CDN,
  `<html class="dark" lang="es">`). Para abrirlos basta con doble clic.
- Ojo: usan CDN externo (Tailwind/fuentes), lo que contradice la regla de
  `DISENO.md §2` ("todo bundleado localmente" en producción). Son mockups de
  referencia, no build final.

## Notas de coherencia — pantallas de login/registro (6 y 7)

**Registro (`07`) — bien alineado.** El concepto "Identity Genesis / Mathematical
Sovereignty" ("la recolección de datos personales es una imposibilidad
arquitectónica; tu identidad es una cadena de alta entropía derivada por pruebas
matemáticas") encaja con `ARQUITECTURA.md §2` (Ed25519, sin cuentas/email/teléfono)
y con el backup de clave (botón "Download Master Key" ≈ frase BIP39). Único matiz
técnico: el mockup genera el ID con `Math.random()` — el cliente real **debe** usar
el CSPRNG de `@aegis/crypto-core` (libsodium), nunca `Math.random`.

**Login (`06`) — dos cosas a revisar antes de implementar:**
1. **Modelo de acceso.** El formulario pide "ALPHANUMERIC USER IDENTITY" +
   "ENCRYPTION KEY / PASS", que se lee como un login clásico usuario+contraseña
   contra un servidor. Aegis es zero-knowledge: no hay auth de servidor. El
   "login" real es **desbloquear el almacén de claves local** con la passphrase
   (Argon2id) — y, en un dispositivo nuevo, importar la identidad vía recuperación.
   Hay que decidir la semántica antes de codificarlo (ver pregunta al usuario).
2. **"E2EE Protocol v4.2"** es un número de versión inventado (mismo tipo de
   problema que el "X3DH v4.1" que ya se corrigió en la landing). El protocolo real
   usa X25519/XChaCha20; no existe una "v4.2". Quitar o sustituir por algo real.

**Ambas:** están en inglés (`lang="en"`) mientras la app y los docs están en
español; al integrarlas como rutas habría que unificar idioma (español).
