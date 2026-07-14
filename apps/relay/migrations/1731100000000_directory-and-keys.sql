-- Directorio de usuarios + prekeys X25519 (descubrimiento y acuerdo de claves).
--
-- Amplía el modelo de identidad (docs/ARQUITECTURA.md §2) con lo mínimo para que dos
-- usuarios puedan encontrarse y establecer un canal E2E, SIN que el relay vea ningún
-- secreto ni el grafo social:
--
--   1. `username`  — identificador legible OPT-IN para poder buscarse en la app. Es lo
--      único que el relay expone en un directorio consultable. Mapea handle → clave
--      pública Ed25519. Nullable: una identidad puede existir sin figurar en el directorio.
--
--   2. `x25519_public_key` + `x25519_signature` — "prekey" pública de acuerdo de claves.
--      El usuario deriva un par X25519 de su misma semilla, publica SOLO la parte pública
--      y la FIRMA con su clave Ed25519 de identidad. El peer descarga la prekey, verifica
--      la firma (así el relay no puede colar una prekey suya → sin MITM) y calcula el
--      secreto compartido por ECDH en local. El relay nunca ve el secreto: sigue E2E.
--
-- El grafo social (quién habla con quién) NO se guarda aquí a propósito: las listas de
-- contactos viven en el cliente. Ver docs/THREAT_MODEL.md (directorio de usuarios).

-- Up Migration

ALTER TABLE identities
  ADD COLUMN username          TEXT,
  ADD COLUMN x25519_public_key BYTEA,
  ADD COLUMN x25519_signature  BYTEA,
  ADD COLUMN keys_updated_at   TIMESTAMPTZ;

-- Formato del handle: 3–20 chars, minúsculas/dígitos/guion_bajo. Se normaliza en el
-- cliente y en la ruta antes de insertar; el CHECK es la última línea de defensa.
ALTER TABLE identities
  ADD CONSTRAINT identities_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');

-- La prekey X25519 son 32 bytes y su firma Ed25519 64. Ambas van juntas o ninguna.
ALTER TABLE identities
  ADD CONSTRAINT identities_x25519_public_key_len
    CHECK (x25519_public_key IS NULL OR octet_length(x25519_public_key) = 32),
  ADD CONSTRAINT identities_x25519_signature_len
    CHECK (x25519_signature IS NULL OR octet_length(x25519_signature) = 64),
  ADD CONSTRAINT identities_x25519_pair
    CHECK ((x25519_public_key IS NULL) = (x25519_signature IS NULL));

-- Unicidad case-insensitive del handle (solo sobre las filas que lo tienen).
CREATE UNIQUE INDEX identities_username_lower_idx
  ON identities (lower(username))
  WHERE username IS NOT NULL;

-- Down Migration

DROP INDEX identities_username_lower_idx;
ALTER TABLE identities
  DROP CONSTRAINT identities_x25519_pair,
  DROP CONSTRAINT identities_x25519_signature_len,
  DROP CONSTRAINT identities_x25519_public_key_len,
  DROP CONSTRAINT identities_username_format,
  DROP COLUMN keys_updated_at,
  DROP COLUMN x25519_signature,
  DROP COLUMN x25519_public_key,
  DROP COLUMN username;
