/**
 * Experiment 2: MRH (Markov Relevancy Horizon) Boundaries
 *
 * For each symbol, compute how far its influence propagates through the graph
 * before becoming negligible. This is the code equivalent of Synchronism's MRH:
 * "minimal set of interacting DOF whose state transitions materially influence
 * coherence evolution."
 *
 * In code terms: if you change this symbol, how far does the blast radius
 * actually extend before it stops mattering?
 *
 * GitNexus impact() uses fixed depth=3. MRH computes where the actual
 * boundary falls — some symbols have MRH=1 (local change), others have
 * MRH=8+ (architectural spine).
 */

import { KnowledgeGraph } from '../../core/graph/types.js';

export interface MRHResult {
  id: string;
  name: string;
  filePath: string;
  label: string;
  mrh: number;              // Horizon depth where influence drops below threshold
  totalReach: number;        // Total unique symbols reachable
  influenceByDepth: number[]; // New symbols discovered at each depth
  decayProfile: number[];    // Cumulative influence fraction at each depth
}

export interface MRHStats {
  meanMRH: number;
  medianMRH: number;
  maxMRH: number;
  mrhDistribution: Map<number, number>;  // depth → count of symbols with that MRH
  spineSymbols: MRHResult[];             // MRH >= 2× median — the architectural spine
  localSymbols: MRHResult[];             // MRH <= 1 — truly local changes
}

const CODE_LABELS = new Set([
  'Function', 'Method', 'Class', 'Interface', 'Struct', 'Trait', 'Impl',
  'Enum', 'Module', 'Constructor', 'Template',
]);

const INFLUENCE_TYPES = new Set(['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'HAS_METHOD']);

/**
 * Compute MRH for all code symbols.
 *
 * Algorithm: BFS from each symbol through the UPSTREAM graph (who depends on me?).
 * At each depth, count newly discovered symbols. The MRH is the depth where
 * the marginal discovery rate drops below `threshold` of total reachable.
 *
 * We traverse upstream (dependents) not downstream (dependencies) because
 * MRH answers "what breaks if I change?" not "what do I depend on?"
 */
export function computeMRH(
  graph: KnowledgeGraph,
  opts: { maxDepth?: number; threshold?: number } = {},
): MRHResult[] {
  const maxDepth = opts.maxDepth ?? 10;
  const threshold = opts.threshold ?? 0.05; // MRH = depth where <5% new symbols discovered

  // Build upstream adjacency: target → [sources that depend on it]
  const upstream = new Map<string, Set<string>>();

  graph.forEachRelationship(rel => {
    if (!INFLUENCE_TYPES.has(rel.type)) return;

    // Upstream: if A CALLS B, then B's change affects A
    if (!upstream.has(rel.targetId)) upstream.set(rel.targetId, new Set());
    upstream.get(rel.targetId)!.add(rel.sourceId);
  });

  const results: MRHResult[] = [];

  graph.forEachNode(node => {
    if (!CODE_LABELS.has(node.label)) return;

    // BFS upstream from this symbol
    const visited = new Set<string>([node.id]);
    let frontier = new Set<string>([node.id]);
    const influenceByDepth: number[] = [];
    let totalDiscovered = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = new Set<string>();

      for (const symbolId of frontier) {
        const dependents = upstream.get(symbolId);
        if (!dependents) continue;

        for (const dep of dependents) {
          if (!visited.has(dep)) {
            visited.add(dep);
            nextFrontier.add(dep);
          }
        }
      }

      const newCount = nextFrontier.size;
      influenceByDepth.push(newCount);
      totalDiscovered += newCount;

      if (newCount === 0) break; // No more reachable symbols
      frontier = nextFrontier;
    }

    // Compute decay profile: cumulative fraction at each depth
    const decayProfile: number[] = [];
    let cumulative = 0;
    for (const count of influenceByDepth) {
      cumulative += count;
      decayProfile.push(totalDiscovered > 0 ? cumulative / totalDiscovered : 1.0);
    }

    // Find MRH: first depth where marginal discovery < threshold of total
    let mrh = influenceByDepth.length; // default: full depth
    for (let d = 0; d < influenceByDepth.length; d++) {
      const marginalRate = totalDiscovered > 0
        ? influenceByDepth[d] / totalDiscovered
        : 0;
      if (marginalRate < threshold && d > 0) {
        mrh = d; // MRH is the last depth with significant discovery
        break;
      }
    }

    // If no upstream dependents at all, MRH = 0 (leaf symbol)
    if (totalDiscovered === 0) mrh = 0;

    results.push({
      id: node.id,
      name: node.properties.name,
      filePath: node.properties.filePath,
      label: node.label,
      mrh,
      totalReach: totalDiscovered,
      influenceByDepth,
      decayProfile,
    });
  });

  return results;
}

/**
 * Compute aggregate MRH statistics.
 */
export function computeMRHStats(results: MRHResult[]): MRHStats {
  const mrhs = results.map(r => r.mrh).sort((a, b) => a - b);
  const meanMRH = mrhs.reduce((a, b) => a + b, 0) / mrhs.length;
  const medianMRH = mrhs[Math.floor(mrhs.length / 2)];
  const maxMRH = mrhs[mrhs.length - 1];

  // Distribution
  const mrhDistribution = new Map<number, number>();
  for (const m of mrhs) {
    mrhDistribution.set(m, (mrhDistribution.get(m) || 0) + 1);
  }

  // Spine: MRH >= 2× median (or >= 3 if median is small)
  const spineThreshold = Math.max(medianMRH * 2, 3);
  const spineSymbols = results
    .filter(r => r.mrh >= spineThreshold)
    .sort((a, b) => b.mrh - a.mrh || b.totalReach - a.totalReach);

  // Local: MRH <= 1
  const localSymbols = results
    .filter(r => r.mrh <= 1)
    .sort((a, b) => a.mrh - b.mrh);

  return { meanMRH, medianMRH, maxMRH, mrhDistribution, spineSymbols, localSymbols };
}
