import supabase from './db-client.js';
import { audit, cors, getSettings, parseBody, rateLimit, requireUser } from './_lib/auth.js';
import { runMonitoring } from './_lib/engine.js';

/**
 * Monitoring runs.
 *   GET  /api/monitoring                      -> paginated history (filters)
 *   GET  /api/monitoring?id=1                 -> full run detail
 *   GET  /api/monitoring?compare=1&a=1&b=2    -> run-to-run comparison
 *   GET  /api/monitoring?resource=trend       -> drift trend series
 *   POST /api/monitoring                      -> execute a run
 *   DELETE /api/monitoring                    -> delete a run and its children
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      if (req.query.id) return detail(req, res, user);
      if (req.query.compare) return compare(req, res, user);
      if (req.query.resource === 'trend') return trend(req, res, user);
      return list(req, res, user);
    }
    if (req.method === 'POST') {
      if (!rateLimit('run:' + user.id, 20, 60000)) {
        return res.status(429).json({ error: 'Monitoring runs are limited to 20 per minute.' });
      }
      return execute(req, res, user);
    }
    if (req.method === 'DELETE') return remove(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('monitoring error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function list(req, res, user) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(Number(req.query.page_size || 10), 100);
  let q = supabase
    .from('monitoring_runs')
    .select('id,project_id,model_id,reference_dataset_id,current_dataset_id,name,status,overall_status,drift_share,drifted_features,total_features,significant_features,performance,concept_drift,duration_ms,is_demo,created_at', { count: 'exact' })
    .eq('user_id', user.id);
  if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
  if (req.query.model_id) q = q.eq('model_id', req.query.model_id);
  if (req.query.overall_status) q = q.eq('overall_status', req.query.overall_status);
  if (req.query.from) q = q.gte('created_at', req.query.from);
  if (req.query.to) q = q.lte('created_at', req.query.to);
  if (req.query.search) q = q.ilike('name', '%' + req.query.search + '%');
  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;

  const projectIds = [...new Set(data.map((r) => r.project_id).filter(Boolean))];
  const modelIds = [...new Set(data.map((r) => r.model_id).filter(Boolean))];
  const [p, m] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id,name').in('id', projectIds) : { data: [] },
    modelIds.length ? supabase.from('models').select('id,name,task_type').in('id', modelIds) : { data: [] },
  ]);
  const pMap = new Map((p.data || []).map((x) => [x.id, x]));
  const mMap = new Map((m.data || []).map((x) => [x.id, x]));
  return res.status(200).json({
    items: data.map((r) => ({
      ...r,
      project_name: pMap.get(r.project_id) ? pMap.get(r.project_id).name : null,
      model_name: mMap.get(r.model_id) ? mMap.get(r.model_id).name : null,
      task_type: mMap.get(r.model_id) ? mMap.get(r.model_id).task_type : null,
    })),
    total: count || 0,
    page,
    page_size: pageSize,
  });
}

async function detail(req, res, user) {
  const { data: run, error } = await supabase
    .from('monitoring_runs')
    .select('*')
    .eq('id', req.query.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!run) return res.status(404).json({ error: 'Monitoring run not found.' });

  const [drift, perf, ai, alerts, project, model, refDs, curDs] = await Promise.all([
    supabase.from('drift_results').select('*').eq('run_id', run.id).eq('user_id', user.id).order('drift_score', { ascending: false }),
    supabase.from('performance_results').select('*').eq('run_id', run.id).eq('user_id', user.id),
    supabase.from('ai_explanations').select('*').eq('run_id', run.id).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('alerts').select('*').eq('run_id', run.id).eq('user_id', user.id).order('created_at', { ascending: false }),
    run.project_id ? supabase.from('projects').select('id,name').eq('id', run.project_id).maybeSingle() : { data: null },
    run.model_id ? supabase.from('models').select('*').eq('id', run.model_id).maybeSingle() : { data: null },
    run.reference_dataset_id ? supabase.from('datasets').select('id,name,kind,row_count,column_count,quality,validation').eq('id', run.reference_dataset_id).maybeSingle() : { data: null },
    run.current_dataset_id ? supabase.from('datasets').select('id,name,kind,row_count,column_count,quality,validation').eq('id', run.current_dataset_id).maybeSingle() : { data: null },
  ]);

  return res.status(200).json({
    run,
    drift_results: drift.data || [],
    performance_results: perf.data || [],
    ai_explanations: ai.data || [],
    alerts: alerts.data || [],
    project: project.data || null,
    model: model.data || null,
    reference_dataset: refDs.data || null,
    current_dataset: curDs.data || null,
  });
}

async function compare(req, res, user) {
  const a = req.query.a;
  const b = req.query.b;
  if (!a || !b) return res.status(400).json({ error: 'Both run ids (a and b) are required.' });
  const { data: runs, error } = await supabase
    .from('monitoring_runs')
    .select('*')
    .in('id', [a, b])
    .eq('user_id', user.id);
  if (error) throw error;
  if (!runs || runs.length !== 2) return res.status(404).json({ error: 'One or both runs were not found.' });
  const { data: drift } = await supabase
    .from('drift_results')
    .select('run_id,feature,feature_type,psi,js_divergence,ks_pvalue,chi2_pvalue,status,drift_score')
    .in('run_id', [a, b])
    .eq('user_id', user.id);
  const runA = runs.find((r) => String(r.id) === String(a));
  const runB = runs.find((r) => String(r.id) === String(b));
  const da = (drift || []).filter((d) => String(d.run_id) === String(a));
  const db = (drift || []).filter((d) => String(d.run_id) === String(b));
  const names = [...new Set([...da.map((d) => d.feature), ...db.map((d) => d.feature)])];
  const features = names.map((n) => {
    const x = da.find((d) => d.feature === n);
    const y = db.find((d) => d.feature === n);
    return {
      feature: n,
      a_psi: x ? x.psi : null,
      b_psi: y ? y.psi : null,
      delta: x && y ? Number((y.psi - x.psi).toFixed(6)) : null,
      a_status: x ? x.status : null,
      b_status: y ? y.status : null,
    };
  });
  features.sort((p, q) => Math.abs(q.delta || 0) - Math.abs(p.delta || 0));
  return res.status(200).json({ a: runA, b: runB, features });
}

async function trend(req, res, user) {
  let q = supabase
    .from('monitoring_runs')
    .select('id,created_at,drift_share,drifted_features,total_features,overall_status,performance,model_id')
    .eq('user_id', user.id);
  if (req.query.model_id) q = q.eq('model_id', req.query.model_id);
  if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return res.status(200).json(
    (data || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      drift_share: r.drift_share,
      drifted_features: r.drifted_features,
      total_features: r.total_features,
      overall_status: r.overall_status,
      primary_metric: r.performance && r.performance.comparison ? r.performance.comparison.metric : null,
      metric_value: r.performance && r.performance.comparison ? r.performance.comparison.current : null,
      reference_value: r.performance && r.performance.comparison ? r.performance.comparison.reference : null,
    })),
  );
}

async function execute(req, res, user) {
  const started = Date.now();
  const body = parseBody(req);
  if (!body.reference_dataset_id || !body.current_dataset_id) {
    return res.status(400).json({ error: 'reference_dataset_id and current_dataset_id are required.' });
  }
  if (String(body.reference_dataset_id) === String(body.current_dataset_id)) {
    return res.status(400).json({ error: 'The reference and production datasets must be different.' });
  }

  const { data: datasets, error: dsErr } = await supabase
    .from('datasets')
    .select('*')
    .in('id', [body.reference_dataset_id, body.current_dataset_id])
    .eq('user_id', user.id);
  if (dsErr) throw dsErr;
  const refDs = (datasets || []).find((d) => String(d.id) === String(body.reference_dataset_id));
  const curDs = (datasets || []).find((d) => String(d.id) === String(body.current_dataset_id));
  if (!refDs || !curDs) return res.status(404).json({ error: 'One or both datasets were not found.' });

  let model = null;
  if (body.model_id) {
    const { data } = await supabase.from('models').select('*').eq('id', body.model_id).eq('user_id', user.id).maybeSingle();
    if (!data) return res.status(404).json({ error: 'Model not found.' });
    model = data;
  }

  const settings = await getSettings(user.id);
  const config = {
    psi_low: Number(body.psi_low !== undefined ? body.psi_low : settings.psi_low),
    psi_high: Number(body.psi_high !== undefined ? body.psi_high : settings.psi_high),
    ks_alpha: Number(settings.ks_alpha),
    chi2_alpha: Number(settings.chi2_alpha),
    js_threshold: Number(settings.js_threshold),
    drift_share_threshold: Number(settings.drift_share_threshold),
    perf_degradation_threshold: Number(settings.perf_degradation_threshold),
    bins: Number(body.bins !== undefined ? body.bins : settings.bins),
  };

  const referenceRows = Array.isArray(refDs.data) ? refDs.data : [];
  const currentRows = Array.isArray(curDs.data) ? curDs.data : [];
  if (!referenceRows.length || !currentRows.length) {
    return res.status(400).json({ error: 'One of the selected datasets contains no rows.' });
  }

  const result = runMonitoring({
    referenceRows,
    currentRows,
    config,
    model: model || {},
    excludeColumns: Array.isArray(body.exclude_columns) ? body.exclude_columns : [],
  });

  const now = new Date().toISOString();
  const name =
    (body.name && String(body.name).slice(0, 160)) ||
    (model ? model.name : 'dataset') + ' · ' + refDs.name + ' vs ' + curDs.name;

  const { data: run, error: runErr } = await supabase
    .from('monitoring_runs')
    .insert({
      user_id: user.id,
      project_id: body.project_id || refDs.project_id,
      model_id: body.model_id || null,
      reference_dataset_id: refDs.id,
      current_dataset_id: curDs.id,
      name,
      status: 'completed',
      overall_status: result.summary.overall_status,
      drift_share: result.summary.drift_share,
      drifted_features: result.summary.drifted_features,
      significant_features: result.summary.significant_features,
      total_features: result.summary.total_features,
      config,
      summary: result.summary,
      performance: result.performance,
      concept_drift: result.concept_drift,
      prediction_drift: result.prediction_drift,
      target_drift: result.target_drift,
      schema_diff: result.schema,
      validation: result.validation,
      duration_ms: Date.now() - started,
      is_demo: !!refDs.is_demo && !!curDs.is_demo,
      created_at: now,
    })
    .select()
    .single();
  if (runErr) throw runErr;

  const driftRows = result.features.map((f) => ({
    user_id: user.id,
    run_id: run.id,
    kind: 'feature',
    feature: f.feature,
    feature_type: f.feature_type,
    psi: f.psi,
    ks_statistic: f.ks_statistic,
    ks_pvalue: f.ks_pvalue,
    chi2_statistic: f.chi2_statistic,
    chi2_pvalue: f.chi2_pvalue,
    chi2_df: f.chi2_df,
    js_divergence: f.js_divergence,
    drift_score: f.drift_score,
    status: f.status,
    reference_stats: f.reference_stats,
    current_stats: f.current_stats,
    new_categories: f.new_categories,
    missing_categories: f.missing_categories,
    distribution: f.distribution,
    created_at: now,
  }));
  for (const extra of [result.prediction_drift, result.target_drift]) {
    if (!extra) continue;
    driftRows.push({
      user_id: user.id,
      run_id: run.id,
      kind: extra.kind,
      feature: extra.feature,
      feature_type: extra.feature_type,
      psi: extra.psi,
      ks_statistic: extra.ks_statistic,
      ks_pvalue: extra.ks_pvalue,
      chi2_statistic: extra.chi2_statistic,
      chi2_pvalue: extra.chi2_pvalue,
      chi2_df: extra.chi2_df,
      js_divergence: extra.js_divergence,
      drift_score: extra.drift_score,
      status: extra.status,
      reference_stats: extra.reference_stats,
      current_stats: extra.current_stats,
      new_categories: extra.new_categories,
      missing_categories: extra.missing_categories,
      distribution: extra.distribution,
      created_at: now,
    });
  }
  if (driftRows.length) {
    const { error } = await supabase.from('drift_results').insert(driftRows);
    if (error) throw error;
  }

  const perfRows = [];
  for (const scope of ['reference', 'current']) {
    const m = result.performance[scope];
    if (!m) continue;
    perfRows.push({
      user_id: user.id,
      run_id: run.id,
      model_id: body.model_id || null,
      scope,
      task_type: m.taskType,
      metrics: m,
      confusion_matrix: m.matrix ? { labels: m.labels, matrix: m.matrix } : null,
      degraded: scope === 'current' && result.performance.comparison ? result.performance.comparison.degraded : false,
      created_at: now,
    });
  }
  if (perfRows.length) await supabase.from('performance_results').insert(perfRows);

  if (result.alerts.length && settings.notifications_enabled !== false) {
    await supabase.from('alerts').insert(
      result.alerts.map((a) => ({
        user_id: user.id,
        project_id: run.project_id,
        model_id: run.model_id,
        run_id: run.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        status: 'open',
        metadata: a.metadata || {},
        created_at: now,
      })),
    );
  }

  await audit(user.id, 'execute', 'monitoring_run', run.id, {
    overall_status: run.overall_status,
    drift_share: run.drift_share,
  });

  return res.status(201).json({ run, summary: result.summary, alerts_created: result.alerts.length });
}

async function remove(req, res, user) {
  const id = parseBody(req).id || req.query.id;
  if (!id) return res.status(400).json({ error: 'id is required.' });
  const { data: owned } = await supabase.from('monitoring_runs').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!owned) return res.status(404).json({ error: 'Monitoring run not found.' });
  await supabase.from('drift_results').delete().eq('run_id', id).eq('user_id', user.id);
  await supabase.from('performance_results').delete().eq('run_id', id).eq('user_id', user.id);
  await supabase.from('ai_explanations').delete().eq('run_id', id).eq('user_id', user.id);
  await supabase.from('alerts').delete().eq('run_id', id).eq('user_id', user.id);
  await supabase.from('reports').delete().eq('run_id', id).eq('user_id', user.id);
  const { error } = await supabase.from('monitoring_runs').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  await audit(user.id, 'delete', 'monitoring_run', id, {});
  return res.status(200).json({ ok: true });
}
