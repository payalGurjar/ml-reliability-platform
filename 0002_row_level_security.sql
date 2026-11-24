-- Per-user data isolation. The API routes authenticate with the service role
-- (which bypasses RLS) and additionally filter every query by user_id, so these
-- policies are defence in depth: they make direct access with the public anon
-- key impossible for anything the caller does not own.

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','models','model_versions','datasets','monitoring_runs',
    'drift_results','performance_results','ai_explanations','alerts',
    'reports','settings','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_only', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)',
      t || '_owner_only', t
    );
  END LOOP;
END $$;

COMMIT;
