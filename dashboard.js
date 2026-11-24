import supabase from './db-client.js';
import { cors, requireUser } from './_lib/auth.js';

/** Aggregated dashboard state, computed entirely from stored rows. */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const [projects, models, datasets, runs, alerts] = await Promise.all([
      supabase.from('projects').select('id,name,is_demo').eq('user_id', user.id),
      supabase.from('models').select('id,name,task_type,status,project_id,is_demo').eq('user_id', user.id),
      supabase.from('datasets').select('id,kind,row_count,is_demo').eq('user_id', user.id),
      supabase
        .from('monitoring_runs')
        .select('id,name,project_id,model_id,overall_status,drift_share,drifted_features,total_features,performance,concept_drift,created_at,is_demo')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('alerts').select('id,type,severity,status,title,message,created_at,run_id,model_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
    ]);

    const runList = runs.data || [];
    const modelList = models.data || [];
    const alertList = alerts.data || [];

    // Latest run per model determines model health.
    const latestByModel = new Map();
    for (const r of runList) {
      if (!r.model_id) continue;
      if (!latestByModel.has(r.model_id)) latestByModel.set(r.model_id, r);
    }
    let healthy = 0;
    let drifted = 0;
    let unmonitored = 0;
    const modelHealth = modelList.map((m) => {
      const r = latestByModel.get(m.id);
      if (!r) {
        unmonitored += 1;
        return { ...m, health: 'unmonitored', drift_share: null, last_run_at: null, run_id: null };
      }
      const isDrifted = r.overall_status === 'drifted' || r.overall_status === 'critical';
      if (isDrifted) drifted += 1;
      else healthy += 1;
      return {
        ...m,
        health: r.overall_status,
        drift_share: r.drift_share,
        last_run_at: r.created_at,
        run_id: r.id,
        metric: r.performance && r.performance.comparison ? r.performance.comparison : null,
      };
    });

    const openAlerts = alertList.filter((a) => a.status === 'open');
    const trend = [...runList]
      .reverse()
      .slice(-30)
      .map((r) => ({
        id: r.id,
        created_at: r.created_at,
        drift_share: Number(r.drift_share || 0),
        drifted_features: r.drifted_features,
        total_features: r.total_features,
        overall_status: r.overall_status,
        metric_value: r.performance && r.performance.comparison ? r.performance.comparison.current : null,
        reference_value: r.performance && r.performance.comparison ? r.performance.comparison.reference : null,
      }));

    // Most affected features across the 10 most recent runs.
    const recentIds = runList.slice(0, 10).map((r) => r.id);
    let topFeatures = [];
    if (recentIds.length) {
      const { data: drift } = await supabase
        .from('drift_results')
        .select('feature,psi,status,feature_type,run_id')
        .eq('user_id', user.id)
        .eq('kind', 'feature')
        .in('run_id', recentIds);
      const agg = new Map();
      for (const d of drift || []) {
        const e = agg.get(d.feature) || { feature: d.feature, type: d.feature_type, total: 0, count: 0, drifted: 0, max: 0 };
        e.total += Number(d.psi || 0);
        e.count += 1;
        e.max = Math.max(e.max, Number(d.psi || 0));
        if (d.status !== 'low') e.drifted += 1;
        agg.set(d.feature, e);
      }
      topFeatures = [...agg.values()]
        .map((e) => ({ feature: e.feature, type: e.type, avg_psi: Number((e.total / e.count).toFixed(4)), max_psi: Number(e.max.toFixed(4)), drift_rate: Number((e.drifted / e.count).toFixed(3)), observations: e.count }))
        .sort((a, b) => b.avg_psi - a.avg_psi)
        .slice(0, 8);
    }

    const projectMap = new Map((projects.data || []).map((p) => [p.id, p.name]));
    const modelMap = new Map(modelList.map((m) => [m.id, m.name]));

    return res.status(200).json({
      totals: {
        projects: (projects.data || []).length,
        models: modelList.length,
        datasets: (datasets.data || []).length,
        rows_monitored: (datasets.data || []).reduce((a, d) => a + Number(d.row_count || 0), 0),
        runs: runList.length,
        healthy_models: healthy,
        drifted_models: drifted,
        unmonitored_models: unmonitored,
        open_alerts: openAlerts.length,
        critical_alerts: openAlerts.filter((a) => a.severity === 'critical').length,
        high_alerts: openAlerts.filter((a) => a.severity === 'high').length,
        has_demo: (projects.data || []).some((p) => p.is_demo),
      },
      recent_runs: runList.slice(0, 8).map((r) => ({
        ...r,
        project_name: projectMap.get(r.project_id) || null,
        model_name: modelMap.get(r.model_id) || null,
      })),
      recent_alerts: openAlerts.slice(0, 8),
      alert_breakdown: ['critical', 'high', 'medium', 'low'].map((s) => ({
        severity: s,
        open: openAlerts.filter((a) => a.severity === s).length,
        total: alertList.filter((a) => a.severity === s).length,
      })),
      drift_trend: trend,
      model_health: modelHealth,
      top_features: topFeatures,
    });
  } catch (err) {
    console.error('dashboard error:', err);
    return res.status(500).json({ error: err.message });
  }
}
