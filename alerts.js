import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('alerts:' + user.id)) return res.status(429).json({ error: 'Too many requests.' });

  try {
    if (req.method === 'GET') {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(Number(req.query.page_size || 20), 100);
      let q = supabase.from('alerts').select('*', { count: 'exact' }).eq('user_id', user.id);
      if (req.query.status) q = q.eq('status', req.query.status);
      if (req.query.severity) q = q.eq('severity', req.query.severity);
      if (req.query.type) q = q.eq('type', req.query.type);
      if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
      if (req.query.model_id) q = q.eq('model_id', req.query.model_id);
      if (req.query.run_id) q = q.eq('run_id', req.query.run_id);
      if (req.query.from) q = q.gte('created_at', req.query.from);
      if (req.query.to) q = q.lte('created_at', req.query.to);
      if (req.query.search) q = q.or('title.ilike.%' + req.query.search + '%,message.ilike.%' + req.query.search + '%');
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;
      return res.status(200).json({ items: data, total: count || 0, page, page_size: pageSize });
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      if (!body.id && !body.ids) return res.status(400).json({ error: 'id or ids is required.' });
      const status = body.status === 'open' ? 'open' : 'resolved';
      const patch = {
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        resolution_note: body.resolution_note ? String(body.resolution_note).slice(0, 1000) : null,
      };
      if (body.ids && Array.isArray(body.ids)) {
        const { error } = await supabase.from('alerts').update(patch).in('id', body.ids).eq('user_id', user.id);
        if (error) throw error;
        await audit(user.id, status, 'alert', null, { count: body.ids.length });
        return res.status(200).json({ ok: true, updated: body.ids.length });
      }
      const { data, error } = await supabase.from('alerts').update(patch).eq('id', body.id).eq('user_id', user.id).select().single();
      if (error) throw error;
      await audit(user.id, status, 'alert', body.id, {});
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { error } = await supabase.from('alerts').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
