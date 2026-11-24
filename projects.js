import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('projects:' + user.id)) return res.status(429).json({ error: 'Too many requests. Please slow down.' });

  try {
    if (req.method === 'GET') {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = projects.map((p) => p.id);
      let models = [];
      let datasets = [];
      let runs = [];
      if (ids.length) {
        const [m, d, r] = await Promise.all([
          supabase.from('models').select('id,project_id,task_type,status').eq('user_id', user.id).in('project_id', ids),
          supabase.from('datasets').select('id,project_id').eq('user_id', user.id).in('project_id', ids),
          supabase.from('monitoring_runs').select('id,project_id,overall_status,created_at').eq('user_id', user.id).in('project_id', ids),
        ]);
        models = m.data || [];
        datasets = d.data || [];
        runs = r.data || [];
      }
      const enriched = projects.map((p) => {
        const pr = runs.filter((r) => r.project_id === p.id);
        pr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return {
          ...p,
          model_count: models.filter((m) => m.project_id === p.id).length,
          dataset_count: datasets.filter((d) => d.project_id === p.id).length,
          run_count: pr.length,
          last_run_at: pr[0] ? pr[0].created_at : null,
          last_status: pr[0] ? pr[0].overall_status : null,
        };
      });
      return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const name = (body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Project name is required.' });
      if (name.length > 120) return res.status(400).json({ error: 'Project name must be 120 characters or fewer.' });
      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name,
          description: (body.description || '').slice(0, 2000),
          environment: body.environment || 'production',
          is_demo: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      await audit(user.id, 'create', 'project', data.id, { name });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      if (!body.id) return res.status(400).json({ error: 'id is required.' });
      const patch = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) {
        if (!String(body.name).trim()) return res.status(400).json({ error: 'Project name cannot be empty.' });
        patch.name = String(body.name).trim().slice(0, 120);
      }
      if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000);
      if (body.environment !== undefined) patch.environment = body.environment;
      const { data, error } = await supabase
        .from('projects')
        .update(patch)
        .eq('id', body.id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Project not found.' });
      await audit(user.id, 'update', 'project', body.id, patch);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const body = parseBody(req);
      const id = body.id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { data: owned } = await supabase.from('projects').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!owned) return res.status(404).json({ error: 'Project not found.' });
      const { data: runIds } = await supabase.from('monitoring_runs').select('id').eq('project_id', id).eq('user_id', user.id);
      const rids = (runIds || []).map((r) => r.id);
      if (rids.length) {
        await supabase.from('drift_results').delete().in('run_id', rids);
        await supabase.from('performance_results').delete().in('run_id', rids);
        await supabase.from('ai_explanations').delete().in('run_id', rids);
        await supabase.from('reports').delete().in('run_id', rids);
      }
      await supabase.from('alerts').delete().eq('project_id', id).eq('user_id', user.id);
      await supabase.from('monitoring_runs').delete().eq('project_id', id).eq('user_id', user.id);
      await supabase.from('datasets').delete().eq('project_id', id).eq('user_id', user.id);
      const { data: modelIds } = await supabase.from('models').select('id').eq('project_id', id).eq('user_id', user.id);
      if (modelIds && modelIds.length) {
        await supabase.from('model_versions').delete().in('model_id', modelIds.map((m) => m.id));
      }
      await supabase.from('models').delete().eq('project_id', id).eq('user_id', user.id);
      const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'delete', 'project', id, {});
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('projects error:', err);
    return res.status(500).json({ error: err.message });
  }
}
