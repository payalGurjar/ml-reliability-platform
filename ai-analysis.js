import supabase from './db-client.js';
import { audit, cors, parseBody, rateLimit, requireUser } from './_lib/auth.js';
import { buildContext, generateAnalysis } from './_lib/ai.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const runId = req.query.run_id;
      if (!runId) return res.status(400).json({ error: 'run_id is required.' });
      const { data, error } = await supabase
        .from('ai_explanations')
        .select('*')
        .eq('run_id', runId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!rateLimit('ai:' + user.id, 12, 60000)) {
        return res.status(429).json({ error: 'AI analysis is limited to 12 requests per minute.' });
      }
      const body = parseBody(req);
      if (!body.run_id) return res.status(400).json({ error: 'run_id is required.' });

      const { data: run, error: runErr } = await supabase
        .from('monitoring_runs')
        .select('*')
        .eq('id', body.run_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (runErr) throw runErr;
      if (!run) return res.status(404).json({ error: 'Monitoring run not found.' });

      const { data: features } = await supabase
        .from('drift_results')
        .select('*')
        .eq('run_id', run.id)
        .eq('user_id', user.id)
        .eq('kind', 'feature')
        .order('drift_score', { ascending: false });

      const context = buildContext(
        {
          overall_status: run.overall_status,
          drift_share: run.drift_share,
          drifted_features: run.drifted_features,
          total_features: run.total_features,
          reference_rows: run.summary ? run.summary.reference_rows : null,
          current_rows: run.summary ? run.summary.current_rows : null,
        },
        features || [],
        run.performance,
        run.concept_drift,
      );

      const analysis = await generateAnalysis(context);
      const { data, error } = await supabase
        .from('ai_explanations')
        .insert({
          user_id: user.id,
          run_id: run.id,
          model_id: run.model_id,
          provider: analysis.provider || 'builtin-statistical-reasoner',
          llm_model: analysis.model || null,
          summary: analysis.summary,
          affected_features: analysis.affected_features || [],
          root_causes: analysis.root_causes || [],
          business_impact: analysis.business_impact || '',
          risks: analysis.risks || [],
          investigation_steps: analysis.investigation_steps || [],
          corrective_actions: analysis.corrective_actions || [],
          priority: analysis.priority || 'medium',
          context_snapshot: context,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      await audit(user.id, 'generate', 'ai_explanation', data.id, { run_id: run.id, provider: data.provider });
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      const { error } = await supabase.from('ai_explanations').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('ai-analysis error:', err);
    return res.status(500).json({ error: err.message });
  }
}
