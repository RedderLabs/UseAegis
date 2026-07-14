# Aegis — Modelo de amenaza

> Este documento existe para ser honesto, no para vender. Todo lo que Aegis no protege está aquí, explícito, no escondido en la letra pequeña.

## 1. Actores considerados

| Actor | Capacidad asumida |
|---|---|
| Operador del relay (Redder Labs) | Acceso total a su propia infraestructura (DB, logs, Redis) |
| ISP / red intermedia | Ve metadata de conexión (IP, timing, volumen), no contenido |
| Estado / orden judicial contra el relay | Puede exigir logs, embargar servidor, forzar cooperación legal |
| Peer malicioso en Modo B (P2P) | Puede participar en el store-and-forward, intentar correlacionar tráfico |
| Atacante con acceso físico al dispositivo | Fuera de alcance — ver sección 6 |
| Atacante que compromete el binario cliente (supply chain) | Mitigado por reproducible builds, no eliminado |

## 2. Qué protege el sistema (por diseño, no por promesa)

- **Contenido del mensaje**: cifrado E2E con XChaCha20-Poly1305, clave por sesión derivada vía X25519. Ni el relay ni ningún peer intermedio en Modo B/C puede leerlo.
- **Identidad del remitente frente al relay**: sealed sender — el relay entrega blobs sin saber quién los originó.
- **Integridad del binario cliente**: reproducible builds permiten verificar que el software instalado corresponde exactamente al código público auditado.
- **Confidencialidad si el relay es embargado**: no hay contenido en claro que entregar, porque nunca existió en el servidor.
- **Disponibilidad ante bloqueo de red**: failover a Modo B (libp2p) o Modo C (mesh local) si el relay es censurado o inaccesible.

## 3. Qué NO protege el sistema (límites explícitos)

- **Metadata de conexión con el relay (Modo A)**: el operador del relay ve la IP de origen y el momento de conexión, aunque no sepa a quién va dirigido el mensaje (mitigable por el usuario con Tor, no integrado por defecto en Modo A todavía).
- **Tamaño y timing de los mensajes**: un observador de red puede inferir patrones de actividad (cuándo hay conversación, aproximadamente cuánto se envía) aunque no el contenido. Sin padding de tamaño en v1.
- **Compromiso del dispositivo del usuario**: si el dispositivo tiene malware, keylogger, o el atacante tiene acceso físico desbloqueado, el cifrado en tránsito no ayuda — el atacante lee el mensaje donde y cuando está en claro, en pantalla.
- **Coerción del usuario**: ningún esquema criptográfico protege contra que a alguien lo obliguen a desbloquear su propio dispositivo o entregar su clave bajo amenaza.
- **Correlación de tráfico por adversario global pasivo**: un atacante capaz de observar tráfico en múltiples puntos de la red simultáneamente (nivel estado-nación con capacidad de vigilancia masiva de backbone) puede, en teoría, correlacionar timing de conexiones incluso con Tor. Esto es un límite conocido de cualquier sistema de anonimato basado en mezcla de tráfico, no específico de Aegis.
- **Errores de implementación no detectados**: código abierto reduce el riesgo, no lo elimina. Sin auditoría externa formal todavía (ver roadmap en ARQUITECTURA.md, fase 7), no hay garantía de ausencia de bugs criptográficos.
- **Verificación de identidad sin acción del usuario**: si el usuario nunca compara el fingerprint fuera de banda (QR en persona o canal verificado), un ataque man-in-the-middle en el primer contacto es posible. La app puede mostrar el estado "verificada", pero verificar es una acción del usuario, no algo que el software pueda forzar.

## 4. Escenarios específicos y respuesta del sistema

### 4.1 Orden judicial exige al relay entregar mensajes de un usuario

El relay entrega lo que tiene: blobs cifrados sin metadata de remitente (sealed sender) y sin capacidad de descifrarlos. No hay clave privada en el servidor. Resultado: cumplimiento técnico de la orden sin exposición real de contenido.

### 4.2 Bloqueo estatal del dominio/IP del relay (tipo Chat Control 2.0 a nivel de infraestructura)

El transporte de abstracción (`packages/transport/`) detecta el fallo y activa Modo B (libp2p) automáticamente, sin intervención del usuario más allá de ver el indicador cambiar a ámbar en el header. Antes de escalar a Modo B, el cliente puede reintentar contra el endpoint `.onion` del propio Modo A (ver ARQUITECTURA.md §4.1) — un bloqueo de DNS/IP a nivel de censura estatal no afecta a un servicio onion v3, que no depende de resolución DNS pública ni de una IP anunciada.

### 4.3 Mandato legal de insertar escaneo client-side en el binario

Ver ARQUITECTURA.md sección 8. La mitigación no es criptográfica — es de proceso: código abierto + reproducible builds hacen que cualquier hook insertado sea detectable por comparación de hashes contra el build reproducido de forma independiente por terceros. Esto no impide legalmente que se exija, pero hace que hacerlo "en silencio" sea inviable sin que la comunidad lo note en el siguiente release.

### 4.4 Usuario pierde el dispositivo

Sin backend con acceso a claves, no hay "recuperación de cuenta" centralizada posible. Esto es una consecuencia directa del modelo zero-knowledge, documentada aquí para que sea una decisión informada del usuario, no una sorpresa: se recomienda backup local cifrado de la clave privada (frase de recuperación, mismo patrón BIP39 usado en Noctcom), bajo control exclusivo del usuario.

### 4.5 Peer malicioso en la red mesh (Modo B/C)

Puede negarse a reenviar un mensaje (denegación de servicio local) o intentar inundar la red con tráfico falso. No puede leer contenido (E2E) ni suplantar al remitente (firma Ed25519 verificable). Mitigación de disponibilidad: múltiples rutas redundantes vía distintos peers, no un único punto de forwarding obligatorio.

## 5. Qué se comunica al usuario y cuándo

Siguiendo el principio de "UI pobre, sin fricción" definido en DISENO.md, el modelo de amenaza no se explica en pantalla de forma permanente. Se comunica en tres momentos puntuales:

1. **Primer uso**: pantalla mínima explicando qué significa "verificar" un contacto y por qué importa, antes del primer envío.
2. **Bajo demanda**: tap sobre el indicador de estado de transporte (verde/ámbar/rojo) muestra qué modo está activo y qué implica en una frase.
3. **En este documento público**: para cualquiera que quiera auditar las promesas reales antes de confiar en la app.

## 6. Fuera de alcance (explícitamente, no por descuido)

- Seguridad del sistema operativo del dispositivo del usuario.
- Protección contra grabación de pantalla o cámara apuntando a la pantalla por un tercero físicamente presente.
- Anonimato perfecto frente a adversarios con capacidad de vigilancia de red a escala estado-nación en ambos extremos de la comunicación simultáneamente.
- Protección legal o física del usuario — Aegis protege datos, no protege personas de coerción.

## 6.1 Nota sobre el estado "AUDIT_PASSED" en redderlabs.com

La landing de conceptos (`redderlabs.com/casos`) muestra Aegis con la etiqueta `AUDIT_PASSED`. **Hay que verificar que esto refleje la realidad antes de publicar o dejarlo tal cual**: si es una etiqueta visual genérica de la plantilla de la landing (aplicada a todos los conceptos por igual) y no corresponde a una auditoría externa real ya realizada, debe corregirse o matizarse en la propia web. Este documento solo puede afirmar "auditoría superada" cuando exista un informe de un tercero independiente citable — hasta entonces, el estado correcto es "auditoría externa: pendiente (ver ARQUITECTURA.md, roadmap fase 7)". Prometer una auditoría que no ha ocurrido contradice el principio de honestidad que rige este documento (ver introducción).

## 7. Revisión de este documento

Este documento se actualiza en cada fase del roadmap técnico (ver ARQUITECTURA.md sección 9) que introduzca un cambio de superficie de amenaza: nuevo transporte, nuevo tipo de contenido soportado, o hallazgo de auditoría externa.