/**
 * Experiment 3: Trust Dynamics — T3/V3 Interaction
 *
 * T3 (intrinsic quality) × V3 (contextual trust) = effective trust score.
 *
 * T3 dimensions (from t3-scoring.ts):
 *   Talent     = structural balance (fan-in/fan-out)
 *   Training   = test coverage (exercised by tests?)
 *   Temperament = simplicity (line count)
 *
 * V3 dimensions (new — relational, not intrinsic):
 *   Valuation  = system importance (MRH reach — how much breaks if this changes?)
 *   Veracity   = reliability evidence (convergence of callers' trust — do dependents trust it?)
 *   Validity   = task relevance (within MRH of the target symbol? 0 outside, decays with depth)
 *
 * Key insight: V3 Validity is what makes trust context-dependent.
 * The same symbol has different effective trust for different tasks.
 * A well-tested utility (high T3) outside your MRH (low Validity) = low effective trust.
 * An untested core primitive (low T3) inside your MRH (high Validity) = high risk.
 *
 * The T3/V3 product identifies the real risk surface:
 *   High T3 × High V3 = safe dependency (well-built, relevant, trustworthy)
 *   Low T3 × High V3  = RISK (poorly built but you depend on it)
 *   High T3 × Low V3  = irrelevant quality (good code you don't touch)
 *   Low T3 × Low V3   = noise (bad code you don't care about)
 */

import { KnowledgeGraph } from '../../core/graph/types.js';
import { SymbolT3, T3Score } from './t3-scoring.js';
import { MRHResult } from './mrh-boundaries.js';

export interface V3Score {
  valuation: number;   // [0, 1] — system importance (normalized MRH reach)
  veracity: number;    // [0, 1] — reliability evidence (caller trust convergence)
  validity: number;    // [0, 1] — task relevance (within MRH of target, decays with depth)
}

export interface TrustProfile {
  id: string;
  name: string;
  filePath: string;
  t3: T3Score;
  v3: V3Score;
  effectiveTrust: number;  // geometric mean of all 6 dimensions
  riskScore: number;       // high V3 × low T3 = risk
  quadrant: 'safe' | 'risk' | 'irrelevant' | 'noise';
}

/**
 * Compute V3 scores and trust profiles for all symbols,
 * relative to a target symbol (the one being changed).
 *
 * If no target specified, computes global V3 (Validity=1 for all).
 */
export function computeTrustDynamics(
  graph: KnowledgeGraph,
  symbolT3s: SymbolT3[],
  mrhResults: MRHResult[],
  targetSymbolId?: string,
): TrustProfile[] {
  const t3Map = new Map(symbolT3s.map(s => [s.id, s]));
  const mrhMap = new Map(mrhResults.map(m => [m.id, m]));

  // Normalize valuation: max reach across all symbols
  const maxReach = Math.max(1, ...mrhResults.map(m => m.totalReach));

  // Build upstream adjacency for veracity computation
  const upstreamCallers = new Map<string, Set<string>>();
  graph.forEachRelationship(rel => {
    if (rel.type === 'CALLS' || rel.type === 'IMPORTS') {
      if (!upstreamCallers.has(rel.targetId)) upstreamCallers.set(rel.targetId, new Set());
      upstreamCallers.get(rel.targetId)!.add(rel.sourceId);
    }
  });

  // If target specified, compute its MRH neighborhood for Validity
  let targetMRHSet: Map<string, number> | undefined;
  if (targetSymbolId) {
    targetMRHSet = computeMRHNeighborhood(graph, targetSymbolId);
  }

  const results: TrustProfile[] = [];

  for (const t3 of symbolT3s) {
    const mrh = mrhMap.get(t3.id);

    // V3.Valuation: normalized reach
    const valuation = mrh ? mrh.totalReach / maxReach : 0;

    // V3.Veracity: do callers consistently depend on this?
    // High veracity = many callers, suggesting the dependency is established and reliable.
    // Low veracity = few or no callers, suggesting unproven reliability.
    const callers = upstreamCallers.get(t3.id);
    const callerCount = callers ? callers.size : 0;
    // Sigmoid: 1 caller → 0.29, 3 callers → 0.59, 10 callers → 0.87
    const veracity = 1.0 - 1.0 / (1.0 + callerCount / 3);

    // V3.Validity: task relevance (decay with MRH distance from target)
    let validity = 1.0; // default: everything is relevant (global view)
    if (targetMRHSet) {
      const depth = targetMRHSet.get(t3.id);
      if (depth === undefined) {
        validity = 0; // outside MRH — not relevant to this change
      } else {
        validity = 1.0 / (1.0 + depth / 2); // decay: d=0→1.0, d=2→0.5, d=4→0.33
      }
    }

    const v3: V3Score = { valuation, veracity, validity };

    // Effective trust: geometric mean of all 6 dimensions
    const all6 = [t3.t3.talent, t3.t3.training, t3.t3.temperament, valuation, veracity, validity];
    const effectiveTrust = Math.pow(all6.reduce((a, b) => a * b, 1), 1 / 6);

    // Risk score: high relevance × low quality
    // Risk = V3 magnitude × (1 - T3 magnitude)
    const v3magnitude = Math.cbrt(valuation * veracity * validity);
    const t3magnitude = Math.cbrt(t3.t3.talent * t3.t3.training * t3.t3.temperament);
    const riskScore = v3magnitude * (1 - t3magnitude);

    // Quadrant classification
    const t3high = t3magnitude > 0.4;
    const v3high = v3magnitude > 0.3;
    let quadrant: TrustProfile['quadrant'];
    if (t3high && v3high) quadrant = 'safe';
    else if (!t3high && v3high) quadrant = 'risk';
    else if (t3high && !v3high) quadrant = 'irrelevant';
    else quadrant = 'noise';

    results.push({
      id: t3.id,
      name: t3.name,
      filePath: t3.filePath,
      t3: t3.t3,
      v3,
      effectiveTrust,
      riskScore,
      quadrant,
    });
  }

  return results;
}

/**
 * Compute the MRH neighborhood of a target symbol — all symbols within
 * its blast radius, tagged with depth.
 */
function computeMRHNeighborhood(
  graph: KnowledgeGraph,
  targetId: string,
  maxDepth = 10,
): Map<string, number> {
  const neighborhood = new Map<string, number>();
  neighborhood.set(targetId, 0);

  // Traverse UPSTREAM: who depends on me?
  const upstream = new Map<string, Set<string>>();
  graph.forEachRelationship(rel => {
    if (rel.type === 'CALLS' || rel.type === 'IMPORTS' || rel.type === 'EXTENDS' || rel.type === 'IMPLEMENTS') {
      if (!upstream.has(rel.targetId)) upstream.set(rel.targetId, new Set());
      upstream.get(rel.targetId)!.add(rel.sourceId);
    }
  });

  let frontier = new Set<string>([targetId]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const deps = upstream.get(id);
      if (!deps) continue;
      for (const dep of deps) {
        if (!neighborhood.has(dep)) {
          neighborhood.set(dep, depth);
          next.add(dep);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }

  return neighborhood;
}

/**
 * Print a trust dynamics report.
 */
export function printTrustReport(profiles: TrustProfile[], targetName?: string): void {
  const quadrantCounts = { safe: 0, risk: 0, irrelevant: 0, noise: 0 };
  for (const p of profiles) quadrantCounts[p.quadrant]++;

  console.log(`Trust Dynamics${targetName ? ` (relative to: ${targetName})` : ' (global)'}:`);
  console.log(`  Safe:       ${quadrantCounts.safe} (high T3, high V3 — trustworthy dependencies)`);
  console.log(`  RISK:       ${quadrantCounts.risk} (low T3, high V3 — poorly built but depended upon)`);
  console.log(`  Irrelevant: ${quadrantCounts.irrelevant} (high T3, low V3 — good code, not relevant)`);
  console.log(`  Noise:      ${quadrantCounts.noise} (low T3, low V3 — bad code, not relevant)`);

  // Top risks
  const risks = profiles
    .filter(p => p.quadrant === 'risk')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  if (risks.length > 0) {
    console.log(`\n  Top Risk Symbols (low quality, high system importance):`);
    for (const r of risks) {
      console.log(`    risk=${r.riskScore.toFixed(3)} | T3: ${r.t3.talent.toFixed(2)}/${r.t3.training.toFixed(0)}/${r.t3.temperament.toFixed(2)} V3: ${r.v3.valuation.toFixed(2)}/${r.v3.veracity.toFixed(2)}/${r.v3.validity.toFixed(2)} | ${r.name} — ${r.filePath}`);
    }
  }

  // Safest dependencies
  const safest = profiles
    .filter(p => p.quadrant === 'safe')
    .sort((a, b) => b.effectiveTrust - a.effectiveTrust)
    .slice(0, 5);

  if (safest.length > 0) {
    console.log(`\n  Safest Dependencies (high quality, high importance):`);
    for (const s of safest) {
      console.log(`    trust=${s.effectiveTrust.toFixed(3)} | ${s.name} — ${s.filePath}`);
    }
  }
}
