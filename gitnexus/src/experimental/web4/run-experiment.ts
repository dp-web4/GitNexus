/**
 * Run Web4 graph experiments against an indexed repo.
 *
 * Usage: npx tsx gitnexus/src/experimental/web4/run-experiment.ts [repo-name]
 *
 * Reads the graph from KuzuDB via the existing local backend,
 * computes T3 scores, and prints findings.
 */

import { computeSymbolT3, computeCommunityT3 } from './t3-scoring.js';
import { computeMRH, computeMRHStats } from './mrh-boundaries.js';
import { computeTrustDynamics, printTrustReport } from './trust-dynamics.js';
import { KnowledgeGraph } from '../../core/graph/types.js';

// Quick graph loader — reads CSV exports or queries KuzuDB directly
// For now, use the pipeline to rebuild a fresh graph
import { runPipelineFromRepo } from '../../core/ingestion/pipeline.js';

async function main() {
  const repoName = process.argv[2];
  if (!repoName) {
    console.error('Usage: npx tsx run-experiment.ts <repo-path>');
    process.exit(1);
  }

  console.log(`\n=== Web4 Graph Experiment: T3 Scoring ===\n`);
  console.log(`Repo: ${repoName}`);
  console.log(`Building graph...\n`);

  const result = await runPipelineFromRepo(repoName, (progress) => {
    if (progress.percent % 20 === 0) {
      process.stdout.write(`  ${progress.message}\r`);
    }
  });

  const graph = result.graph;
  console.log(`\nGraph: ${graph.nodeCount} nodes, ${graph.relationshipCount} edges\n`);

  // Experiment 1: T3 Symbol Scoring
  console.log(`--- Experiment 1: T3 Symbol Scoring ---\n`);
  const symbolScores = computeSymbolT3(graph);

  // Top 10 by composite
  const top = symbolScores
    .filter(s => s.composite > 0)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 15);

  console.log('Top 15 symbols by T3 composite (geometric mean):');
  console.log('  Name                          | Talent | Training | Temperament | Composite');
  console.log('  ' + '-'.repeat(85));
  for (const s of top) {
    const name = `${s.name} (${s.label})`.padEnd(30);
    console.log(`  ${name} |  ${s.t3.talent.toFixed(3)} |    ${s.t3.training.toFixed(1)}   |    ${s.t3.temperament.toFixed(3)}    |  ${s.composite.toFixed(3)}`);
  }

  // Bottom 10 (non-zero) — symbols that might need attention
  const bottom = symbolScores
    .filter(s => s.composite > 0)
    .sort((a, b) => a.composite - b.composite)
    .slice(0, 10);

  console.log('\nBottom 10 symbols (potential attention needed):');
  for (const s of bottom) {
    const name = `${s.name} (${s.label})`.padEnd(30);
    const weak = [];
    if (s.t3.talent < 0.3) weak.push('imbalanced');
    if (s.t3.training === 0) weak.push('untested');
    if (s.t3.temperament < 0.3) weak.push('complex');
    console.log(`  ${name} | T3: ${s.t3.talent.toFixed(2)}/${s.t3.training.toFixed(0)}/${s.t3.temperament.toFixed(2)} | ${weak.join(', ')}`);
  }

  // Coverage stats
  const tested = symbolScores.filter(s => s.t3.training > 0).length;
  const total = symbolScores.length;
  console.log(`\nTest coverage: ${tested}/${total} symbols (${(100 * tested / total).toFixed(1)}%) called from test files`);

  // Experiment 1b: Community T3
  console.log(`\n--- Community T3 Aggregation ---\n`);
  const communityScores = computeCommunityT3(graph, symbolScores);

  const topComm = communityScores.slice(0, 10);
  console.log('Top 10 communities by T3 composite:');
  console.log('  Community                     | Members | Talent | Training | Temperament | Bridge% | Composite');
  console.log('  ' + '-'.repeat(100));
  for (const c of topComm) {
    const name = c.label.padEnd(30);
    console.log(`  ${name} |    ${String(c.memberCount).padStart(3)}  |  ${c.t3.talent.toFixed(3)} |    ${c.t3.training.toFixed(3)}  |    ${c.t3.temperament.toFixed(3)}    |  ${(100 * c.bridgeRatio).toFixed(0).padStart(3)}%   |  ${c.composite.toFixed(3)}`);
  }

  // Communities with zero training (no test coverage at all)
  const untested = communityScores.filter(c => c.t3.training === 0 && c.memberCount >= 3);
  console.log(`\nCommunities with 0% test coverage (3+ members): ${untested.length}`);
  for (const c of untested.slice(0, 5)) {
    console.log(`  ${c.label} (${c.memberCount} members)`);
  }

  // Bridge analysis
  const highBridge = communityScores.filter(c => c.bridgeRatio > 0.3);
  console.log(`\nHigh-bridge communities (>30% members in cross-community flows): ${highBridge.length}`);
  for (const c of highBridge.slice(0, 5)) {
    console.log(`  ${c.label}: ${(100 * c.bridgeRatio).toFixed(0)}% bridge, composite ${c.composite.toFixed(3)}`);
  }

  // ── Experiment 2: MRH Boundaries ──────────────────────────────────
  console.log(`\n--- Experiment 2: MRH Boundaries ---\n`);
  const mrhResults = computeMRH(graph);
  const mrhStats = computeMRHStats(mrhResults);

  console.log(`MRH Statistics:`);
  console.log(`  Mean:   ${mrhStats.meanMRH.toFixed(2)}`);
  console.log(`  Median: ${mrhStats.medianMRH}`);
  console.log(`  Max:    ${mrhStats.maxMRH}`);

  console.log(`\nMRH Distribution:`);
  const sortedDist = [...mrhStats.mrhDistribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [depth, count] of sortedDist) {
    const bar = '#'.repeat(Math.min(60, Math.round(count / mrhResults.length * 200)));
    const pct = (100 * count / mrhResults.length).toFixed(1);
    console.log(`  MRH=${depth}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar}`);
  }

  // Spine symbols — the architectural backbone
  console.log(`\nArchitectural Spine (MRH >= ${Math.max(mrhStats.medianMRH * 2, 3)}): ${mrhStats.spineSymbols.length} symbols`);
  for (const s of mrhStats.spineSymbols.slice(0, 15)) {
    const decay = s.influenceByDepth.slice(0, 5).map(n => String(n).padStart(3)).join(' →');
    console.log(`  MRH=${s.mrh} reach=${String(s.totalReach).padStart(4)} | ${s.name} (${s.label}) — ${s.filePath}`);
    console.log(`         depth influence: [${decay}]`);
  }

  // Local symbols
  console.log(`\nTruly Local (MRH=0, no upstream dependents): ${mrhStats.localSymbols.filter(s => s.mrh === 0).length} symbols`);
  console.log(`Near-Local (MRH=1): ${mrhStats.localSymbols.filter(s => s.mrh === 1).length} symbols`);

  // Cross-reference: high MRH + low T3 = risky backbone
  const scoreMap = new Map(symbolScores.map(s => [s.id, s]));
  const riskySpine = mrhStats.spineSymbols
    .map(s => ({ ...s, t3: scoreMap.get(s.id) }))
    .filter(s => s.t3 && s.t3.composite < 0.3)
    .slice(0, 10);

  if (riskySpine.length > 0) {
    console.log(`\n⚠ High-MRH + Low-T3 (risky backbone — high reach, low quality):`);
    for (const s of riskySpine) {
      console.log(`  MRH=${s.mrh} T3=${s.t3!.composite.toFixed(2)} | ${s.name} — ${s.filePath}`);
      const weak = [];
      if (s.t3!.t3.talent < 0.3) weak.push('imbalanced');
      if (s.t3!.t3.training === 0) weak.push('untested');
      if (s.t3!.t3.temperament < 0.3) weak.push('complex');
      console.log(`         issues: ${weak.join(', ')}`);
    }
  }

  // ── Experiment 3: Trust Dynamics (T3/V3) ──────────────────────────
  console.log(`\n--- Experiment 3: Trust Dynamics (T3 × V3) ---\n`);

  // Global view first
  const globalProfiles = computeTrustDynamics(graph, symbolScores, mrhResults);
  printTrustReport(globalProfiles);

  // Targeted view: what's the risk surface if we change the highest-MRH symbol?
  if (mrhStats.spineSymbols.length > 0) {
    const target = mrhStats.spineSymbols[0];
    console.log(`\n--- Targeted Trust: changing "${target.name}" (MRH=${target.mrh}, reach=${target.totalReach}) ---\n`);
    const targetProfiles = computeTrustDynamics(graph, symbolScores, mrhResults, target.id);
    printTrustReport(targetProfiles, target.name);
  }

  console.log('\n=== Experiment complete ===\n');
}

main().catch(console.error);
