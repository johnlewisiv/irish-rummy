-- Account ownership, invitation tokens, and game state commit together in the
-- existing private JSON snapshot. Version 3 prevents old servers from silently
-- discarding ownership data during an accidental rollback. No new public grants.
BEGIN;
ALTER TABLE irish_rummy_private.game_state DROP CONSTRAINT IF EXISTS game_state_snapshot_check;
ALTER TABLE irish_rummy_private.game_state DROP CONSTRAINT IF EXISTS game_state_snapshot_valid;
ALTER TABLE irish_rummy_private.game_state ADD CONSTRAINT game_state_snapshot_valid CHECK (
  COALESCE(jsonb_typeof(snapshot) = 'object'
    AND jsonb_typeof(snapshot -> 'version') = 'number'
    AND snapshot ->> 'version' IN ('1', '2', '3')
    AND jsonb_typeof(snapshot -> 'rooms') = 'array'
    AND (snapshot ->> 'version' <> '3' OR jsonb_typeof(snapshot -> 'accounts') = 'array'), false)
);
COMMIT;
