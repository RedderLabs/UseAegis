-- Bloqueos de mensajería — a quién NO quiero que me deje sobres en el buzón.
--
-- Un bloqueo es direccional: `blocker` (yo) no acepta mensajes de `blocked`. Al ENVIAR, el
-- remitente está autenticado por su sesión (aunque el sobre almacenado sea sealed-sender), así
-- que el relay puede comprobar aquí si el destinatario ha bloqueado al remitente y descartar el
-- sobre en silencio (ver apps/relay/src/messaging/routes.ts). Esto hace que el bloqueo sea REAL
-- (impuesto por el relay), no solo un filtro cosmético del cliente.
--
-- El relay guarda solo el par de claves públicas: ni contenido, ni motivo, ni grafo más allá de
-- este par. `blocked` NO referencia identities (puedo bloquear una clave aunque no exista aún).

-- Up Migration

CREATE TABLE message_blocks (
  blocker    BYTEA       NOT NULL REFERENCES identities (public_key) ON DELETE CASCADE,
  blocked    BYTEA       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CONSTRAINT message_blocks_blocker_len CHECK (octet_length(blocker) = 32),
  CONSTRAINT message_blocks_blocked_len CHECK (octet_length(blocked) = 32),
  CONSTRAINT message_blocks_not_self    CHECK (blocker <> blocked)
);

-- Listar mis bloqueos por recencia y comprobar (blocker, blocked) en el envío: la PK cubre la
-- comprobación exacta; este índice sirve el listado ordenado.
CREATE INDEX message_blocks_blocker_created_idx ON message_blocks (blocker, created_at DESC);

-- Down Migration

DROP TABLE message_blocks;
