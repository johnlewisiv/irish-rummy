-- Run once in the NEW Irish Rummy Supabase project's SQL editor.
-- Idempotent; touches only this application's private schema.
BEGIN;
CREATE SCHEMA IF NOT EXISTS irish_rummy_private;
REVOKE ALL ON SCHEMA irish_rummy_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS irish_rummy_private.game_state (
  state_key text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND snapshot ? 'version'
    AND snapshot ->> 'version' IN ('1', '2')
    AND snapshot ? 'rooms'
    AND jsonb_typeof(snapshot -> 'rooms') = 'array'
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A separately named constraint also upgrades a table created by an earlier
-- revision of this migration; SQL CHECK otherwise accepts NULL expressions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint
    WHERE conrelid = 'irish_rummy_private.game_state'::regclass
      AND conname = 'game_state_snapshot_valid') THEN
    ALTER TABLE irish_rummy_private.game_state ADD CONSTRAINT game_state_snapshot_valid CHECK (
      COALESCE(jsonb_typeof(snapshot) = 'object'
        AND jsonb_typeof(snapshot -> 'version') = 'number'
        AND snapshot ->> 'version' IN ('1', '2')
        AND jsonb_typeof(snapshot -> 'rooms') = 'array', false)
    );
  END IF;
END $$;
REVOKE ALL ON irish_rummy_private.game_state FROM PUBLIC;
ALTER TABLE irish_rummy_private.game_state ENABLE ROW LEVEL SECURITY;
-- No policies or grants for anon/authenticated. Game state includes hidden
-- hands and bearer tokens; it is NEVER served through the Supabase Data API.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA irish_rummy_private FROM anon;
    REVOKE ALL ON irish_rummy_private.game_state FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA irish_rummy_private FROM authenticated;
    REVOKE ALL ON irish_rummy_private.game_state FROM authenticated;
  END IF;
END $$;
COMMIT;

-- Recommended: provision a dedicated LOGIN role through your approved secret
-- manager (do not put its password into this file). Then run with its real name:
-- GRANT USAGE ON SCHEMA irish_rummy_private TO irish_rummy_server;
-- GRANT SELECT, INSERT, UPDATE ON irish_rummy_private.game_state TO irish_rummy_server;
-- CREATE POLICY server_state ON irish_rummy_private.game_state
--   TO irish_rummy_server USING (true) WITH CHECK (true);
-- The app never requires DELETE, DDL, or access to another schema.
