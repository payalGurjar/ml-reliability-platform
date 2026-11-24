export type TaskType = 'classification' | 'regression';
export type DriftStatus = 'low' | 'moderate' | 'significant';
export type RunStatus = 'healthy' | 'warning' | 'drifted' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  environment: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  model_count?: number;
  dataset_count?: number;
  run_count?: number;
  last_run_at?: string | null;
  last_status?: RunStatus | null;
}

export interface Model {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  task_type: TaskType;
  target_column: string | null;
  prediction_column: string | null;
  probability_column: string | null;
  framework: string | null;
  owner: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  is_demo: boolean;
  created_at: string;
  run_count?: number;
  version_count?: number;
  active_version?: string | null;
  last_run_at?: string | null;
  last_status?: RunStatus | null;
  last_drift_share?: number | null;
}

export interface ModelVersion {
  id: number;
  model_id: number;
  version: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface ColumnProfile {
  name: string;
  type: 'numerical' | 'categorical' | 'binary' | 'unknown';
  count: number;
  missing: number;
  missing_pct: number;
  unique?: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  std?: number | null;
  p25?: number;
  median?: number;
  p75?: number;
  top_values?: { value: string; count: number; pct: number }[];
}

export interface ValidationIssue {
  level: Severity;
  rule: string;
  column?: string;
  message: string;
}

export interface Dataset {
  id: number;
  project_id: number;
  model_id: number | null;
  name: string;
  kind: 'reference' | 'production' | 'prediction' | 'ground_truth';
  description?: string | null;
  file_name: string | null;
  file_size: number | null;
  row_count: number;
  column_count: number;
  columns: ColumnProfile[];
  quality: { duplicate_rows: number; duplicate_pct: number; missing_cells: number; missing_pct: number } | null;
  validation: { issues: ValidationIssue[]; passed: boolean; severity: string } | null;
  is_demo: boolean;
  created_at: string;
  preview?: Record<string, unknown>[];
}

export interface DistributionBin {
  bin: string;
  reference: number;
  current: number;
  contribution?: number;
}

export interface DriftResult {
  id: number;
  run_id: number;
  kind: 'feature' | 'prediction' | 'target';
  feature: string;
  feature_type: 'numerical' | 'categorical';
  psi: number | null;
  ks_statistic: number | null;
  ks_pvalue: number | null;
  chi2_statistic: number | null;
  chi2_pvalue: number | null;
  chi2_df: number | null;
  js_divergence: number | null;
  drift_score: number | null;
  status: DriftStatus;
  reference_stats: ColumnProfile;
  current_stats: ColumnProfile;
  new_categories: string[];
  missing_categories: string[];
  distribution: DistributionBin[];
}

export interface ClassificationMetrics {
  taskType: 'classification';
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  macro: { precision: number; recall: number; f1: number };
  weighted: { precision: number; recall: number; f1: number };
  perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
  labels: string[];
  matrix: number[][];
  n: number;
}

export interface RegressionMetrics {
  taskType: 'regression';
  mae: number;
  mse: number;
  rmse: number;
  r2: number;
  mape: number | null;
  n: number;
}

export type Metrics = ClassificationMetrics | RegressionMetrics;

export interface MetricComparison {
  metric: string;
  reference: number;
  current: number;
  delta: number;
  relative: number;
  degraded: boolean;
  severity: Severity;
}

export interface ConceptDrift {
  evaluated: boolean;
  detected: boolean;
  type: 'none' | 'concept_drift' | 'covariate_shift_driven_degradation' | 'not_evaluated';
  explanation: string;
  metric?: string;
  reference?: number;
  current?: number;
  relative_change?: number;
}

export interface RunSummary {
  total_features: number;
  drifted_features: number;
  significant_features: number;
  drift_share: number;
  overall_status: RunStatus;
  top_features: { feature: string; drift_score: number; status: DriftStatus; type: string }[];
  reference_rows: number;
  current_rows: number;
  reference_profile: { row_count: number; column_count: number; missing_pct: number; duplicate_rows: number };
  current_profile: { row_count: number; column_count: number; missing_pct: number; duplicate_rows: number };
}

export interface MonitoringRun {
  id: number;
  project_id: number;
  model_id: number | null;
  reference_dataset_id: number | null;
  current_dataset_id: number | null;
  name: string;
  status: string;
  overall_status: RunStatus;
  drift_share: number;
  drifted_features: number;
  significant_features: number;
  total_features: number;
  config: Record<string, number>;
  summary: RunSummary;
  performance: { reference: Metrics | null; current: Metrics | null; comparison: MetricComparison | null };
  concept_drift: ConceptDrift;
  prediction_drift: DriftResult | null;
  target_drift: DriftResult | null;
  schema_diff: { added: string[]; removed: string[]; type_changed: { column: string; from: string; to: string }[]; changed: boolean };
  validation: Record<string, { issues: ValidationIssue[]; passed: boolean; severity: string }>;
  duration_ms: number;
  is_demo: boolean;
  created_at: string;
  project_name?: string | null;
  model_name?: string | null;
  task_type?: TaskType | null;
}

export interface AiExplanation {
  id: number;
  run_id: number;
  provider: string;
  llm_model: string | null;
  summary: string;
  affected_features: { feature: string; reason: string }[];
  root_causes: string[];
  business_impact: string;
  risks: string[];
  investigation_steps: string[];
  corrective_actions: { action: string; priority: string }[];
  priority: Severity;
  created_at: string;
}

export interface Alert {
  id: number;
  project_id: number | null;
  model_id: number | null;
  run_id: number | null;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  status: 'open' | 'resolved';
  resolution_note: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ReportRecord {
  id: number;
  run_id: number;
  title: string;
  format: 'pdf' | 'csv';
  file_name: string;
  created_at: string;
}

export interface DashboardData {
  totals: {
    projects: number;
    models: number;
    datasets: number;
    rows_monitored: number;
    runs: number;
    healthy_models: number;
    drifted_models: number;
    unmonitored_models: number;
    open_alerts: number;
    critical_alerts: number;
    high_alerts: number;
    has_demo: boolean;
  };
  recent_runs: MonitoringRun[];
  recent_alerts: Alert[];
  alert_breakdown: { severity: Severity; open: number; total: number }[];
  drift_trend: {
    id: number;
    created_at: string;
    drift_share: number;
    drifted_features: number;
    total_features: number;
    overall_status: RunStatus;
    metric_value: number | null;
    reference_value: number | null;
  }[];
  model_health: (Model & { health: string; drift_share: number | null; last_run_at: string | null; run_id: number | null })[];
  top_features: { feature: string; type: string; avg_psi: number; max_psi: number; drift_rate: number; observations: number }[];
}

export interface AppSettings {
  psi_low: number;
  psi_high: number;
  ks_alpha: number;
  chi2_alpha: number;
  js_threshold: number;
  drift_share_threshold: number;
  perf_degradation_threshold: number;
  bins: number;
  notifications_enabled: boolean;
  theme: string;
  llm_configured: boolean;
  llm_model: string | null;
}

export interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
