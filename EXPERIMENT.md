# Web4 Trust Ontology for Code Knowledge Graphs

**Branch**: `dp-web4/web4-graph-experiment`
**Status**: Experimental — exploring whether trust ontology concepts improve code analysis
**Web4 spec**: [github.com/dp-web4/web4](https://github.com/dp-web4/web4)

## TL;DR

GitNexus already builds a code knowledge graph (symbols, call edges, communities, execution flows). [Web4](https://github.com/dp-web4/web4) is a trust-native ontology for digital entities that describes trust relationships using multi-dimensional tensors, relevancy horizons, and energy economics. This experiment applies Web4's trust model to code graphs and asks: **does it produce better insights about code structure than scalar metrics?**

Early results say yes. The T3/V3×MRH framework surfaces a "risky backbone" that no single metric catches — symbols that are structurally critical (high reach), contextually relevant (within the blast radius of your change), but poorly built (untested, complex). These are the load-bearing walls nobody inspects.

## Background: What Is Web4?

Web4 is a trust-native ontology for digital entities. Its core equation:

```
Web4 = MCP + RDF + LCT + T3/V3*MRH + ATP/ADP
```

The components relevant to this experiment:

- **T3 (Trust Tensor)**: A 3-dimensional quality assessment — Talent (capability), Training (proven reliability), Temperament (behavioral stability). Describes *what an entity is*. See [web4 T3 spec](https://github.com/dp-web4/web4/blob/main/docs/specs/t3_v3_trust_tensors.md).

- **V3 (Verification Tensor)**: A 3-dimensional contextual trust assessment — Valuation (importance to the system), Veracity (evidence of reliability), Validity (relevance to the current task). Describes *how much you should trust an entity in context*. T3 is intrinsic; V3 is relational.

- **MRH (Markov Relevancy Horizon)**: The boundary beyond which an entity's state changes stop materially influencing the system's coherence. Think: "how far does a change propagate before it stops mattering?" See [web4 MRH docs](https://github.com/dp-web4/web4/blob/main/docs/specs/mrh_markov_relevancy_horizon.md).

- **T3/V3\*MRH**: The product of intrinsic quality and contextual trust, bounded by the relevancy horizon. This is the effective trust score — it tells you not just "is this entity good?" but "is this entity good *and relevant to what I'm doing right now*?"

The key insight from Web4: **trust is contextual, not absolute**. The same entity has different effective trust for different tasks. A highly reliable database module (high T3) that's outside the blast radius of your UI change (low V3 Validity) has low effective trust for that task — not because it's bad, but because it's irrelevant.

## The Mapping

GitNexus already has the structural primitives. Web4 provides the interpretive framework.

| GitNexus (current) | Web4 concept | What it means for code |
|---------------------|-------------|----------------------|
| Symbol node (Function, Class, etc.) | LCT (entity with identity) | Each symbol is an entity with properties and relationships |
| CALLS/IMPORTS edges | Trust relationships | Dependencies are trust — you trust what you call |
| Edge confidence (0-1) | Trust score (scalar) | How reliably the dependency was resolved |
| Community (Leiden algorithm) | Society (emergent grouping) | Symbols that interact frequently form communities |
| Cohesion score | Coherence Index | How tightly coupled a community is internally |
| Cross-community flow | Federation | Execution paths that bridge module boundaries |
| MEMBER_OF edges | Society membership | Which community a symbol belongs to |
| — | **T3 tensor** | Multi-dimensional intrinsic quality (this experiment adds it) |
| — | **V3 tensor** | Multi-dimensional contextual trust (this experiment adds it) |
| — | **MRH boundary** | Influence propagation depth (this experiment computes it) |
| — | **T3/V3 product** | Effective trust = quality × relevance (this experiment computes it) |

## Experiments & Findings

### Experiment 1: T3 Symbol Scoring

**What**: Compute a 3-dimensional quality vector for each code symbol.

| Dimension | Web4 meaning | Code interpretation | How computed |
|-----------|-------------|--------------------|--------------|
| **Talent** | Capability | Structural balance — does this symbol both receive and provide? | `1 - |fan_in - fan_out| / (fan_in + fan_out)` |
| **Training** | Proven reliability | Test coverage — is this symbol exercised by test files? | Binary: 1.0 if called from `*test*`/`*spec*` files, 0.0 otherwise |
| **Temperament** | Behavioral stability | Simplicity — shorter functions are more stable | `1 / (1 + line_span / 30)` sigmoid |

**Composite**: Geometric mean of all three dimensions. This penalizes symbols that are strong in one area but weak in another — a well-tested but structurally imbalanced symbol scores lower than a balanced one.

**Finding — community aggregation**: Communities are scored by averaging member T3 scores. The bridge ratio (fraction of members participating in cross-community execution flows) adds a structural dimension. **Bridge communities have lower composite T3 scores** (0.3–0.5) than non-bridge communities (0.6–0.7). The symbols that connect modules are the ones most likely to be complex and untested.

**Tested on**: 4-life (2,679 code symbols, 342 communities)
- 10.8% test coverage (289/2,679 symbols called from test files)
- 168 communities with zero test coverage
- Bridge communities score 40% lower than non-bridge communities

### Experiment 2: MRH Boundaries

**What**: For each symbol, compute how far upstream its influence propagates — how many symbols would be affected if this symbol changed?

**Algorithm**: BFS upstream through the dependency graph (CALLS, IMPORTS, EXTENDS, IMPLEMENTS). At each depth, count newly discovered dependents. The MRH is the depth where marginal discovery drops below 5% of total reachable symbols.

MRH answers "what breaks if I change this?" — the same question as GitNexus `impact()`, but instead of a fixed depth cutoff (d=3), it finds where the actual boundary falls. Some symbols have MRH=0 (nothing depends on them). Others have MRH=6+ (the architectural spine).

**Finding — heavy-tailed distribution**:

```
MRH=0:  1089 (40.6%)  ############################################################
MRH=1:   563 (21.0%)  ##########################################
MRH=2:   392 (14.6%)  #############################
MRH=3:   312 (11.6%)  #######################
MRH=4:   236 ( 8.8%)  ##################
MRH=5:    73 ( 2.7%)  #####
MRH=6:    14 ( 0.5%)  #
```

40% of symbols are truly local — change them and nothing else notices. The spine is thin: only 14 symbols at max depth. This matches expectations from physics and network theory — most nodes are peripheral, a few are structural.

**Finding — the untested spine**: Cross-referencing MRH with T3 reveals symbols that have high reach (MRH=6) but zero T3 composite (untested, structurally imbalanced). In 4-life, these are the ATP ledger primitives (`deduct`, `credit`, `unlock`, `get_or_create_account`) and the trust system core (`update_society_trust`, `set_component`). The economic and trust backbone of the simulation has no tests and maximum blast radius.

### Experiment 3: T3/V3 Trust Dynamics

**What**: Combine intrinsic quality (T3) with contextual trust (V3) to produce an effective trust score that's task-relative.

**V3 dimensions for code**:

| Dimension | Web4 meaning | Code interpretation | How computed |
|-----------|-------------|--------------------|--------------|
| **Valuation** | System importance | How much of the system depends on this symbol? | `total_reach / max_reach` (normalized MRH) |
| **Veracity** | Reliability evidence | How many callers trust this symbol? Established dependencies = proven reliability. | `1 - 1/(1 + caller_count/3)` sigmoid |
| **Validity** | Task relevance | Is this symbol within the MRH of what you're changing? | `1/(1 + depth/2)` decay from target, 0 if outside MRH |

**The key insight: Validity makes trust contextual.** Without it, every symbol has the same importance regardless of what you're working on. With Validity, the effective trust is task-relative — symbols outside your MRH have Validity=0, regardless of their intrinsic quality.

**Four quadrants** (T3 magnitude × V3 magnitude):

| | High V3 (important + relevant) | Low V3 (peripheral or irrelevant) |
|---|---|---|
| **High T3** (well-built) | **Safe** — trustworthy dependency | **Irrelevant** — good code you don't touch |
| **Low T3** (poorly built) | **RISK** — poorly built but depended upon | **Noise** — bad code you don't care about |

**Finding — global risk surface**:

| Quadrant | Count | Interpretation |
|----------|------:|----------------|
| Safe | 50 | Well-built, systemically important — these are the reliable core |
| **RISK** | **373** | Poorly built but the system depends on them — the actual risk surface |
| Irrelevant | 137 | Good code that's peripheral — leave it alone |
| Noise | 2,119 | Low quality, low importance — not worth worrying about |

Top global risks: `add_agent`, `add_society` (model layer), `trackPageVisit` (analytics), `loadExploration` (state management) — all with risk scores > 0.8. These are foundational abstractions with near-zero structural quality that everything depends on.

Safest dependencies: `handle_pre_prepare`, `handle_prepare`, `handle_commit` (consensus protocol) — high T3 AND high V3. The trust mechanisms themselves are the most trustworthy code.

**Finding — targeted trust collapses the search space**: When computing trust relative to a specific symbol (`update_society_trust`, MRH=6, reach=73), the Validity dimension collapses 2,679 symbols to 4 relevant ones. The same codebase, filtered by "what actually matters for this change," goes from 373 risk symbols to 2. That's the power of MRH-bounded trust — it eliminates noise and focuses attention.

## Why This Matters

Current code analysis tools use scalar metrics: cyclomatic complexity, test coverage percentage, dependency depth. These tell you about individual symbols in isolation. The T3/V3×MRH framework adds three things scalar metrics can't:

1. **Multi-dimensional quality** (T3): A symbol can be well-tested but structurally imbalanced, or simple but untested. The geometric mean penalizes single-dimension strength — you need all three to score high. This catches symbols that look good on one metric but are fragile overall.

2. **Contextual relevance** (V3 Validity): The same symbol has different effective trust for different tasks. A code review tool that shows ALL risky symbols is noisy. One that shows risky symbols *within the MRH of your PR* is actionable.

3. **Emergent structure** (communities + bridges): The Leiden algorithm finds actual module boundaries (which may differ from directory structure). Bridge symbols that connect communities are architecturally critical but empirically under-tested. This is a structural finding, not a metric threshold.

## Potential Applications

If these findings hold across more repos, they could inform:

- **PR review**: Show the T3/V3 risk surface of changed symbols + their MRH neighborhood. "You're changing `deduct()` which has MRH=6 and T3=0.00 — here are the 22 symbols in its blast radius, 18 of which are also untested."

- **Technical debt prioritization**: Rank symbols by risk score (high V3 × low T3). The top of the list is where testing effort produces the most value per line.

- **Architecture visualization**: Overlay T3/V3 scores on the community graph. Red = risk quadrant, green = safe quadrant. Bridge symbols highlighted. This makes architectural debt visible at a glance.

- **Refactoring guidance**: High-MRH symbols in the risk quadrant are refactoring candidates. The MRH boundary tells you exactly how many symbols are affected if you restructure.

## Files

All experimental code is isolated in `gitnexus/src/experimental/web4/`:

| File | Purpose |
|------|---------|
| `t3-scoring.ts` | T3 computation (symbol + community level) |
| `mrh-boundaries.ts` | MRH boundary detection (upstream BFS with decay) |
| `trust-dynamics.ts` | V3 computation, T3×V3 product, quadrant classification, targeted trust |
| `run-experiment.ts` | Runner script — builds graph and prints all experiment results |

Run against any repo:
```bash
cd gitnexus && npm run build
node dist/experimental/web4/run-experiment.js /path/to/repo
```

## Status

| Experiment | Status | Key Finding |
|-----------|--------|-------------|
| T3 Symbol Scoring | Complete | Bridge communities are 40% lower quality than non-bridge |
| MRH Boundaries | Complete | 40% of symbols are local; spine is 14 symbols; ATP primitives are untested spine |
| T3/V3 Trust Dynamics | Complete | 373 risk symbols globally; targeted trust collapses search space 99.8% |
| ATP Distribution | Not started | — |

## References

- [Web4 specification](https://github.com/dp-web4/web4) — trust-native ontology for digital entities
- [T3/V3 Trust Tensors](https://github.com/dp-web4/web4/blob/main/docs/specs/t3_v3_trust_tensors.md) — multi-dimensional trust scoring
- [MRH (Markov Relevancy Horizon)](https://github.com/dp-web4/web4/blob/main/docs/specs/mrh_markov_relevancy_horizon.md) — context boundaries for trust evaluation
- [Compatibility-Synthon Experiment](https://github.com/dp-web4/Synchronism/blob/main/Research/Compatibility_Synthon_Experiment.md) — empirical validation of compatibility-dependent emergence (p_crit ∝ 1/⟨compatibility⟩, bridge agents required for synthon formation)
