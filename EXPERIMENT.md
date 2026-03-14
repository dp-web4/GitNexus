# Web4 Graph Experiment

**Branch**: `dp-web4/web4-graph-experiment`
**Goal**: Explore applying Web4 trust ontology concepts to code knowledge graphs
**Status**: Learning/exploring — not targeting delivery

## Hypothesis

GitNexus already implements a primitive Web4-like trust graph for code:
- Symbols are entities (LCTs)
- Call/import edges are trust relationships
- Leiden communities are emergent societies
- Cohesion is a primitive coherence index
- Cross-community flows are federation

The question: does making this mapping explicit produce better insights about code structure?

## Structural Parallels

| GitNexus (current) | Web4 ontology | Gap |
|---------------------|--------------|-----|
| Symbol node | LCT (identity) | No persistence, no trust history |
| Edge confidence (0-1) | T3 tensor (Talent/Training/Temperament) | Scalar vs 3D |
| Community cohesion | Coherence Index | No temporal dimension |
| MEMBER_OF | Society membership | No role differentiation |
| Cross-community flow | Federation | No trust negotiation |
| — | MRH (relevancy horizon) | Not computed |
| — | ATP/ADP (energy budget) | Not computed |

## Experiment Track

### Experiment 1: T3-like Symbol Scoring

Enrich symbol nodes with a 3-dimensional quality vector:
- **Talent**: Structural complexity (cyclomatic, fan-in/fan-out ratio)
- **Training**: Test coverage (is this symbol exercised by tests?)
- **Temperament**: Stability (git blame age, change frequency)

These already exist as derivable properties — the experiment is whether composing them into a tensor produces useful rankings that scalar metrics don't.

### Experiment 2: MRH Boundaries

For each symbol, compute its Markov Relevancy Horizon — how many hops until its influence becomes negligible? This is the transitive closure of the call graph weighted by confidence, decaying with depth.

Compare to GitNexus `impact()` which already does depth-bounded traversal but doesn't compute a horizon boundary.

### Experiment 3: Community Trust Dynamics

Apply the compatibility-synthon findings:
- Measure cross-community edge density (the "bridge" metric)
- Identify bridge symbols (high cross-community participation)
- Test: do repos with more bridge symbols have higher overall cohesion?

### Experiment 4: ATP-like Compute Budget

Each community consumes "attention" proportional to its symbol count and edge density. Repos with unbalanced ATP distribution (one community consuming disproportionate graph resources) may indicate architectural debt — a module that's too central or too tangled.

## What Success Looks Like

Not a feature. A set of findings:
- Does T3 scoring surface symbols that scalar metrics miss?
- Does MRH predict blast radius better than fixed-depth traversal?
- Do bridge metrics correlate with architectural quality?
- Does ATP distribution predict technical debt?

If any of these produce actionable insights, they could become features. If not, we learned something about the limits of the analogy.

## Files

Experimental code goes in `gitnexus/src/experimental/web4/` — isolated from main pipeline.
