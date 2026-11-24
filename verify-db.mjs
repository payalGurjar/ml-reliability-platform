/**
 * Integration check against the live Supabase project using the anon key +
 * a real signed-in demo session. Verifies that every column the API routes
 * write actually exists, and that the engine output round-trips through the DB.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
  }),
);

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: 'demo@driftwatch.io', password: 'driftwatch123',
});
if (authErr) { console.error('AUTH FAIL', authErr.message); process.exit(1); }
const uid = auth.user.id;
console.log('signed in as', auth.user.email, uid);

const now = new Date().toISOString();
const fails = [];
async function step(name, fn) {
  try { const r = await fn(); console.log('OK  ', name); return r; }
  catch (e) { fails.push(name + ': ' + e.message); console.log('FAIL', name, '-', e.message); }
}

const proj = await step('insert project', async () => {
  const { data, error } = await sb.from('projects').insert({
    user_id: uid, name: '__verify__', description: 'x', environment: 'production',
    is_demo: false, created_at: now, updated_at: now,
  }).select().single();
  if (error) throw error; return data;
});

const model = proj && await step('insert model', async () => {
  const { data, error } = await sb.from('models').insert({
    user_id: uid, project_id: proj.id, name: 'm', description: '', task_type: 'classification',
    target_column: 'y', prediction_column: 'p', probability_column: 's', framework: 'f',
    owner: 'o', status: 'active', metadata: {}, is_demo: false, created_at: now, updated_at: now,
  }).select().single();
  if (error) throw error; return data;
});

model && await step('insert model_version', async () => {
  const { error } = await sb.from('model_versions').insert({
    user_id: uid, model_id: model.id, version: 'v1', notes: '', metadata: {}, is_active: true, created_at: now,
  });
  if (error) throw error;
});

// Build real data through the engine
const { makeScenario } = await import('../api/_lib/demo-data.js');
const { runMonitoring } = await import('../api/_lib/engine.js');
const { profileDataset, validateDataset } = await import('../api/_lib/profile.js');
const sc = makeScenario('significant');
const refRows = sc.reference.slice(0, 400);
const curRows = sc.current.slice(0, 400);

const mkDs = async (name, kind, rows) => {
  const pr = profileDataset(rows);
  const { data, error } = await sb.from('datasets').insert({
    user_id: uid, project_id: proj.id, model_id: model.id, name, kind,
    description: 'd', file_name: 'f.csv', file_size: 1234,
    row_count: pr.row_count, column_count: pr.column_count, columns: pr.columns,
    quality: { duplicate_rows: pr.duplicate_rows, duplicate_pct: pr.duplicate_pct, missing_cells: pr.missing_cells, missing_pct: pr.missing_pct },
    validation: validateDataset(pr), data: rows, is_demo: false, created_at: now,
  }).select('id,name,row_count').single();
  if (error) throw error; return data;
};
const refDs = proj && await step('insert reference dataset', () => mkDs('__verify_ref__', 'reference', refRows));
const curDs = proj && await step('insert production dataset', () => mkDs('__verify_cur__', 'production', curRows));

let result = null;
const run = refDs && curDs && await step('insert monitoring_run', async () => {
  result = runMonitoring({
    referenceRows: refRows, currentRows: curRows,
    model: { task_type: 'classification', target_column: 'default_flag', prediction_column: 'predicted_flag', probability_column: 'default_probability' },
  });
  const { data, error } = await sb.from('monitoring_runs').insert({
    user_id: uid, project_id: proj.id, model_id: model.id,
    reference_dataset_id: refDs.id, current_dataset_id: curDs.id,
    name: '__verify_run__', status: 'completed',
    overall_status: result.summary.overall_status, drift_share: result.summary.drift_share,
    drifted_features: result.summary.drifted_features, significant_features: result.summary.significant_features,
    total_features: result.summary.total_features, config: result.config, summary: result.summary,
    performance: result.performance, concept_drift: result.concept_drift,
    prediction_drift: result.prediction_drift, target_drift: result.target_drift,
    schema_diff: result.schema, validation: result.validation, duration_ms: 42,
    is_demo: false, created_at: now,
  }).select().single();
  if (error) throw error; return data;
});

run && await step('insert drift_results (' + result.features.length + ')', async () => {
  const rows = result.features.map((f) => ({
    user_id: uid, run_id: run.id, kind: 'feature', feature: f.feature, feature_type: f.feature_type,
    psi: f.psi, ks_statistic: f.ks_statistic, ks_pvalue: f.ks_pvalue,
    chi2_statistic: f.chi2_statistic, chi2_pvalue: f.chi2_pvalue, chi2_df: f.chi2_df,
    js_divergence: f.js_divergence, drift_score: f.drift_score, status: f.status,
    reference_stats: f.reference_stats, current_stats: f.current_stats,
    new_categories: f.new_categories, missing_categories: f.missing_categories,
    distribution: f.distribution, created_at: now,
  }));
  const { error } = await sb.from('drift_results').insert(rows);
  if (error) throw error;
});

run && await step('insert performance_results', async () => {
  const rows = ['reference', 'current'].filter((s) => result.performance[s]).map((s) => ({
    user_id: uid, run_id: run.id, model_id: model.id, scope: s,
    task_type: result.performance[s].taskType, metrics: result.performance[s],
    confusion_matrix: { labels: result.performance[s].labels, matrix: result.performance[s].matrix },
    degraded: s === 'current' && result.performance.comparison.degraded, created_at: now,
  }));
  const { error } = await sb.from('performance_results').insert(rows);
  if (error) throw error;
});

run && await step('insert alerts (' + result.alerts.length + ')', async () => {
  const { error } = await sb.from('alerts').insert(result.alerts.map((a) => ({
    user_id: uid, project_id: proj.id, model_id: model.id, run_id: run.id,
    type: a.type, severity: a.severity, title: a.title, message: a.message,
    status: 'open', metadata: a.metadata || {}, created_at: now,
  })));
  if (error) throw error;
});

run && await step('insert ai_explanation', async () => {
  const { buildContext, groundedAnalysis } = await import('../api/_lib/ai.js');
  const ctx = buildContext(
    { overall_status: run.overall_status, drift_share: run.drift_share, drifted_features: run.drifted_features,
      total_features: run.total_features, reference_rows: run.summary.reference_rows, current_rows: run.summary.current_rows },
    result.features, result.performance, result.concept_drift);
  const ai = groundedAnalysis(ctx);
  const { error } = await sb.from('ai_explanations').insert({
    user_id: uid, run_id: run.id, model_id: model.id, provider: ai.provider, llm_model: ai.model,
    summary: ai.summary, affected_features: ai.affected_features, root_causes: ai.root_causes,
    business_impact: ai.business_impact, risks: ai.risks, investigation_steps: ai.investigation_steps,
    corrective_actions: ai.corrective_actions, priority: ai.priority, context_snapshot: ctx, created_at: now,
  });
  if (error) throw error;
  console.log('     AI priority:', ai.priority, '| root causes:', ai.root_causes.length, '| actions:', ai.corrective_actions.length);
});

run && await step('insert report', async () => {
  const { error } = await sb.from('reports').insert({
    user_id: uid, run_id: run.id, project_id: proj.id, model_id: model.id,
    title: 't', format: 'pdf', file_name: 'f.pdf', sections: ['a'], created_at: now });
  if (error) throw error;
});

await step('upsert settings', async () => {
  await sb.from('settings').delete().eq('user_id', uid);
  const { error } = await sb.from('settings').insert({
    user_id: uid, psi_low: 0.1, psi_high: 0.2, ks_alpha: 0.05, chi2_alpha: 0.05, js_threshold: 0.1,
    drift_share_threshold: 0.3, perf_degradation_threshold: 0.05, bins: 10,
    notifications_enabled: true, theme: 'dark', llm_provider: 'builtin', updated_at: now });
  if (error) throw error;
});

await step('insert audit_log', async () => {
  const { error } = await sb.from('audit_logs').insert({
    user_id: uid, action: 'verify', entity: 'test', entity_id: '1', detail: {}, created_at: now });
  if (error) throw error;
});

run && await step('read back drift_results numeric fidelity', async () => {
  const { data, error } = await sb.from('drift_results').select('feature,psi,ks_pvalue,status').eq('run_id', run.id).order('psi', { ascending: false }).limit(3);
  if (error) throw error;
  console.log('     top:', data.map((d) => d.feature + '=' + d.psi + '(' + d.status + ')').join(' '));
  if (!data.length) throw new Error('no rows read back');
});

// cleanup
if (run) {
  await sb.from('drift_results').delete().eq('run_id', run.id);
  await sb.from('performance_results').delete().eq('run_id', run.id);
  await sb.from('ai_explanations').delete().eq('run_id', run.id);
  await sb.from('reports').delete().eq('run_id', run.id);
  await sb.from('alerts').delete().eq('run_id', run.id);
  await sb.from('monitoring_runs').delete().eq('id', run.id);
}
if (proj) {
  await sb.from('datasets').delete().eq('project_id', proj.id);
  if (model) await sb.from('model_versions').delete().eq('model_id', model.id);
  await sb.from('models').delete().eq('project_id', proj.id);
  await sb.from('projects').delete().eq('id', proj.id);
}
await sb.from('audit_logs').delete().eq('user_id', uid).eq('action', 'verify');
await sb.from('settings').delete().eq('user_id', uid);
console.log('\ncleanup done');
if (fails.length) { console.error('\nFAILURES:\n' + fails.join('\n')); process.exit(1); }
console.log('ALL DB CHECKS PASSED');
