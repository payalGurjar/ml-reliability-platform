/**
 * Algorithm verification — run with: npm test
 * Values are checked against analytically known results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  binCounts,
  chiSquareSf,
  chiSquareTest,
  jsDivergence,
  jsNumeric,
  ksTest,
  lgamma,
  psiFromProportions,
  psiNumeric,
  quantileSorted,
  std,
  valueCounts,
} from '../api/_lib/stats.js';
import { classificationReport, compareMetrics, evaluate, regressionReport, rocAuc } from '../api/_lib/metrics.js';
import { analyseFeature, runMonitoring, DEFAULT_CONFIG } from '../api/_lib/engine.js';
import { profileDataset, validateDataset, compareSchemas } from '../api/_lib/profile.js';
import { groundedAnalysis, buildContext } from '../api/_lib/ai.js';
import { makeScenario } from '../api/_lib/demo-data.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' !== ' + b + ' (tol ' + eps + ')');

/* Deterministic generators — Math.random is not used anywhere in this codebase. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}
function normals(n, mu, sigma, seed) {
  const r = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(r(), 1e-12);
    const u2 = r();
    out.push(mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}

test('lgamma matches known factorials', () => {
  close(Math.exp(lgamma(1)), 1, 1e-9);
  close(Math.exp(lgamma(5)), 24, 1e-6);
  close(lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-10);
});

test('chi-square survival function matches published table values', () => {
  close(chiSquareSf(3.841, 1), 0.05, 2e-4);
  close(chiSquareSf(5.991, 2), 0.05, 2e-4);
  close(chiSquareSf(11.07, 5), 0.05, 2e-4);
  close(chiSquareSf(0, 3), 1, 1e-12);
});

test('quantile interpolation', () => {
  const s = [1, 2, 3, 4];
  close(quantileSorted(s, 0.5), 2.5);
  close(quantileSorted(s, 0), 1);
  close(quantileSorted(s, 1), 4);
});

test('sample std matches hand calculation', () => {
  close(std([2, 4, 4, 4, 5, 5, 7, 9]), 2.13808993529939, 1e-10);
});

test('PSI is zero for identical distributions and matches the closed form', () => {
  const ref = [0.25, 0.25, 0.25, 0.25];
  close(psiFromProportions(ref, ref).value, 0, 1e-12);
  const expected = 0.1 * Math.log(0.6 / 0.5) + -0.1 * Math.log(0.4 / 0.5);
  close(psiFromProportions([0.5, 0.5], [0.6, 0.4]).value, expected, 1e-12);
});

test('PSI on numeric samples: identical ~0, large shift > 0.2, mild shift < 0.2', () => {
  const a = normals(3000, 0, 1, 7);
  const same = psiNumeric(a, a, 10).value;
  assert.ok(same < 1e-9, 'identical PSI should be ~0, got ' + same);
  const shifted = psiNumeric(a, normals(3000, 1.2, 1, 99), 10).value;
  assert.ok(shifted > 0.2, 'large shift should exceed 0.2, got ' + shifted);
  const mild = psiNumeric(a, normals(3000, 0.15, 1, 31), 10).value;
  assert.ok(mild > 0 && mild < 0.2, 'mild shift should land below 0.2, got ' + mild);
});

test('bin counts partition the sample', () => {
  assert.deepEqual(binCounts([1, 2, 3, 4, 5], [2, 4]), [2, 2, 1]);
});

test('KS statistic equals the exact CDF gap on a known pair', () => {
  const r = ksTest([1, 2, 3, 4], [5, 6, 7, 8]);
  close(r.statistic, 1);
  assert.ok(r.pValue < 0.05, 'disjoint samples must reject H0, got p=' + r.pValue);
  const same = ksTest([1, 2, 3, 4], [1, 2, 3, 4]);
  close(same.statistic, 0);
  close(same.pValue, 1);
});

test('KS does not reject for samples from the same distribution', () => {
  const r = ksTest(normals(2000, 0, 1, 5), normals(2000, 0, 1, 500));
  assert.ok(r.pValue > 0.05, 'same distribution should not reject, got p=' + r.pValue + ' D=' + r.statistic);
});

test('Jensen-Shannon divergence respects its bounds', () => {
  close(jsDivergence([0.5, 0.5], [0.5, 0.5]), 0, 1e-12);
  close(jsDivergence([1, 0], [0, 1]), 1, 1e-12);
  const a = normals(2000, 0, 1, 11);
  assert.ok(jsNumeric(a, a) < 1e-12);
  assert.ok(jsNumeric(a, normals(2000, 3, 1, 12)) > 0.3);
});

test('chi-square test detects categorical shift and ignores stability', () => {
  const ref = valueCounts(Array(500).fill('a').concat(Array(500).fill('b')));
  const stable = valueCounts(Array(250).fill('a').concat(Array(250).fill('b')));
  const shifted = valueCounts(Array(450).fill('a').concat(Array(50).fill('b')));
  assert.ok(chiSquareTest(ref, stable).pValue > 0.05);
  const r = chiSquareTest(ref, shifted);
  assert.ok(r.pValue < 1e-6, 'p=' + r.pValue);
  assert.equal(r.df, 1);
});

test('new and missing categories are reported', () => {
  const ref = Array(100).fill('x').concat(Array(100).fill('y'));
  const cur = Array(100).fill('x').concat(Array(100).fill('z'));
  const f = analyseFeature('channel', ref, cur, DEFAULT_CONFIG);
  assert.equal(f.feature_type, 'categorical');
  assert.deepEqual(f.new_categories, ['z']);
  assert.deepEqual(f.missing_categories, ['y']);
  assert.equal(f.status, 'significant');
});

test('classification metrics match hand-computed values', () => {
  const r = classificationReport(['1', '1', '0', '0', '1', '0'], ['1', '0', '0', '0', '1', '1']);
  close(r.accuracy, 4 / 6);
  const pos = r.perClass.find((c) => c.label === '1');
  close(pos.precision, 2 / 3);
  close(pos.recall, 2 / 3);
  close(pos.f1, 2 / 3);
  assert.deepEqual(r.labels, ['0', '1']);
});

test('ROC-AUC matches known rank orderings', () => {
  close(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.3, 0.4]), 1);
  close(rocAuc([1, 1, 0, 0], [0.1, 0.2, 0.3, 0.4]), 0);
  close(rocAuc([0, 1, 0, 1], [0.1, 0.2, 0.3, 0.4]), 0.75);
  close(rocAuc([0, 1], [0.5, 0.5]), 0.5);
  assert.equal(rocAuc([1, 1], [0.1, 0.2]), null);
});

test('regression metrics match hand-computed values', () => {
  const r = regressionReport([3, -0.5, 2, 7], [2.5, 0.0, 2, 8]);
  close(r.mae, 0.5);
  close(r.mse, 0.375);
  close(r.rmse, Math.sqrt(0.375));
  close(r.r2, 0.9486081370449679, 1e-12);
});

test('evaluate() returns null without required columns and metrics with them', () => {
  const rows = [
    { y: 1, p: 1, s: 0.9 },
    { y: 0, p: 0, s: 0.1 },
    { y: 1, p: 0, s: 0.4 },
    { y: 0, p: 0, s: 0.2 },
  ];
  assert.equal(evaluate(rows, { taskType: 'classification', targetColumn: 'y' }), null);
  const m = evaluate(rows, { taskType: 'classification', targetColumn: 'y', predictionColumn: 'p', probabilityColumn: 's' });
  close(m.accuracy, 0.75);
  close(m.rocAuc, 1);
});

test('performance comparison flags degradation only beyond the threshold', () => {
  const ref = { taskType: 'classification', f1: 0.9 };
  assert.equal(compareMetrics(ref, { taskType: 'classification', f1: 0.89 }, 0.05).degraded, false);
  const bad = compareMetrics(ref, { taskType: 'classification', f1: 0.6 }, 0.05);
  assert.equal(bad.degraded, true);
  assert.equal(bad.severity, 'critical');
});

test('profiling infers types, missing values and duplicates', () => {
  const rows = [
    { age: 30, city: 'NY', score: 0.5 },
    { age: 30, city: 'NY', score: 0.5 },
    { age: 41, city: 'LA', score: null },
    { age: 55, city: 'SF', score: 0.9 },
    { age: 22, city: 'NY', score: 0.3 },
  ];
  const p = profileDataset(rows);
  assert.equal(p.row_count, 5);
  assert.equal(p.column_count, 3);
  assert.equal(p.duplicate_rows, 1);
  assert.equal(p.columns.find((c) => c.name === 'city').type, 'categorical');
  assert.equal(p.columns.find((c) => c.name === 'age').type, 'numerical');
  assert.equal(p.columns.find((c) => c.name === 'score').missing, 1);
  assert.ok(validateDataset(p).issues.some((i) => i.rule === 'small_sample'));
});

test('schema comparison detects added, removed and retyped columns', () => {
  const s = compareSchemas(
    [{ name: 'x', type: 'numerical' }, { name: 'y', type: 'categorical' }],
    [{ name: 'x', type: 'categorical' }, { name: 'z', type: 'numerical' }],
  );
  assert.deepEqual(s.added, ['z']);
  assert.deepEqual(s.removed, ['y']);
  assert.equal(s.type_changed[0].column, 'x');
  assert.equal(s.changed, true);
});

test('end-to-end run: no-drift scenario stays healthy', () => {
  const mk = (n, seed) => {
    const a = normals(n, 50, 10, seed);
    const b = normals(n, 0.5, 0.2, seed + 1);
    return a.map((v, i) => ({
      age: v,
      income: b[i] * 1000,
      region: ['north', 'south', 'east'][i % 3],
      target: i % 4 === 0 ? 1 : 0,
      prediction: i % 4 === 0 ? 1 : 0,
    }));
  };
  const out = runMonitoring({
    referenceRows: mk(1200, 3),
    currentRows: mk(1200, 3),
    model: { task_type: 'classification', target_column: 'target', prediction_column: 'prediction' },
  });
  assert.equal(out.summary.overall_status, 'healthy');
  assert.equal(out.summary.drifted_features, 0);
  assert.equal(out.performance.comparison.degraded, false);
});

test('end-to-end run: significant drift is detected and alerts raised', () => {
  const ref = normals(1500, 50, 10, 21).map((v, i) => ({
    age: v,
    region: ['north', 'south'][i % 2],
    target: i % 3 === 0 ? 1 : 0,
    prediction: i % 3 === 0 ? 1 : 0,
  }));
  const cur = normals(1500, 70, 16, 77).map((v, i) => ({
    age: v,
    region: i % 5 === 0 ? 'west' : 'north',
    target: i % 3 === 0 ? 1 : 0,
    prediction: i % 2 === 0 ? 1 : 0,
  }));
  const out = runMonitoring({
    referenceRows: ref,
    currentRows: cur,
    model: { task_type: 'classification', target_column: 'target', prediction_column: 'prediction' },
  });
  assert.ok(out.summary.drift_share >= 0.5, 'share=' + out.summary.drift_share);
  assert.equal(out.summary.overall_status, 'critical');
  assert.ok(out.alerts.some((a) => a.type === 'data_drift'));
  assert.ok(out.alerts.some((a) => a.type === 'performance_degradation'));
  assert.ok(out.performance.comparison.degraded);

  const ctx = buildContext(
    {
      overall_status: out.summary.overall_status,
      drift_share: out.summary.drift_share,
      drifted_features: out.summary.drifted_features,
      total_features: out.summary.total_features,
      reference_rows: out.summary.reference_rows,
      current_rows: out.summary.current_rows,
    },
    out.features,
    out.performance,
    out.concept_drift,
  );
  const ai = groundedAnalysis(ctx);
  assert.ok(ai.summary.length > 50);
  assert.ok(ai.root_causes.length > 0);
  assert.equal(ai.priority, 'critical');
  assert.ok(ai.corrective_actions.every((a) => a.action && a.priority));
});

test('concept drift is separated from covariate shift', () => {
  const base = normals(1000, 10, 2, 123);
  const ref = base.map((v, i) => ({ x: v, target: i % 2, prediction: i % 2 }));
  const cur = base.map((v, i) => ({ x: v, target: i % 2, prediction: i % 3 === 0 ? 1 : 0 }));
  const out = runMonitoring({
    referenceRows: ref,
    currentRows: cur,
    model: { task_type: 'classification', target_column: 'target', prediction_column: 'prediction' },
  });
  assert.equal(out.summary.drifted_features, 0);
  assert.equal(out.concept_drift.detected, true);
  assert.equal(out.concept_drift.type, 'concept_drift');
});

test('concept drift reports not-evaluated without ground truth', () => {
  const ref = normals(500, 1, 1, 9).map((v, i) => ({ x: v, target: i % 2, prediction: i % 2 }));
  const cur = normals(500, 1, 1, 10).map((v) => ({ x: v, prediction: 0 }));
  const out = runMonitoring({
    referenceRows: ref,
    currentRows: cur,
    model: { task_type: 'classification', target_column: 'target', prediction_column: 'prediction' },
  });
  assert.equal(out.concept_drift.evaluated, false);
  assert.equal(out.concept_drift.type, 'not_evaluated');
});

test('demo scenarios reproduce their intended drift levels', () => {
  const none = makeScenario('none');
  const moderate = makeScenario('moderate');
  const significant = makeScenario('significant');
  const model = {
    task_type: 'classification',
    target_column: 'default_flag',
    prediction_column: 'predicted_flag',
    probability_column: 'default_probability',
  };
  const a = runMonitoring({ referenceRows: none.reference, currentRows: none.current, model });
  const b = runMonitoring({ referenceRows: moderate.reference, currentRows: moderate.current, model });
  const c = runMonitoring({ referenceRows: significant.reference, currentRows: significant.current, model });
  assert.ok(a.summary.drift_share <= 0.2, 'no-drift share=' + a.summary.drift_share);
  assert.ok(b.summary.drift_share > a.summary.drift_share, 'moderate must exceed none');
  assert.ok(c.summary.drift_share >= b.summary.drift_share, 'significant must exceed moderate');
  assert.equal(c.summary.overall_status === 'critical' || c.summary.overall_status === 'drifted', true);
  assert.ok(a.performance.reference.rocAuc > 0.5);
});
