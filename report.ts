import { api } from './api';
import type { AiExplanation, Alert, Dataset, DriftResult, Metrics, Model, MonitoringRun, Project } from './types';
import { dateTime, nf, pf, pvalue } from './format';

export interface ReportPayload {
  run: MonitoringRun;
  drift_results: DriftResult[];
  performance_results: { scope: string; task_type: string; metrics: Metrics; degraded: boolean }[];
  ai_explanation: AiExplanation | null;
  alerts: Alert[];
  project: Project | null;
  model: Model | null;
  reference_dataset: Dataset | null;
  current_dataset: Dataset | null;
  generated_at: string;
}

export async function fetchReportPayload(runId: number | string) {
  return api.get<ReportPayload>('/api/reports', { build: 1, run_id: runId });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function metricRows(m: Metrics | null | undefined, scope: string): string[][] {
  if (!m) return [[scope, 'not evaluated', '']];
  if (m.taskType === 'regression') {
    return [
      [scope, 'MAE', nf(m.mae, 6)],
      [scope, 'MSE', nf(m.mse, 6)],
      [scope, 'RMSE', nf(m.rmse, 6)],
      [scope, 'R2', nf(m.r2, 6)],
      [scope, 'MAPE %', m.mape === null ? 'n/a' : nf(m.mape, 4)],
      [scope, 'Samples', String(m.n)],
    ];
  }
  return [
    [scope, 'Accuracy', nf(m.accuracy, 6)],
    [scope, 'Precision (weighted)', nf(m.precision, 6)],
    [scope, 'Recall (weighted)', nf(m.recall, 6)],
    [scope, 'F1 (weighted)', nf(m.f1, 6)],
    [scope, 'F1 (macro)', nf(m.macro?.f1, 6)],
    [scope, 'ROC-AUC', m.rocAuc === null ? 'n/a (needs probabilities)' : nf(m.rocAuc, 6)],
    [scope, 'Samples', String(m.n)],
  ];
}

/* --------------------------------- CSV ----------------------------------- */

export function buildCsv(p: ReportPayload): string {
  const lines: string[] = [];
  const row = (...cells: unknown[]) => lines.push(cells.map(esc).join(','));

  row('DriftWatch monitoring report');
  row('Generated at', p.generated_at);
  row('Run', p.run.name);
  row('Project', p.project?.name || '');
  row('Model', p.model?.name || 'none');
  row('Task type', p.model?.task_type || 'n/a');
  row('Executed at', p.run.created_at);
  row('Overall status', p.run.overall_status);
  row('Drifted features', p.run.drifted_features);
  row('Significant features', p.run.significant_features);
  row('Total features', p.run.total_features);
  row('Drift share', p.run.drift_share);
  row('Duration ms', p.run.duration_ms);
  row('');

  row('THRESHOLD CONFIGURATION');
  row('Parameter', 'Value');
  for (const [k, v] of Object.entries(p.run.config || {})) row(k, v);
  row('');

  row('DATASET COMPARISON');
  row('Property', 'Reference', 'Production');
  row('Name', p.reference_dataset?.name || '', p.current_dataset?.name || '');
  row('Rows', p.reference_dataset?.row_count ?? '', p.current_dataset?.row_count ?? '');
  row('Columns', p.reference_dataset?.column_count ?? '', p.current_dataset?.column_count ?? '');
  row('Missing %', p.reference_dataset?.quality?.missing_pct ?? '', p.current_dataset?.quality?.missing_pct ?? '');
  row('Duplicate rows', p.reference_dataset?.quality?.duplicate_rows ?? '', p.current_dataset?.quality?.duplicate_rows ?? '');
  row('');

  row('DRIFT RESULTS');
  row(
    'kind',
    'feature',
    'type',
    'status',
    'psi',
    'ks_statistic',
    'ks_pvalue',
    'chi2_statistic',
    'chi2_df',
    'chi2_pvalue',
    'js_divergence',
    'reference_mean',
    'current_mean',
    'reference_std',
    'current_std',
    'reference_missing_pct',
    'current_missing_pct',
    'new_categories',
    'missing_categories',
  );
  for (const d of p.drift_results) {
    row(
      d.kind,
      d.feature,
      d.feature_type,
      d.status,
      d.psi,
      d.ks_statistic,
      d.ks_pvalue,
      d.chi2_statistic,
      d.chi2_df,
      d.chi2_pvalue,
      d.js_divergence,
      d.reference_stats?.mean ?? '',
      d.current_stats?.mean ?? '',
      d.reference_stats?.std ?? '',
      d.current_stats?.std ?? '',
      d.reference_stats?.missing_pct ?? '',
      d.current_stats?.missing_pct ?? '',
      (d.new_categories || []).join('|'),
      (d.missing_categories || []).join('|'),
    );
  }
  row('');

  row('MODEL PERFORMANCE');
  row('scope', 'metric', 'value');
  for (const pr of p.performance_results) for (const r of metricRows(pr.metrics, pr.scope)) row(...r);
  if (p.run.performance?.comparison) {
    const c = p.run.performance.comparison;
    row('comparison', c.metric + ' reference', c.reference);
    row('comparison', c.metric + ' current', c.current);
    row('comparison', 'relative change', c.relative);
    row('comparison', 'degraded', c.degraded);
  }
  row('');

  row('CONCEPT DRIFT');
  row('Evaluated', p.run.concept_drift?.evaluated);
  row('Detected', p.run.concept_drift?.detected);
  row('Classification', p.run.concept_drift?.type);
  row('Explanation', p.run.concept_drift?.explanation);
  row('');

  row('ALERTS');
  row('severity', 'type', 'status', 'title', 'message', 'created_at');
  for (const a of p.alerts) row(a.severity, a.type, a.status, a.title, a.message, a.created_at);
  row('');

  if (p.ai_explanation) {
    const ai = p.ai_explanation;
    row('AI ANALYSIS');
    row('Provider', ai.provider);
    row('Priority', ai.priority);
    row('Summary', ai.summary);
    row('Business impact', ai.business_impact);
    row('');
    row('Affected features', 'Reason');
    for (const f of ai.affected_features || []) row(f.feature, f.reason);
    row('');
    row('Root causes');
    for (const c of ai.root_causes || []) row(c);
    row('');
    row('Risks');
    for (const r of ai.risks || []) row(r);
    row('');
    row('Investigation steps');
    for (const s of ai.investigation_steps || []) row(s);
    row('');
    row('Corrective action', 'Priority');
    for (const a of ai.corrective_actions || []) row(a.action, a.priority);
  }

  return lines.join('\n');
}

export async function exportCsv(runId: number | string) {
  const payload = await fetchReportPayload(runId);
  const csv = buildCsv(payload);
  const fileName = 'driftwatch-' + slug(payload.run.name) + '-' + payload.run.id + '.csv';
  download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fileName);
  await api.post('/api/reports', {
    run_id: payload.run.id,
    format: 'csv',
    title: payload.run.name,
    file_name: fileName,
    sections: ['summary', 'config', 'datasets', 'drift', 'performance', 'concept_drift', 'alerts', 'ai_analysis'],
  });
  return fileName;
}

/* --------------------------------- PDF ----------------------------------- */

export async function exportPdf(runId: number | string) {
  // Loaded on demand so the PDF toolchain stays out of the initial bundle.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const p = await fetchReportPayload(runId);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = 0;

  const ensure = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 50;
    }
  };

  const heading = (text: string) => {
    ensure(40);
    y += 18;
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20, 24, 31);
    doc.text(text, M, y);
    y += 6;
    doc.setDrawColor(222, 228, 235).line(M, y, W - M, y);
    y += 12;
  };

  const para = (text: string, size = 9.5) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(60, 68, 80);
    const lines = doc.splitTextToSize(text, W - M * 2) as string[];
    for (const line of lines) {
      ensure(16);
      doc.text(line, M, y);
      y += size + 3.5;
    }
    y += 2;
  };

  const bullets = (items: string[]) => {
    for (const item of items) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(60, 68, 80);
      const lines = doc.splitTextToSize(item, W - M * 2 - 14) as string[];
      lines.forEach((line, i) => {
        ensure(16);
        if (i === 0) doc.text('•', M, y);
        doc.text(line, M + 14, y);
        y += 13;
      });
      y += 2;
    }
  };

  const table = (head: string[], body: (string | number)[][]) => {
    ensure(60);
    autoTable(doc, {
      head: [head],
      body: body.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))),
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 7.8, cellPadding: 3.4, textColor: [48, 56, 68], lineColor: [226, 231, 238], lineWidth: 0.4 },
      headStyles: { fillColor: [24, 28, 36], textColor: [245, 247, 250], fontSize: 7.8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 251] },
      theme: 'grid',
    });
    const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (after ? after.finalY : y) + 10;
  };

  /* Cover */
  doc.setFillColor(14, 17, 22).rect(0, 0, W, 108, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(255, 255, 255);
  doc.text('ML Reliability Report', M, 48);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(190, 198, 210);
  doc.text(p.run.name, M, 68);
  doc.setFontSize(8.5).setTextColor(150, 160, 175);
  doc.text('DriftWatch · generated ' + dateTime(p.generated_at), M, 86);
  y = 132;

  heading('Executive summary');
  para(
    'Run executed ' +
      dateTime(p.run.created_at) +
      ' for project "' +
      (p.project?.name || 'n/a') +
      '"' +
      (p.model ? ' and model "' + p.model.name + '" (' + p.model.task_type + ')' : ' (no model attached)') +
      '. Overall status: ' +
      p.run.overall_status.toUpperCase() +
      '. ' +
      p.run.drifted_features +
      ' of ' +
      p.run.total_features +
      ' monitored features (' +
      pf(p.run.drift_share) +
      ') exceeded the configured drift thresholds, of which ' +
      p.run.significant_features +
      ' reached the significant band.',
  );

  table(
    ['Metric', 'Value'],
    [
      ['Overall status', p.run.overall_status],
      ['Features monitored', p.run.total_features],
      ['Features drifted', p.run.drifted_features],
      ['Significant drift', p.run.significant_features],
      ['Drift share', pf(p.run.drift_share)],
      ['Reference rows', p.run.summary?.reference_rows ?? '—'],
      ['Production rows', p.run.summary?.current_rows ?? '—'],
      ['Open alerts from this run', p.alerts.filter((a) => a.status === 'open').length],
      ['Execution time', p.run.duration_ms + ' ms'],
    ],
  );

  heading('Threshold configuration');
  table(
    ['Parameter', 'Value'],
    Object.entries(p.run.config || {}).map(([k, v]) => [k, String(v)]),
  );

  heading('Dataset comparison');
  table(
    ['Property', 'Reference', 'Production'],
    [
      ['Name', p.reference_dataset?.name || '—', p.current_dataset?.name || '—'],
      ['Rows', p.reference_dataset?.row_count ?? '—', p.current_dataset?.row_count ?? '—'],
      ['Columns', p.reference_dataset?.column_count ?? '—', p.current_dataset?.column_count ?? '—'],
      ['Missing %', nf(p.reference_dataset?.quality?.missing_pct, 2), nf(p.current_dataset?.quality?.missing_pct, 2)],
      ['Duplicate rows', p.reference_dataset?.quality?.duplicate_rows ?? '—', p.current_dataset?.quality?.duplicate_rows ?? '—'],
    ],
  );
  if (p.run.schema_diff?.changed) {
    para(
      'Schema changes detected — added: ' +
        (p.run.schema_diff.added.join(', ') || 'none') +
        '; removed: ' +
        (p.run.schema_diff.removed.join(', ') || 'none') +
        '; retyped: ' +
        (p.run.schema_diff.type_changed.map((t) => t.column + ' ' + t.from + '->' + t.to).join(', ') || 'none') +
        '.',
    );
  }

  heading('Feature drift results');
  table(
    ['Feature', 'Type', 'Status', 'PSI', 'KS', 'KS p', 'Chi2', 'Chi2 p', 'JS'],
    p.drift_results
      .filter((d) => d.kind === 'feature')
      .map((d) => [
        d.feature,
        d.feature_type,
        d.status,
        nf(d.psi, 4),
        nf(d.ks_statistic, 4),
        pvalue(d.ks_pvalue),
        nf(d.chi2_statistic, 2),
        pvalue(d.chi2_pvalue),
        nf(d.js_divergence, 4),
      ]),
  );

  const predRow = p.drift_results.find((d) => d.kind === 'prediction');
  if (predRow) {
    heading('Prediction drift');
    para(
      'Model output "' +
        predRow.feature +
        '" — status ' +
        predRow.status +
        ', PSI ' +
        nf(predRow.psi, 4) +
        ', JS ' +
        nf(predRow.js_divergence, 4) +
        (predRow.ks_pvalue !== null ? ', KS p ' + pvalue(predRow.ks_pvalue) : '') +
        (predRow.chi2_pvalue !== null ? ', chi-square p ' + pvalue(predRow.chi2_pvalue) : '') +
        '.',
    );
  }

  heading('Model performance');
  if (p.performance_results.length) {
    const rows: (string | number)[][] = [];
    for (const pr of p.performance_results) for (const r of metricRows(pr.metrics, pr.scope)) rows.push(r);
    table(['Scope', 'Metric', 'Value'], rows);
    const c = p.run.performance?.comparison;
    if (c) {
      para(
        'Primary metric ' +
          c.metric.toUpperCase() +
          ' moved from ' +
          nf(c.reference, 4) +
          ' to ' +
          nf(c.current, 4) +
          ' (' +
          (c.relative * 100).toFixed(2) +
          '%). Degradation threshold ' +
          pf(p.run.config?.perf_degradation_threshold ?? 0.05) +
          ' — ' +
          (c.degraded ? 'EXCEEDED, severity ' + c.severity + '.' : 'not exceeded.'),
      );
    }
  } else {
    para('Performance was not evaluated: the run had no model with usable target and prediction columns.');
  }

  heading('Concept drift');
  para(p.run.concept_drift?.explanation || 'Not evaluated.');

  heading('Alerts');
  if (p.alerts.length) {
    table(
      ['Severity', 'Type', 'Status', 'Title', 'Detail'],
      p.alerts.map((a) => [a.severity, a.type, a.status, a.title, a.message]),
    );
  } else {
    para('No alerts were raised by this run.');
  }

  if (p.ai_explanation) {
    const ai = p.ai_explanation;
    heading('AI analysis and root-cause assessment');
    para('Provider: ' + ai.provider + (ai.llm_model ? ' (' + ai.llm_model + ')' : '') + ' · Priority: ' + ai.priority);
    para(ai.summary);

    if (ai.affected_features?.length) {
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20, 24, 31);
      ensure(20);
      doc.text('Most affected features', M, y);
      y += 14;
      table(['Feature', 'Evidence'], ai.affected_features.map((f) => [f.feature, f.reason]));
    }
    if (ai.root_causes?.length) {
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20, 24, 31);
      ensure(20);
      doc.text('Possible root causes', M, y);
      y += 14;
      bullets(ai.root_causes);
    }
    heading('Business impact');
    para(ai.business_impact);
    if (ai.risks?.length) {
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20, 24, 31);
      ensure(20);
      doc.text('Model reliability risks', M, y);
      y += 14;
      bullets(ai.risks);
    }
    if (ai.investigation_steps?.length) {
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20, 24, 31);
      ensure(20);
      doc.text('Recommended investigation steps', M, y);
      y += 14;
      bullets(ai.investigation_steps);
    }
    if (ai.corrective_actions?.length) {
      heading('Corrective actions');
      table(['Priority', 'Action'], ai.corrective_actions.map((a) => [a.priority, a.action]));
    }
  } else {
    heading('AI analysis');
    para('No AI analysis has been generated for this run. Generate one from the run detail page to include it here.');
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(150, 158, 170);
    doc.text('DriftWatch ML Reliability Platform', M, doc.internal.pageSize.getHeight() - 24);
    doc.text('Page ' + i + ' of ' + pages, W - M, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
  }

  const fileName = 'driftwatch-' + slug(p.run.name) + '-' + p.run.id + '.pdf';
  doc.save(fileName);
  await api.post('/api/reports', {
    run_id: p.run.id,
    format: 'pdf',
    title: p.run.name,
    file_name: fileName,
    sections: ['summary', 'config', 'datasets', 'drift', 'prediction_drift', 'performance', 'concept_drift', 'alerts', 'ai_analysis'],
  });
  return fileName;
}
