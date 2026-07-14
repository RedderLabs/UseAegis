-- Esquema inicial de Auth / AuthSession del relay (Modo A).
--
-- Modelo de identidad de Aegis (docs/ARQUITECTURA.md §2): no hay cuentas, ni email,
-- ni contraseñas. La identidad ES la clave pública Ed25519 (32 bytes). La autenticación
-- es challenge-response: el cliente firma un nonce con su clave privada y el relay lo
-- verifica contra la pública. Aquí NUNCA se guarda material secreto del usuario.
--
-- Formato de migración de node-pg-migrate: SQL plano con los marcadores de abajo.

-- Up Migration

-- Una fila por clave pública Ed25519 que el relay ha visto. Se crea de forma perezosa
-- en el primer login correcto; el relay la necesita como buzón de destino de blobs.
CREATE TABLE identities (
  public_key   BYTEA PRIMARY KEY,
  fingerprint  TEXT        NOT NULL,                    -- base64url de public_key (para logs/lookup legible)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identities_public_key_len CHECK (octet_length(public_key) = 32)
);

-- Retos efímeros del handshake. El cliente pide uno, firma el nonce y lo canjea.
-- Single-use (consumed_at) y con expiración corta; una tarea de limpieza podrá barrer
-- las filas vencidas más adelante.
CREATE TABLE auth_challenges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key  BYTEA       NOT NULL,                     -- pubkey que declara querer autenticarse
  nonce       BYTEA       NOT NULL,                     -- 32 bytes aleatorios que hay que firmar
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT auth_challenges_public_key_len CHECK (octet_length(public_key) = 32),
  CONSTRAINT auth_challenges_nonce_len      CHECK (octet_length(nonce) = 32)
);
CREATE INDEX auth_challenges_expires_at_idx ON auth_challenges (expires_at);

-- Sesiones emitidas tras un challenge verificado. El token que ve el cliente es un
-- secreto aleatorio; aquí solo se guarda su SHA-256 (token_hash), nunca el token en claro.
CREATE TABLE auth_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key   BYTEA       NOT NULL REFERENCES identities (public_key) ON DELETE CASCADE,
  token_hash   BYTEA       NOT NULL UNIQUE,             -- SHA-256 (32 bytes) del bearer token
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  user_agent   TEXT,
  CONSTRAINT auth_sessions_token_hash_len CHECK (octet_length(token_hash) = 32)
);
CREATE INDEX auth_sessions_public_key_idx ON auth_sessions (public_key);
-- Índice parcial para el lookup caliente: token activo y no revocado.
CREATE INDEX auth_sessions_active_idx ON auth_sessions (token_hash) WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE auth_sessions;
DROP TABLE auth_challenges;
DROP TABLE identities;
