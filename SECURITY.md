# Política de Seguridad

Aegis es software de mensajería cifrada. La confianza depende por completo de que
el código sea **auditable y verificable**. Tratamos cualquier fallo de seguridad
—especialmente los que afecten a criptografía, metadatos o al modelo de amenaza—
con la máxima prioridad.

## Reporte de vulnerabilidades (divulgación responsable)

**No abras un issue público** para vulnerabilidades de seguridad.

Usa uno de estos canales privados:

1. **GitHub Security Advisories** (preferido): pestaña *Security → Report a vulnerability*
   en <https://github.com/RedderLabs/Aegis/security/advisories/new>.
2. **Correo cifrado**: `0xSignalShadow@proton.me`.

Incluye, si puedes:

- Descripción del fallo y su impacto (confidencialidad / integridad / metadatos).
- Pasos para reproducirlo o prueba de concepto.
- Componente afectado (`crypto-core`, `protocol`, `transport`, `relay`, `web`).
- Versión / commit (`git rev-parse HEAD`).

### Tiempos de respuesta

| Etapa                          | Objetivo         |
| ------------------------------ | ---------------- |
| Acuse de recibo                | ≤ 72 horas       |
| Evaluación inicial de gravedad | ≤ 7 días         |
| Corrección o plan de mitigación| según gravedad   |

Pedimos un margen razonable de divulgación coordinada (hasta 90 días) antes de
hacer público el detalle. Reconoceremos tu contribución en el aviso salvo que
prefieras el anonimato.

## Alcance

Nos interesan especialmente:

- Debilidades criptográficas: uso incorrecto de Ed25519 / X25519 / XChaCha20-Poly1305 /
  Argon2id, reutilización de nonce, generación de aleatoriedad débil, oráculos de padding.
- **Fuga de metadatos**: cualquier vía por la que el relay o un observador de red pueda
  inferir remitente, destinatario, tamaño real o momento de un mensaje. Esto contradice
  la premisa del proyecto ("el servidor solo transporta ruido") y se trata como crítico.
- Bypass de autenticación en el reto-respuesta Ed25519 del relay.
- Inyección, RCE, SSRF o escalada en `apps/relay` y `apps/web`.
- Fallos de la cadena de suministro (dependencias, integridad del build).

### Fuera de alcance

- Ataques que requieran control físico del dispositivo ya comprometido.
- Denegación de servicio por fuerza bruta de volumen sin un fallo lógico subyacente.
- Ingeniería social sobre operadores o usuarios.
- Hallazgos automáticos de escáneres sin impacto demostrable.

## Versiones soportadas

El proyecto está en desarrollo activo previo a `1.0.0`. Solo se da soporte de
seguridad a la rama `main` (último commit). No existe todavía una release estable.

## Modelo de amenaza y auditoría

- El modelo de amenaza vive en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).
- La arquitectura y las fronteras de confianza en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
- **Estado de auditoría externa: pendiente.** No se afirma ninguna auditoría de
  terceros superada hasta que exista un informe citable (roadmap fase 7).

## Reproducibilidad

Para poder auditar lo que se ejecuta:

- Todas las dependencias están fijadas en `pnpm-lock.yaml`.
- `crypto-core` y `protocol` no importan nada de `apps/` — se auditan de forma aislada.
- Licencia **AGPL-3.0**: cualquier despliegue en red debe ofrecer su código fuente
  correspondiente, de modo que un usuario pueda verificar el binario contra la fuente.
