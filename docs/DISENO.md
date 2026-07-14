# Aegis — Diseño

> "El servidor nunca ve remitente, destinatario ni contenido: solo transporta ruido." Una sola función hecha con precisión total: enviar un mensaje cifrado que llegue. Nada alrededor.

Nota de naming: el "ruido" del tagline oficial (redderlabs.com) no es una metáfora suelta — es literal. El relay transporta blobs cifrados indistinguibles de tráfico aleatorio (ver ARQUITECTURA.md §5 sealed sender, y la capa de ofuscación de transporte planificada en el roadmap). El copy de marketing y la arquitectura técnica dicen exactamente lo mismo; eso es intencional y debe mantenerse así en cualquier pieza de comunicación futura.

## 1. Filosofía

Aegis no es un producto de "engagement". No hay nada que optimizar para que el usuario se quede más tiempo — al contrario, cuanto menos tiempo pase mirando la app, mejor está funcionando. La UI se diseña como un instrumento quirúrgico: cada elemento en pantalla tiene que justificar por qué está ahí. Si no corta, sobra.

Esto se traduce en tres reglas que gobiernan cualquier decisión de diseño futura:

1. **Una función, sin desvíos.** Enviar/recibir mensajes cifrados (texto, audio, luego archivos). No hay estados, no hay perfiles públicos, no hay "descubrir personas".
2. **Cero fricción visual.** Entrar, actuar, salir. Sin onboarding largo, sin configuración por defecto — la config avanzada existe pero nunca se interpone en el camino principal.
3. **Superficie mínima = menos que auditar.** Cada feature nueva es una incisión que hay que justificar por escrito antes de escribir código (ver PLANTILLA.md).

## 2. Qué NO lleva la UI (por diseño, no por omisión)

Esta lista es tan importante como la de qué sí lleva. Cada ítem descartado es una fuga de metadata potencial:

- ❌ Foto de perfil / avatar
- ❌ Indicador de "escribiendo..."
- ❌ Recibos de lectura ("visto", doble check azul)
- ❌ Marca de tiempo exacta visible por defecto (solo agrupación por día)
- ❌ Estados / historias
- ❌ Analítica de uso, telemetría, crash reporting con datos identificables
- ❌ Fuentes o assets cargados desde CDN externo en producción (todo bundleado localmente)

Lo único que se muestra explícitamente y de forma prominente es la **verificación de identidad criptográfica** (fingerprint de la clave), porque es la única metadata que protege al usuario en vez de exponerlo.

## 3. Design tokens

### Color

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0a0b0c` | Fondo base de la app |
| `--surface` | `#131416` | Header, input bar, footer |
| `--surface-2` | `#1a1c1f` | Elementos elevados (fingerprint bar, campo de texto) |
| `--line` | `#232528` | Bordes, divisores |
| `--text` | `#e7e5e0` | Texto principal (hueso, no blanco puro) |
| `--muted` | `#6f7378` | Texto secundario |
| `--muted-2` | `#47494c` | Texto terciario / deshabilitado |
| `--accent` | `#7fffb0` | Verificación, estado activo — uso restringido, nunca decorativo |
| `--accent-dim` | `#3d6b52` | Iconos de estado en reposo (candado en "entregado") |
| `--bubble-out` | `#1c2a24` | Burbuja de mensaje propio |
| `--bubble-in` | `#16171a` | Burbuja de mensaje recibido |

El accent verde-fósforo se usa **exclusivamente** para señalar estado criptográfico verificado (punto de conexión activa, fingerprint confirmada, candado de entrega). Nunca aparece como color decorativo de marca — si aparece en pantalla, significa algo.

### Tipografía

Una sola familia en toda la app: **IBM Plex Mono** (pesos 400/500/600). Monoespaciada a propósito — comunica "herramienta técnica", no "app social", y hace que el fingerprint hexadecimal se lea con claridad absoluta (alineación de caracteres).

- Nombre de contacto / títulos: 14px, weight 600
- Cuerpo de mensaje: 13px, weight 400, line-height 1.5
- Metadata (labels, duración, "entregado"): 9–11px, weight 400, letter-spacing amplio, mayúsculas cuando es un label de sistema

### Layout

- Header fijo (`flex: 0 0 auto`) con barra de fingerprint integrada, no separada en un menú.
- Contenido central único con scroll (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) — es la única zona que se mueve.
- Input bar + footer note fijos al fondo (`flex: 0 0 auto`).
- Sin border-radius grande en burbujas (3px) — deliberadamente anguloso, evita la estética "app de mensajería genérica" (WhatsApp/Telegram con burbujas muy redondeadas).

## 4. Componentes clave

### Barra de fingerprint (elemento firma)

Sustituye el header decorativo típico ("foto + nombre + últ. vez") por la información que realmente importa en un chat E2E: el hash de la clave verificada. Formato: `4F9A · 22C1 · 88E0 · B301 · 7D6F · 12AA`, agrupado en bloques de 4 para facilitar comparación visual/oral al verificar en persona.

### Burbuja de mensaje

Texto plano, sin cola de burbuja (evita el skeuomorfismo de "globo de diálogo"). Metadata reducida a un punto de candado + "entregado" — nunca "leído".

### Burbuja de audio

Botón de play circular + waveform estático (representación visual, no reproducción en tiempo real de amplitud) + duración. Sin transcripción automática visible (evita crear un segundo canal de datos en texto plano derivado del audio).

### Input bar

Campo de texto + un solo botón de acción que cambia de estado: micrófono cuando el campo está vacío, enviar cuando hay texto. No hay barra de adjuntos con iconos múltiples (cámara, galería, documento, ubicación...) — eso se añade en v2/v3 solo si el pipeline de cifrado por chunks ya soporta ese tipo de archivo, nunca antes.

## 5. Reglas de copy

- Voz activa siempre: "Mensaje entregado", no "El mensaje ha sido entregado".
- Nombrar por lo que el usuario controla, nunca por cómo está construido el sistema: "clave verificada", no "handshake X25519 completado".
- Los errores no se disculpan y no son vagos: "No se pudo enviar. Sin conexión al relay." — no "Algo salió mal".
- Un estado vacío es una invitación a actuar, no un mensaje de disculpa: pantalla de "sin conversaciones" ofrece directamente el botón de escanear QR de contacto, no un texto largo explicando qué es Aegis.

## 6. Indicador de modo de transporte (pendiente de integrar visualmente)

Cuando se una la arquitectura de transporte múltiple (relay / P2P / mesh BLE), el único cambio visual permitido en el header es el color del punto de estado ya existente:

- 🟢 Verde (`--accent`): relay activo, baja latencia
- 🟡 Ámbar: modo P2P (libp2p), sin relay central
- 🔴 Rojo/naranja apagado: modo mesh local (BLE/Wi-Fi Aware), sin internet

No se añade texto explicativo permanente — un tap sobre el punto muestra el detalle bajo demanda, coherente con la regla de "cero fricción visual".
