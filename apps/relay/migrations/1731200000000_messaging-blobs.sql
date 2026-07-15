-- Buzón de mensajes (Modo A) — sobres sealed-sender por destinatario.
--
-- El relay solo almacena, por identidad DESTINATARIA, un blob cifrado OPACO (el sobre
-- sealed-sender, ver docs/aegis-messaging-mvp.md §2 y ARQUITECTURA.md §3-4). NO hay columna
-- de remitente: la identidad del remitente viaja cifrada DENTRO del payload, así que el relay
-- no la conoce. El contenido va E2E; el relay nunca ve texto en claro.
--
-- Persistencia: los sobres se RETIENEN bajo TTL (no se borran al entregar), para que el
-- destinatario recupere su conversación entrando por cualquier puerta (clearnet o .onion)
-- con la misma identidad (requisito de continuidad cross-puerta).
--
-- Formato de migración de node-pg-migrate: SQL plano con los marcadores de abajo.

-- Up Migration

CREATE TABLE messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient   BYTEA       NOT NULL REFERENCES identities (public_key) ON DELETE CASCADE,
  payload     BYTEA       NOT NULL,                        -- sobre sealed-sender opaco (sin remitente)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  CONSTRAINT messages_recipient_len CHECK (octet_length(recipient) = 32),
  -- Tope de 64 KiB por sobre en el MVP (texto). Archivos/audio irán por chunking (varios sobres).
  CONSTRAINT messages_payload_max   CHECK (octet_length(payload) <= 65536)
);

-- Lookup del buzón: los sobres de un destinatario, en orden (cursor incremental por created_at).
CREATE INDEX messages_recipient_created_idx ON messages (recipient, created_at);
-- Barrido TTL.
CREATE INDEX messages_expires_at_idx ON messages (expires_at);

-- Down Migration

DROP TABLE messages;
