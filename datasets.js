import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';
import { MAX_ROWS, profileDataset, validateDataset } from './_lib/profile.js';

const KINDS = ['reference', 'production', 'prediction', 'ground_truth'];
const MAX_BYTES = 8 * 1024 * 1024;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!rateLimit('datasets:' + user.id, 60)) return res.status(429).json({ error: 'Too many requests. Please slow down.' });

  try {
    if (req.method === 'GET') {
      if (req.query.id) {
        const { data, error } = await supabase
          .from('datasets')
          .select('*')
          .eq('id', req.query.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Dataset not found.' });
        const rows = Array.isArray(data.data) ? data.data : [];
        const limit = Math.min(Number(req.query.preview || 50), 200);
        return res.status(200).json({ ...data, data: undefined, preview: rows.slice(0, limit) });
      }
      let q = supabase
        .from('datasets')
        .select('id,user_id,project_id,model_id,name,kind,row_count,column_count,file_name,file_size,columns,quality,validation,is_demo,created_at')
        .eq('user_id', user.id);
      if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
      if (req.query.model_id) q = q.eq('model_id', req.query.model_id);
      if (req.query.kind) q = q.eq('kind', req.query.kind);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const name = (body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Dataset name is required.' });
      if (!body.project_id) return res.status(400).json({ error: 'project_id is required.' });
      if (!KINDS.includes(body.kind)) {
        return res.status(400).json({ error: 'kind must be one of: ' + KINDS.join(', ') });
      }
      const rows = body.rows;
      if (!Array.isArray(rows) || !rows.length) {
        return res.status(400).json({ error: 'The uploaded file contained no parsable rows.' });
      }
      if (rows.length > MAX_ROWS) {
        return res.status(400).json({ error: 'Datasets are limited to ' + MAX_ROWS + ' rows. Please sample your file first.' });
      }
      const approxBytes = JSON.stringify(rows).length;
      if (approxBytes > MAX_BYTES) {
        return res.status(413).json({ error: 'Dataset payload exceeds the 8 MB limit. Please upload a smaller sample.' });
      }
      const { data: project } = await supabase.from('projects').select('id').eq('id', body.project_id).eq('user_id', user.id).maybeSingle();
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      if (body.model_id) {
        const { data: model } = await supabase.from('models').select('id').eq('id', body.model_id).eq('user_id', user.id).maybeSingle();
        if (!model) return res.status(404).json({ error: 'Model not found.' });
      }

      const profile = profileDataset(rows);
      const validation = validateDataset(profile);
      const { data, error } = await supabase
        .from('datasets')
        .insert({
          user_id: user.id,
          project_id: body.project_id,
          model_id: body.model_id || null,
          name: name.slice(0, 160),
          kind: body.kind,
          file_name: String(body.file_name || '').slice(0, 260),
          file_size: Number(body.file_size || approxBytes),
          row_count: profile.row_count,
          column_count: profile.column_count,
          columns: profile.columns,
          quality: {
            duplicate_rows: profile.duplicate_rows,
            duplicate_pct: profile.duplicate_pct,
            missing_cells: profile.missing_cells,
            missing_pct: profile.missing_pct,
          },
          validation,
          data: rows,
          is_demo: false,
          created_at: new Date().toISOString(),
        })
        .select('id,name,kind,row_count,column_count,columns,quality,validation,created_at')
        .single();
      if (error) throw error;

      if (!validation.passed) {
        await supabase.from('alerts').insert({
          user_id: user.id,
          project_id: body.project_id,
          model_id: body.model_id || null,
          run_id: null,
          type: 'data_validation',
          severity: validation.severity === 'critical' ? 'critical' : 'high',
          title: 'Data validation failed on upload: ' + name,
          message: validation.issues.filter((i) => i.level === 'high' || i.level === 'critical').map((i) => i.message).join(' '),
          status: 'open',
          metadata: { dataset_id: data.id },
          created_at: new Date().toISOString(),
        });
      }
      await audit(user.id, 'upload', 'dataset', data.id, { name, kind: body.kind, rows: profile.row_count });
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { data: owned } = await supabase.from('datasets').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!owned) return res.status(404).json({ error: 'Dataset not found.' });
      const { error } = await supabase.from('datasets').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'delete', 'dataset', id, {});
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('datasets error:', err);
    return res.status(500).json({ error: err.message });
  }
}
