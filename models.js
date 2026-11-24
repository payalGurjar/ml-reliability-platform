import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';

const TASK_TYPES = ['classification', 'regression'];

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('models:' + user.id)) return res.status(429).json({ error: 'Too many requests. Please slow down.' });

  const resource = req.query.resource || parseBody(req).resource;

  try {
    /* ------------------------------ versions ----------------------------- */
    if (resource === 'versions') {
      if (req.method === 'GET') {
        const modelId = req.query.model_id;
        if (!modelId) return res.status(400).json({ error: 'model_id is required.' });
        const { data, error } = await supabase
          .from('model_versions')
          .select('*')
          .eq('user_id', user.id)
          .eq('model_id', modelId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (req.method === 'POST') {
        const body = parseBody(req);
        if (!body.model_id || !body.version) return res.status(400).json({ error: 'model_id and version are required.' });
        const { data: owned } = await supabase.from('models').select('id').eq('id', body.model_id).eq('user_id', user.id).maybeSingle();
        if (!owned) return res.status(404).json({ error: 'Model not found.' });
        if (body.is_active) {
          await supabase.from('model_versions').update({ is_active: false }).eq('model_id', body.model_id).eq('user_id', user.id);
        }
        const { data, error } = await supabase
          .from('model_versions')
          .insert({
            user_id: user.id,
            model_id: body.model_id,
            version: String(body.version).slice(0, 60),
            notes: String(body.notes || '').slice(0, 1000),
            metadata: body.metadata || {},
            is_active: !!body.is_active,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        await audit(user.id, 'create', 'model_version', data.id, { model_id: body.model_id, version: body.version });
        return res.status(201).json(data);
      }
      if (req.method === 'DELETE') {
        const id = parseBody(req).id || req.query.id;
        if (!id) return res.status(400).json({ error: 'id is required.' });
        const { error } = await supabase.from('model_versions').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    /* ------------------------------- models ------------------------------ */
    if (req.method === 'GET') {
      let q = supabase.from('models').select('*').eq('user_id', user.id);
      if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
      if (req.query.id) q = q.eq('id', req.query.id);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      const ids = data.map((m) => m.id);
      let runs = [];
      let versions = [];
      if (ids.length) {
        const [r, v] = await Promise.all([
          supabase.from('monitoring_runs').select('id,model_id,overall_status,drift_share,created_at').eq('user_id', user.id).in('model_id', ids).order('created_at', { ascending: false }),
          supabase.from('model_versions').select('id,model_id,version,is_active').eq('user_id', user.id).in('model_id', ids),
        ]);
        runs = r.data || [];
        versions = v.data || [];
      }
      const enriched = data.map((m) => {
        const mr = runs.filter((r) => r.model_id === m.id);
        const active = versions.find((v) => v.model_id === m.id && v.is_active);
        return {
          ...m,
          run_count: mr.length,
          version_count: versions.filter((v) => v.model_id === m.id).length,
          active_version: active ? active.version : null,
          last_run_at: mr[0] ? mr[0].created_at : null,
          last_status: mr[0] ? mr[0].overall_status : null,
          last_drift_share: mr[0] ? mr[0].drift_share : null,
        };
      });
      return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const name = (body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Model name is required.' });
      if (!body.project_id) return res.status(400).json({ error: 'project_id is required.' });
      if (!TASK_TYPES.includes(body.task_type)) {
        return res.status(400).json({ error: 'task_type must be "classification" or "regression".' });
      }
      const { data: project } = await supabase.from('projects').select('id').eq('id', body.project_id).eq('user_id', user.id).maybeSingle();
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('models')
        .insert({
          user_id: user.id,
          project_id: body.project_id,
          name: name.slice(0, 120),
          description: String(body.description || '').slice(0, 2000),
          task_type: body.task_type,
          target_column: body.target_column || null,
          prediction_column: body.prediction_column || null,
          probability_column: body.probability_column || null,
          framework: String(body.framework || '').slice(0, 120),
          owner: String(body.owner || '').slice(0, 120),
          status: body.status || 'active',
          metadata: body.metadata || {},
          is_demo: false,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      if (body.version) {
        await supabase.from('model_versions').insert({
          user_id: user.id,
          model_id: data.id,
          version: String(body.version).slice(0, 60),
          notes: 'Initial version registered with the model.',
          metadata: body.metadata || {},
          is_active: true,
          created_at: now,
        });
      }
      await audit(user.id, 'create', 'model', data.id, { name, task_type: body.task_type });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      if (!body.id) return res.status(400).json({ error: 'id is required.' });
      if (body.task_type && !TASK_TYPES.includes(body.task_type)) {
        return res.status(400).json({ error: 'task_type must be "classification" or "regression".' });
      }
      const patch = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'description', 'task_type', 'target_column', 'prediction_column', 'probability_column', 'framework', 'owner', 'status', 'metadata']) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (patch.name !== undefined && !String(patch.name).trim()) {
        return res.status(400).json({ error: 'Model name cannot be empty.' });
      }
      const { data, error } = await supabase.from('models').update(patch).eq('id', body.id).eq('user_id', user.id).select().single();
      if (error) throw error;
      await audit(user.id, 'update', 'model', body.id, patch);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { data: owned } = await supabase.from('models').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!owned) return res.status(404).json({ error: 'Model not found.' });
      const { data: runIds } = await supabase.from('monitoring_runs').select('id').eq('model_id', id).eq('user_id', user.id);
      const rids = (runIds || []).map((r) => r.id);
      if (rids.length) {
        await supabase.from('drift_results').delete().in('run_id', rids);
        await supabase.from('performance_results').delete().in('run_id', rids);
        await supabase.from('ai_explanations').delete().in('run_id', rids);
        await supabase.from('reports').delete().in('run_id', rids);
      }
      await supabase.from('alerts').delete().eq('model_id', id).eq('user_id', user.id);
      await supabase.from('monitoring_runs').delete().eq('model_id', id).eq('user_id', user.id);
      await supabase.from('model_versions').delete().eq('model_id', id).eq('user_id', user.id);
      await supabase.from('datasets').update({ model_id: null }).eq('model_id', id).eq('user_id', user.id);
      const { error } = await supabase.from('models').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'delete', 'model', id, {});
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('models error:', err);
    return res.status(500).json({ error: err.message });
  }
}
