-- Contabilidad de CUOTA DE ALMACENAMIENTO por identidad.
--
-- Problema que resuelve: `media_objects` no tiene columna de propietario (a propósito:
-- sealed-sender, el relay no debe correlacionar quién sube con quién descarga), así que hasta
-- ahora no existía ningún techo por identidad — solo el tope por objeto (MEDIA_MAX_BYTES) y el
-- rate-limit por IP. Multiplicados, dejaban subir del orden de 8 TiB/día a una sola identidad.
--
-- Qué guarda esta tabla y qué NO:
--
--   SÍ:  "la identidad X subió N bytes el día D" (agregado por día).
--   NO:  object_key, destinatario, ni la hora exacta de cada subida.
--
-- Es decir: el relay puede saber CUÁNTO ocupa alguien, pero NO QUÉ objetos son suyos ni para
-- quién iban. La correlación subida↔descarga sigue rota. El relay ya conoce al que sube en el
-- momento de subir (la ruta exige sesión, igual que el chequeo de bloqueos en message_blocks);
-- lo único nuevo aquí es persistir un AGREGADO de algo que ya ve en vivo.
--
-- Por qué cubos por DÍA y no un contador plano `bytes_held`:
--
--   1. Un contador plano no se puede DECREMENTAR. El barrido TTL borra filas de `media_objects`,
--      que no tiene propietario, así que en ese momento es imposible saber a quién devolverle los
--      bytes. Con cubos por día no hace falta: los bytes del día D caducan solos el día D+TTL.
--   2. Una sola tabla responde a las tres preguntas: cuánto ocupa ahora (suma de los cubos vivos),
--      cuánto ha subido hoy (cubo de hoy, para la ráfaga diaria) y qué liberar (cubos vencidos).
--   3. Filtra MENOS que una fila por objeto: tres subidas en un día son una fila con la suma, no
--      tres tamaños individuales correlacionables uno a uno con `media_objects`.
--
-- El coste de metadatos que sí queda (volumen agregado por identidad y día) está declarado en
-- docs/THREAT_MODEL.md. La solución sin ese coste es Privacy Pass / firma ciega (Fase 6/7): el
-- relay emitiría tokens de subida contra la identidad y el cliente los gastaría anónimamente.
--
-- Formato de migración de node-pg-migrate: SQL plano con los marcadores de abajo.

-- Up Migration

CREATE TABLE storage_usage (
  identity BYTEA  NOT NULL REFERENCES identities (public_key) ON DELETE CASCADE,
  day      DATE   NOT NULL,
  bytes    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (identity, day),
  CONSTRAINT storage_usage_bytes_positive CHECK (bytes >= 0)
);

-- Barrido de los cubos vencidos (mismo patrón que media_expires_at_idx).
CREATE INDEX storage_usage_day_idx ON storage_usage (day);

-- Down Migration

DROP TABLE storage_usage;
