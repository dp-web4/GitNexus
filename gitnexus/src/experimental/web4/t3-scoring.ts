/**
 * Experiment 1: T3-like Symbol Scoring
 *
 * Compute a 3-dimensional quality vector for each symbol node:
 *   Talent    = structural complexity (fan-in / fan-out balance)
 *   Training  = test coverage proxy (is this symbol called by test files?)
 *   Temperament = stability proxy (line count as complexity indicator)
 *
 * The hypothesis: composing these into a tensor and scoring at the community
 * level produces insights that individual scalar metrics don't.
 *
 * This is exploratory — not wired into the pipeline.
 */

import { KnowledgeGraph, GraphNode } from '../../core/graph/types.js';

export interface T3Score {
  talent: number;      // [0, 1] — structural balance
  training: number;    // [0, 1] — test coverage proxy
  temperament: number; // [0, 1] — stability/simplicity
}

export interface SymbolT3 {
  id: string;
  name: string;
  filePath: string;
  label: string;
  t3: T3Score;
  composite: number;  // geometric mean of T3
}

export interface CommunityT3 {
  communityId: string;
  label: string;
  memberCount: number;
  t3: T3Score;         // aggregate (mean of members)
  composite: number;
  bridgeRatio: number; // fraction of members in cross-community flows
}

const CODE_LABELS = new Set([
  'Function', 'Method', 'Class', 'Interface', 'Struct', 'Trait', 'Impl',
  'Enum', 'Module', 'Constructor', 'Template',
]);

/**
 * Compute T3 scores for all code symbols in the graph.
 */
export function computeSymbolT3(graph: KnowledgeGraph): SymbolT3[] {
  // Build adjacency maps
  const inbound = new Map<string, string[]>();  // target → [source, ...]
  const outbound = new Map<string, string[]>(); // source → [target, ...]
  const testCallers = new Set<string>();         // symbols called from test files

  graph.forEachRelationship(rel => {
    if (rel.type === 'CALLS' || rel.type === 'IMPORTS') {
      if (!outbound.has(rel.sourceId)) outbound.set(rel.sourceId, []);
      outbound.get(rel.sourceId)!.push(rel.targetId);

      if (!inbound.has(rel.targetId)) inbound.set(rel.targetId, []);
      inbound.get(rel.targetId)!.push(rel.sourceId);

      // Check if caller is from a test file
      const sourceNode = graph.getNode(rel.sourceId);
      if (sourceNode && isTestFile(sourceNode.properties.filePath)) {
        testCallers.add(rel.targetId);
      }
    }
  });

  const results: SymbolT3[] = [];

  graph.forEachNode(node => {
    if (!CODE_LABELS.has(node.label)) return;

    const fanIn = (inbound.get(node.id) || []).length;
    const fanOut = (outbound.get(node.id) || []).length;
    const lineSpan = (node.properties.endLine || 0) - (node.properties.startLine || 0);

    // Talent: fan-in/fan-out balance
    // Perfect balance (fanIn ≈ fanOut) scores high. Pure sink or pure source scores lower.
    // Rationale: well-designed symbols both receive and provide — they're connectors, not dead ends.
    const totalFan = fanIn + fanOut;
    const talent = totalFan > 0
      ? 1.0 - Math.abs(fanIn - fanOut) / totalFan
      : 0.5; // isolated symbols get neutral score

    // Training: is this symbol exercised by test files?
    // Binary for now — 1.0 if any test calls it, 0.0 if not.
    const training = testCallers.has(node.id) ? 1.0 : 0.0;

    // Temperament: simplicity/stability proxy
    // Shorter functions are more stable (less likely to change, easier to understand).
    // Sigmoid: 10 lines → 0.95, 50 lines → 0.67, 200 lines → 0.23
    const temperament = 1.0 / (1.0 + lineSpan / 30);

    const t3: T3Score = { talent, training, temperament };
    const composite = Math.cbrt(talent * training * temperament); // geometric mean

    results.push({
      id: node.id,
      name: node.properties.name,
      filePath: node.properties.filePath,
      label: node.label,
      t3,
      composite,
    });
  });

  return results;
}

/**
 * Aggregate T3 scores to community level.
 */
export function computeCommunityT3(
  graph: KnowledgeGraph,
  symbolScores: SymbolT3[],
): CommunityT3[] {
  // Build community membership map
  const communityMembers = new Map<string, string[]>();
  const symbolCommunity = new Map<string, string>();

  graph.forEachRelationship(rel => {
    if (rel.type === 'MEMBER_OF') {
      if (!communityMembers.has(rel.targetId)) communityMembers.set(rel.targetId, []);
      communityMembers.get(rel.targetId)!.push(rel.sourceId);
      symbolCommunity.set(rel.sourceId, rel.targetId);
    }
  });

  // Find symbols in cross-community flows
  const crossCommunityParticipants = new Set<string>();
  graph.forEachRelationship(rel => {
    if (rel.type === 'STEP_IN_PROCESS') {
      const proc = graph.getNode(rel.targetId);
      if (proc && (proc.properties as any).processType === 'cross_community') {
        crossCommunityParticipants.add(rel.sourceId);
      }
    }
  });

  // Score lookup
  const scoreMap = new Map(symbolScores.map(s => [s.id, s]));

  const results: CommunityT3[] = [];

  for (const [commId, members] of communityMembers) {
    const commNode = graph.getNode(commId);
    if (!commNode) continue;

    const memberScores = members
      .map(m => scoreMap.get(m))
      .filter((s): s is SymbolT3 => s !== undefined);

    if (memberScores.length === 0) continue;

    const avgT3: T3Score = {
      talent: mean(memberScores.map(s => s.t3.talent)),
      training: mean(memberScores.map(s => s.t3.training)),
      temperament: mean(memberScores.map(s => s.t3.temperament)),
    };

    const bridgeCount = members.filter(m => crossCommunityParticipants.has(m)).length;

    results.push({
      communityId: commId,
      label: commNode.properties.heuristicLabel || commNode.properties.name,
      memberCount: memberScores.length,
      t3: avgT3,
      composite: Math.cbrt(avgT3.talent * avgT3.training * avgT3.temperament),
      bridgeRatio: memberScores.length > 0 ? bridgeCount / memberScores.length : 0,
    });
  }

  // Sort by composite descending
  results.sort((a, b) => b.composite - a.composite);
  return results;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.includes('test') || lower.includes('spec') || lower.includes('__tests__');
}
