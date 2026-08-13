# Aegis — Modelo de amenaza

> Este documento existe para ser honesto, no para vender. Todo lo que Aegis no protege está aquí, explícito, no escondido en la letra pequeña.

## 1. Actores considerados

| Actor | Capacidad asumida |
|---|---|
| Operador del relay (Redder Labs) | Acceso total a su propia infraestructura (DB, logs, Dragonfly) |
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
- **Volumen de almacenamiento por identidad y día, frente al propio relay** (desde 2026-08-11): la cuota de almacenamiento obliga a llevar una contabilidad, y esa contabilidad es metadata. El relay guarda una tabla `storage_usage` con cubos `(identidad, día) → bytes`: sabe **cuánto** ocupa una identidad y **qué días** subió, en una ventana móvil de 30 días (`MEDIA_TTL_SECONDS`, los cubos vencidos se barren solos). Lo que **no** guarda: `object_key`, destinatario ni hora exacta — la correlación subida↔descarga sigue rota y sealed sender no se ve afectado. El coste real es un **perfil de actividad**: como el directorio de nombres de usuario es público (handle → clave pública), quien tenga ambas cosas puede decir «este handle estuvo activo estos días», no solo «esta clave opaca». Se asume a sabiendas: sin techo por identidad, el tope por objeto y el rate-limit por IP dejaban subir del orden de 8 TiB/día a una sola identidad, y un servicio que cualquiera puede llenar no está disponible para nadie. La alternativa sin este coste es Privacy Pass / firma ciega —el relay emite tokens de subida contra la identidad y el cliente los gasta anónimamente—, prevista para las fases 6/7 del roadmap; el esquema actual es compatible con migrar a ella.
- **Compromiso del dispositivo del usuario**: si el dispositivo tiene malware, keylogger, o el atacante tiene acceso físico desbloqueado, el cifrado en tránsito no ayuda — el atacante lee el mensaje donde y cuando está en claro, en pantalla.
- **Coerción del usuario**: ningún esquema criptográfico protege contra que a alguien lo obliguen a desbloquear su propio dispositivo o entregar su clave bajo amenaza.
- **Correlación de tráfico por adversario global pasivo**: un atacante capaz de observar tráfico en múltiples puntos de la red simultáneamente (nivel estado-nación con capacidad de vigilancia masiva de backbone) puede, en teoría, correlacionar timing de conexiones incluso con Tor. Esto es un límite conocido de cualquier sistema de anonimato basado en mezcla de tráfico, no específico de Aegis.
- **Errores de implementación no detectados**: código abierto reduce el riesgo, no lo elimina. Sin auditoría externa formal todavía (ver roadmap en ARQUITECTURA.md, fase 7), no hay garantía de ausencia de bugs criptográficos.
- **Verificación de identidad sin acción del usuario**: si el usuario nunca compara el fingerprint fuera de banda (QR en persona o canal verificado), un ataque man-in-the-middle en el primer contacto es posible. La app puede mostrar el estado "verificada", pero verificar es una acción del usuario, no algo que el software pueda forzar.

## 4. Escenarios específicos y respuesta del sistema

### 4.1 Orden judicial exige al relay entregar mensajes de un usuario

El relay entrega lo que tiene: blobs cifrados sin metadata de remitente (sealed sender) y sin capacidad de descifrarlos. No hay clave privada en el servidor. Resultado: cumplimiento técnico de la orden sin exposición real de contenido.

Conviene ser preciso sobre qué es «lo que tiene», porque no es solo contenido cifrado. Si la orden pregunta por una identidad concreta, el relay también puede entregar: la **contabilidad de cuota** de esa identidad (cuántos bytes subió y qué días, ventana de 30 días — ver sección 3), su **entrada de directorio** (handle público y prekeys firmadas, que de todas formas son públicas) y los **metadatos de conexión** que estén en los logs vivos (IP y momento, salvo que el usuario entre por `.onion`). Lo que **no** puede entregar en ningún caso: contenido en claro, qué objeto de media pertenece a quién, ni quién habla con quién. La diferencia importa en la respuesta honesta a un requerimiento: no es «no tengo nada», es «no tengo contenido, y lo que tengo es un perfil de actividad grosero que no dice con quién».

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

**También fuera de las fases.** La cuota de almacenamiento (agosto de 2026) no pertenecía a ninguna fase —salió de operar el servicio de verdad— y aun así añadió metadata persistente. La regla práctica es más simple que la lista de arriba: **si un cambio hace que el relay guarde algo nuevo sobre una identidad, entra aquí antes de desplegarse**, sea o no parte de una fase del roadmap.