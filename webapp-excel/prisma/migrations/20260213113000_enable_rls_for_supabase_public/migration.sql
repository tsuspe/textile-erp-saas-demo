DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      r.schemaname,
      r.tablename
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        'allow_service_role_full_access',
        r.schemaname,
        r.tablename
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'allow_service_role_full_access',
        r.schemaname,
        r.tablename
      );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        'allow_postgres_full_access',
        r.schemaname,
        r.tablename
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO postgres USING (true) WITH CHECK (true)',
        'allow_postgres_full_access',
        r.schemaname,
        r.tablename
      );
    END IF;
  END LOOP;
END
$$;
