-- DriftWatch — ML Reliability Platform
-- Initial schema. Applied automatically by docker-compose (see docker-compose.yml),
-- and mirrored 1:1 by the managed Supabase project used in the hosted deployment.

BEGIN;

CREATE TABLE IF NOT EXISTS projects (
  id            serial PRIMARY KEY,
  user_id       text NOT NULL,
  name          text NOT NULL,
  description   text,
  environment   text DEFAULT 'production',
  is_demo       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id);

CREATE TABLE IF NOT EXISTS models (
  id                 serial PRIMARY KEY,
  user_id            text NOT NULL,
  project_id         integer REFERENCES projects (id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  task_type          text NOT NULL CHECK (task_type IN ('classification', 'regression')),
  target_column      text,
  prediction_column  text,
  probability_column text,
  framework          text,
  owner              text,
  status             text DEFAULT 'active',
  metadata           jsonb,
  is_demo            boolean DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_models_user ON models (user_id);
CREATE INDEX IF NOT EXISTS idx_models_project ON models (project_id);

CREATE TABLE IF NOT EXISTS model_versions (
  id         serial PRIMARY KEY,
  user_id    text NOT NULL,
  model_id   integer REFERENCES models (id) ON DELETE CASCADE,
  version    text NOT NULL,
  notes      text,
  metadata   jsonb,
  is_active  boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions (model_id);

CREATE TABLE IF NOT EXISTS datasets (
  id           serial PRIMARY KEY,
  user_id      text NOT NULL,
  project_id   integer REFERENCES projects (id) ON DELETE CASCADE,
  model_id     integer REFERENCES models (id) ON DELETE SET NULL,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('reference', 'production', 'prediction', 'ground_truth')),
  description  text,
  file_name    text,
  file_size    bigint,
  row_count    integer,
  column_count integer,
  columns      jsonb,
  quality      jsonb,
  validation   jsonb,
  data         jsonb,
  is_demo      boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets (user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_project ON datasets (project_id);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id                   serial PRIMARY KEY,
  user_id              text NOT NULL,
  project_id           integer REFERENCES projects (id) ON DELETE CASCADE,
  model_id             integer REFERENCES models (id) ON DELETE CASCADE,
  reference_dataset_id integer REFERENCES datasets (id) ON DELETE SET NULL,
  current_dataset_id   integer REFERENCES datasets (id) ON DELETE SET NULL,
  name                 text,
  status               text DEFAULT 'completed',
  overall_status       text,
  drift_share          numeric,
  drifted_features     integer,
  significant_features integer,
  total_features       integer,
  config               jsonb,
  summary              jsonb,
  performance          jsonb,
  concept_drift        jsonb,
  prediction_drift     jsonb,
  target_drift         jsonb,
  schema_diff          jsonb,
  validation           jsonb,
  duration_ms          integer,
  is_demo              boolean DEFAULT false,
  created_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_user_created ON monitoring_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_model ON monitoring_runs (model_id);

CREATE TABLE IF NOT EXISTS drift_results (
  id                 serial PRIMARY KEY,
  user_id            text NOT NULL,
  run_id             integer REFERENCES monitoring_runs (id) ON DELETE CASCADE,
  kind               text DEFAULT 'feature',
  feature            text NOT NULL,
  feature_type       text,
  psi                numeric,
  ks_statistic       numeric,
  ks_pvalue          numeric,
  chi2_statistic     numeric,
  chi2_pvalue        numeric,
  chi2_df            integer,
  js_divergence      numeric,
  drift_score        numeric,
  status             text,
  reference_stats    jsonb,
  current_stats      jsonb,
  new_categories     jsonb,
  missing_categories jsonb,
  distribution       jsonb,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drift_run ON drift_results (run_id);

CREATE TABLE IF NOT EXISTS performance_results (
  id               serial PRIMARY KEY,
  user_id          text NOT NULL,
  run_id           integer REFERENCES monitoring_runs (id) ON DELETE CASCADE,
  model_id         integer REFERENCES models (id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('reference', 'current')),
  task_type        text,
  metrics          jsonb,
  confusion_matrix jsonb,
  degraded         boolean DEFAULT false,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_run ON performance_results (run_id);

CREATE TABLE IF NOT EXISTS ai_explanations (
  id                  serial PRIMARY KEY,
  user_id             text NOT NULL,
  run_id              integer REFERENCES monitoring_runs (id) ON DELETE CASCADE,
  model_id            integer REFERENCES models (id) ON DELETE SET NULL,
  provider            text,
  llm_model           text,
  summary             text,
  affected_features   jsonb,
  root_causes         jsonb,
  business_impact     text,
  risks               jsonb,
  investigation_steps jsonb,
  corrective_actions  jsonb,
  priority            text,
  context_snapshot    jsonb,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_run ON ai_explanations (run_id);

CREATE TABLE IF NOT EXISTS alerts (
  id              serial PRIMARY KEY,
  user_id         text NOT NULL,
  project_id      integer REFERENCES projects (id) ON DELETE CASCADE,
  model_id        integer REFERENCES models (id) ON DELETE CASCADE,
  run_id          integer REFERENCES monitoring_runs (id) ON DELETE CASCADE,
  type            text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title           text NOT NULL,
  message         text,
  status          text DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note text,
  resolved_at     timestamptz,
  metadata        jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id         serial PRIMARY KEY,
  user_id    text NOT NULL,
  run_id     integer REFERENCES monitoring_runs (id) ON DELETE CASCADE,
  project_id integer REFERENCES projects (id) ON DELETE CASCADE,
  model_id   integer REFERENCES models (id) ON DELETE SET NULL,
  title      text,
  format     text CHECK (format IN ('pdf', 'csv')),
  file_name  text,
  sections   jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id                         serial PRIMARY KEY,
  user_id                    text NOT NULL UNIQUE,
  psi_low                    numeric DEFAULT 0.10,
  psi_high                   numeric DEFAULT 0.20,
  ks_alpha                   numeric DEFAULT 0.05,
  chi2_alpha                 numeric DEFAULT 0.05,
  js_threshold               numeric DEFAULT 0.10,
  drift_share_threshold      numeric DEFAULT 0.30,
  perf_degradation_threshold numeric DEFAULT 0.05,
  bins                       integer DEFAULT 10,
  notifications_enabled      boolean DEFAULT true,
  theme                      text DEFAULT 'dark',
  llm_provider               text DEFAULT 'builtin',
  updated_at                 timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         serial PRIMARY KEY,
  user_id    text NOT NULL,
  action     text,
  entity     text,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id, created_at DESC);

COMMIT;
