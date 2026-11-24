import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';

/**
 * Reports.
 *   GET  /api/reports                 -> report history
 *   GET  /api/reports?run_id=1&build=1 -> assemble the full report payload
 *   POST /api/reports                 -> record a generated report
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('reports:' + user.id)) return res.status(429).json({ error: 'Too many requests.' });

  try {
    if (req.method === 'GET' && req.query.build) {
      const runId = req.query.run_id;
      if (!runId) return res.status(400).json({ error: 'run_id is required.' });
      const { data: run } = await supabase.from('monitoring_runs').select('*').eq('id', runId).eq('user_id', user.id).maybeSingle();
      if (!run) return res.status(404).json({ error: 'Monitoring run not found.' });
      const [drift, perf, ai, alerts, project, model, refDs, curDs] = await Promise.all([
        supabase.from('drift_results').select('*').eq('run_id', run.id).eq('user_id', user.id).order('drift_score', { ascending: false }),
        supabase.from('performance_results').select('*').eq('run_id', run.id).eq('user_id', user.id),
        supabase.from('ai_explanations').select('*').eq('run_id', run.id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('alerts').select('*').eq('run_id', run.id).eq('user_id', user.id),
        run.project_id ? supabase.from('projects').select('id,name,description').eq('id', run.project_id).maybeSingle() : { data: null },
        run.model_id ? supabase.from('models').select('*').eq('id', run.model_id).maybeSingle() : { data: null },
        run.reference_dataset_id ? supabase.from('datasets').select('id,name,kind,row_count,column_count,quality,file_name,created_at').eq('id', run.reference_dataset_id).maybeSingle() : { data: null },
        run.current_dataset_id ? supabase.from('datasets').select('id,name,kind,row_count,column_count,quality,file_name,created_at').eq('id', run.current_dataset_id).maybeSingle() : { data: null },
      ]);
      return res.status(200).json({
        run,
        drift_results: drift.data || [],
        performance_results: perf.data || [],
        ai_explanation: (ai.data || [])[0] || null,
        alerts: alerts.data || [],
        project: project.data || null,
        model: model.data || null,
        reference_dataset: refDs.data || null,
        current_dataset: curDs.data || null,
        generated_at: new Date().toISOString(),
      });
    }

    if (req.method === 'GET') {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(Number(req.query.page_size || 20), 100);
      let q = supabase.from('reports').select('*', { count: 'exact' }).eq('user_id', user.id);
      if (req.query.run_id) q = q.eq('run_id', req.query.run_id);
      if (req.query.format) q = q.eq('format', req.query.format);
      const { data, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;
      return res.status(200).json({ items: data, total: count || 0, page, page_size: pageSize });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (!body.run_id) return res.status(400).json({ error: 'run_id is required.' });
      if (!['pdf', 'csv'].includes(body.format)) return res.status(400).json({ error: 'format must be "pdf" or "csv".' });
      const { data: run } = await supabase.from('monitoring_runs').select('id,project_id,model_id,name').eq('id', body.run_id).eq('user_id', user.id).maybeSingle();
      if (!run) return res.status(404).json({ error: 'Monitoring run not found.' });
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: user.id,
          run_id: run.id,
          project_id: run.project_id,
          model_id: run.model_id,
          title: String(body.title || run.name).slice(0, 200),
          format: body.format,
          file_name: String(body.file_name || '').slice(0, 200),
          sections: body.sections || [],
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      await audit(user.id, 'export', 'report', data.id, { format: body.format, run_id: run.id });
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { error } = await supabase.from('reports').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('reports error:', err);
    return res.status(500).json({ error: err.message });
  }
}
