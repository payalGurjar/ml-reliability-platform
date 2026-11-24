import supabase from './db-client.js';
import { DEFAULT_SETTINGS, audit, cors, getSettings, parseBody, rateLimit, requireUser } from './_lib/auth.js';
import demoWorkspace from './_lib/demo-workspace.js';

const NUMERIC = {
  psi_low: [0.001, 1],
  psi_high: [0.002, 2],
  ks_alpha: [0.0001, 0.5],
  chi2_alpha: [0.0001, 0.5],
  js_threshold: [0.001, 1],
  drift_share_threshold: [0.01, 1],
  perf_degradation_threshold: [0.001, 1],
  bins: [2, 50],
};

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('settings:' + user.id)) return res.status(429).json({ error: 'Too many requests.' });

  const resource = req.query.resource || parseBody(req).resource;

  try {
    if (resource === 'demo') return demoWorkspace(req, res, user);

    if (resource === 'audit') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'GET') {
      const settings = await getSettings(user.id);
      return res.status(200).json({
        ...settings,
        llm_configured: Boolean(process.env.LLM_API_URL && process.env.LLM_API_KEY),
        llm_model: process.env.LLM_MODEL || null,
      });
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      const patch = {};
      for (const [key, [min, max]] of Object.entries(NUMERIC)) {
        if (body[key] === undefined || body[key] === null || body[key] === '') continue;
        const v = Number(body[key]);
        if (!Number.isFinite(v) || v < min || v > max) {
          return res.status(400).json({ error: key + ' must be a number between ' + min + ' and ' + max + '.' });
        }
        patch[key] = v;
      }
      const low = patch.psi_low !== undefined ? patch.psi_low : (await getSettings(user.id)).psi_low;
      const high = patch.psi_high !== undefined ? patch.psi_high : (await getSettings(user.id)).psi_high;
      if (high <= low) return res.status(400).json({ error: 'The significant PSI threshold must be greater than the moderate threshold.' });
      if (body.notifications_enabled !== undefined) patch.notifications_enabled = !!body.notifications_enabled;
      if (body.theme !== undefined) patch.theme = body.theme === 'light' ? 'light' : 'dark';

      const existing = await supabase.from('settings').select('id').eq('user_id', user.id).maybeSingle();
      let data;
      if (existing.data) {
        const r = await supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().single();
        if (r.error) throw r.error;
        data = r.data;
      } else {
        const r = await supabase
          .from('settings')
          .insert({ ...DEFAULT_SETTINGS, ...patch, user_id: user.id, updated_at: new Date().toISOString() })
          .select()
          .single();
        if (r.error) throw r.error;
        data = r.data;
      }
      await audit(user.id, 'update', 'settings', data.id, patch);
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('settings error:', err);
    return res.status(500).json({ error: err.message });
  }
}
