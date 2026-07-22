-- Rastreo de OBJETOS de media (audio/archivos) cifrados, almacenados en el bucket S3-compatible.
--
-- El relay NO guarda el contenido en Postgres (va al bucket B2/R2/S3); esta tabla solo lleva la
-- cuenta de qué objetos existen, para poder BARRERLOS por TTL (igual que el buzón `messages`) y
-- para autorizar la descarga. El `object_key` es una capability aleatoria (uuid): quien lo conoce
-- —viaja cifrado E2E dentro del sobre sealed-sender— puede pedir la descarga (con sesión válida).
--
-- No hay columna de remitente ni de destinatario: el relay no debe correlacionar quién sube con
-- quién descarga a través de esta tabla (coherente con sealed-sender). El tamaño sí se guarda
-- (lo ve de todos modos al hacer de proxy) para límites/contabilidad.
--
-- Formato de migración de node-pg-migrate: SQL plano con los marcadores de abajo.

-- Up Migration

CREATE TABLE media_objects (
  object_key  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  size_bytes  BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  CONSTRAINT media_size_positive CHECK (size_bytes > 0)
);

-- Barrido TTL de objetos vencidos (mismo patrón que messages_expires_at_idx).
CREATE INDEX media_expires_at_idx ON media_objects (expires_at);

-- Down Migration

DROP TABLE media_objects;
