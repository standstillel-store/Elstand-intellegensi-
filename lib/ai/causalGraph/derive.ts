// ---------------------------------------------------------------------------
// ELVOID Intelligence — Causal Graph Derivation (Phase 8.3.8)
//
// PURE FUNCTIONS ONLY. No I/O, no clock read, no randomness — every input
// is an already-fetched real row (or `null`, meaning "fetched, not
// found"). See repository.ts for the one place that fetches real rows and
// calls these. Zero re-implementation of any upstream module's own logic:
// `NEGATIVE_EVALUATION_CLASSES`/`MIN_OCCURRENCE_COUNT` are imported from
// `failurePatterns/detect.ts` verbatim; the Validation->Qualification
// edge reuses `buildLearningLoopChains()` (Phase 8.3.6) verbatim rather
// than re-deriving `currentlyInfluencesDecisions` a second way.
// ---------------------------------------------------------------------------

import { NEGATIVE_EVALUATION_CLASSES, MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import { buildLearningLoopChains } from "@/lib/ai/learningLoop/traceChain";
import type { DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { FailurePatternCandidate } from "@/lib/ai/failurePatterns/contracts";
import type { AdaptiveConstraint } from "@/lib/ai/adaptiveConstraint/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { CausalChainResult, CausalEdge, CausalEdgeRejection, CausalNodeRef, LearningLineageGroupKey } from "./contracts";

function node(kind: CausalNodeRef["kind"], id: string): CausalNodeRef {
  return { kind, id };
}

function groupId(key: LearningLineageGroupKey): string {
  return `${key.source}:${key.symbol}:${key.evidenceTag}`;
}

/**
 * One representative closed trade for a learning-loop group — the
 * `decision_experiences`/`decision_evaluations` pair the OUTCOME/EVALUATION
 * edges are proven against. Optional: a group's FailurePattern/Constraint/
 * Validation lineage can still be checked with this omitted (the first two
 * edges are then simply not attempted — never fabricated as unsupported
 * either, since there was nothing to check).
 */
export interface RepresentativeTrade {
  readonly experience: DecisionExperienceRecord;
  readonly evaluation: DecisionEvaluation | null;
}

export interface LearningLineageInput {
  readonly key: LearningLineageGroupKey;
  readonly representative?: RepresentativeTrade;
  readonly failurePattern: FailurePatternCandidate | null;
  readonly constraint: AdaptiveConstraint | null;
  readonly validation: ConstraintValidation | null;
  /** Passed through verbatim to `buildLearningLoopChains()` (Phase 8.3.6) for the memory-evidence side-annotation on the final edge — never recomputed here. */
  readonly memory: DecisionMemoryResult | null;
}

function basisMatches(a: { readonly occurrenceCount: number; readonly dominantClassShare: number; readonly firstObservedAt: string; readonly lastObservedAt: string }, aConfidence: number, b: { readonly occurrenceCount: number; readonly dominantClassShare: number; readonly statisticalConfidence: number; readonly firstObservedAt: string; readonly lastObservedAt: string }): boolean {
  return a.occurrenceCount === b.occurrenceCount && a.dominantClassShare === b.dominantClassShare && aConfidence === b.statisticalConfidence && a.firstObservedAt === b.firstObservedAt && a.lastObservedAt === b.lastObservedAt;
}

/**
 * Derives the proven/rejected portion of the
 * Outcome -> Evaluation -> FailurePattern -> Constraint -> Validation ->
 * Qualification -> Decision chain for ONE learning-loop group, from
 * already-fetched real rows only.
 */
export function deriveLearningLineage(input: LearningLineageInput): CausalChainResult {
  const { key, representative, failurePattern, constraint, validation, memory } = input;
  const proven: CausalEdge[] = [];
  const rejected: CausalEdgeRejection[] = [];
  const groupNodeSuffix = groupId(key);

  // -------------------------------------------------------------------
  // Outcome -> Evaluation (one representative trade, if supplied)
  // -------------------------------------------------------------------
  if (representative) {
    const { experience, evaluation } = representative;
    const outcomeNode = node("decision_experiences", experience.sourceSignalId);

    if (experience.outcome === null) {
      rejected.push({ source: outcomeNode, target: node("decision_evaluations", experience.sourceSignalId), reason: `decision_experiences row ${experience.sourceSignalId} has outcome_result=null (trade not yet closed) — evaluateDecision() has no outcome to derive marketOutcome/evaluationClass from yet.` });
    } else if (!evaluation) {
      rejected.push({ source: outcomeNode, target: node("decision_evaluations", experience.sourceSignalId), reason: `no decision_evaluations row persisted for source_signal_id=${experience.sourceSignalId} — evaluateAndPersistDecision() is not wired to an automatic trigger (see lib/ai/decisionEvaluation/repository.ts header); the outcome exists but was never scored.` });
    } else if (evaluation.sourceSignalId !== experience.sourceSignalId) {
      rejected.push({ source: outcomeNode, target: node("decision_evaluations", experience.sourceSignalId), reason: `decision_evaluations row's own sourceSignalId (${evaluation.sourceSignalId}) does not match the requested experience's sourceSignalId (${experience.sourceSignalId}) — identity mismatch, join refused.` });
    } else {
      proven.push({
        source: outcomeNode,
        target: node("decision_evaluations", evaluation.sourceSignalId),
        mechanism: "lib/ai/decisionEvaluation/evaluate.ts::evaluateDecision() reads this decision_experiences row's own outcome_result/grade/confidence/learning_context fields to derive marketOutcome/decisionQuality/evaluationClass — a pure function of exactly this row, joined by source_signal_id.",
        relationshipType: "DERIVATION",
        evidence: [
          { kind: "decision_experiences", ref: experience.sourceSignalId, detail: `outcome_result=${experience.outcome.outcomeResult}, decision_timestamp=${experience.decisionTimestamp}` },
          { kind: "decision_evaluations", ref: evaluation.sourceSignalId, detail: `evaluationClass=${evaluation.evaluationClass}, evidence=[${evaluation.evidence.join(", ")}]` },
        ],
        confidence: null,
        limitations: ["Proven for this one representative trade only — does not itself prove every historical decision_experiences row for this group has a matching evaluation."],
      });
    }
  }

  // -------------------------------------------------------------------
  // Evaluation -> FailurePattern (group aggregate)
  // -------------------------------------------------------------------
  const evaluationForPattern = representative?.evaluation ?? null;
  const patternNode = node("failure_pattern_candidates", groupNodeSuffix);

  if (evaluationForPattern) {
    const evalNode = node("decision_evaluations", evaluationForPattern.sourceSignalId);
    const isNegative = NEGATIVE_EVALUATION_CLASSES.includes(evaluationForPattern.evaluationClass);
    const carriesTag = evaluationForPattern.evidence.includes(key.evidenceTag);

    if (!isNegative) {
      rejected.push({ source: evalNode, target: patternNode, reason: `evaluationClass=${evaluationForPattern.evaluationClass} is not in NEGATIVE_EVALUATION_CLASSES (lib/ai/failurePatterns/detect.ts) — only GOOD_DECISION_BAD_OUTCOME/BAD_DECISION_BAD_OUTCOME rows ever contribute to a failure_pattern_candidates aggregate; this row structurally cannot have contributed.` });
    } else if (!carriesTag) {
      rejected.push({ source: evalNode, target: patternNode, reason: `decision_evaluations.evidence=[${evaluationForPattern.evidence.join(", ")}] does not include evidenceTag="${key.evidenceTag}" — this row cannot have contributed to this group's aggregate.` });
    } else if (!failurePattern) {
      rejected.push({ source: evalNode, target: patternNode, reason: `no failure_pattern_candidates row currently persisted for (source=${key.source}, symbol=${key.symbol}, evidenceTag=${key.evidenceTag}) — either occurrenceCount never reached MIN_OCCURRENCE_COUNT=${MIN_OCCURRENCE_COUNT}, or recomputeFailurePatterns() has not run since this evaluation was persisted.` });
    } else {
      // Real, checkable membership evidence: the negative, tag-carrying
      // evaluation's own decision falls inside the persisted aggregate's
      // observed time window — never a re-run of detect.ts's grouping.
      const decisionTs = Date.parse(representative!.experience.decisionTimestamp);
      const withinWindow = decisionTs >= Date.parse(failurePattern.firstObservedAt) && decisionTs <= Date.parse(failurePattern.lastObservedAt);
      if (!withinWindow) {
        rejected.push({ source: evalNode, target: patternNode, reason: `decision_timestamp=${representative!.experience.decisionTimestamp} falls outside the persisted aggregate's own [firstObservedAt=${failurePattern.firstObservedAt}, lastObservedAt=${failurePattern.lastObservedAt}] window — group membership not evidenced for this row.` });
      } else {
        proven.push({
          source: evalNode,
          target: patternNode,
          mechanism: `lib/ai/failurePatterns/detect.ts::detectFailurePatternCandidates() groups every negative-class decision_evaluations row carrying evidenceTag="${key.evidenceTag}" by (source, symbol, evidenceTag) into one recomputed aggregate (occurrenceCount, dominantClassShare, confidence) — this row's own decision_timestamp falls inside the persisted aggregate's observed window, evidencing membership.`,
          relationshipType: "AGGREGATION",
          evidence: [
            { kind: "decision_evaluations", ref: evaluationForPattern.sourceSignalId, detail: `evaluationClass=${evaluationForPattern.evaluationClass} (negative), evidence includes "${key.evidenceTag}"` },
            { kind: "failure_pattern_candidates", ref: groupNodeSuffix, detail: `occurrenceCount=${failurePattern.occurrenceCount}, dominantClassShare=${failurePattern.dominantClassShare}, confidence=${failurePattern.confidence}, window=[${failurePattern.firstObservedAt}, ${failurePattern.lastObservedAt}]` },
          ],
          confidence: failurePattern.confidence,
          limitations: ["Proves time-window group membership for this one row, not that this exact row was present in the population the last recompute actually ran against (failure_pattern_candidates is a full recompute-and-upsert aggregate, not an incremental per-row trigger)."],
        });
      }
    }
  } else if (failurePattern) {
    // A pattern row exists but no representative evaluation was supplied
    // to check membership against — never fabricate a proven edge without
    // a specific row's evidence to point to.
    rejected.push({ source: node("decision_evaluations", `${groupNodeSuffix}:(no representative supplied)`), target: patternNode, reason: "no representative decision_evaluations row was supplied for this group — group-level aggregate membership cannot be checked against a specific row without one." });
  }

  // -------------------------------------------------------------------
  // FailurePattern -> Constraint (verbatim basis copy-forward)
  // -------------------------------------------------------------------
  const constraintNode = node("adaptive_constraints", groupNodeSuffix);
  if (!failurePattern) {
    rejected.push({ source: patternNode, target: constraintNode, reason: `no failure_pattern_candidates row currently persisted for (source=${key.source}, symbol=${key.symbol}, evidenceTag=${key.evidenceTag}) — nothing for an adaptive_constraints row to have copied basis from.` });
  } else if (!constraint) {
    rejected.push({ source: patternNode, target: constraintNode, reason: `no adaptive_constraints row currently persisted for this group — recomputeAdaptiveConstraints() has not generated one for it yet.` });
  } else if (failurePattern.source !== constraint.source || failurePattern.symbol !== constraint.symbol || failurePattern.evidenceTag !== constraint.evidenceTag) {
    rejected.push({ source: patternNode, target: constraintNode, reason: "constraint's own (source, symbol, evidenceTag) does not match the failure pattern's — identity mismatch, group key does not agree." });
  } else if (!basisMatches(failurePattern, failurePattern.confidence, constraint.basis)) {
    rejected.push({ source: patternNode, target: constraintNode, reason: `constraint.basis diverges from the current failure_pattern_candidates row's own fields — the constraint is stale relative to the latest recompute (occurrenceCount/dominantClassShare/confidence/window do not all match verbatim).` });
  } else {
    proven.push({
      source: patternNode,
      target: constraintNode,
      mechanism: "lib/ai/adaptiveConstraint/generate.ts copies FailurePatternCandidate.occurrenceCount/dominantClassShare/confidence/firstObservedAt/lastObservedAt verbatim into AdaptiveConstraint.basis (confidence renamed statisticalConfidence) — proven here by exact field equality between the two persisted rows.",
      relationshipType: "COPY_FORWARD",
      evidence: [
        { kind: "failure_pattern_candidates", ref: groupNodeSuffix, detail: `occurrenceCount=${failurePattern.occurrenceCount}, dominantClassShare=${failurePattern.dominantClassShare}, confidence=${failurePattern.confidence}` },
        { kind: "adaptive_constraints", ref: groupNodeSuffix, detail: `basis.occurrenceCount=${constraint.basis.occurrenceCount}, basis.dominantClassShare=${constraint.basis.dominantClassShare}, basis.statisticalConfidence=${constraint.basis.statisticalConfidence}` },
      ],
      confidence: null,
      limitations: [],
    });
  }

  // -------------------------------------------------------------------
  // Constraint -> Validation (verbatim basis copy-forward)
  // -------------------------------------------------------------------
  const validationNode = node("constraint_validations", groupNodeSuffix);
  if (!constraint) {
    rejected.push({ source: constraintNode, target: validationNode, reason: "no adaptive_constraints row currently persisted for this group — nothing for a constraint_validations row to have copied basis from." });
  } else if (!validation) {
    rejected.push({ source: constraintNode, target: validationNode, reason: "no constraint_validations row currently persisted for this group — recomputeConstraintValidations() has not validated it yet." });
  } else if (constraint.source !== validation.source || constraint.symbol !== validation.symbol || constraint.evidenceTag !== validation.evidenceTag) {
    rejected.push({ source: constraintNode, target: validationNode, reason: "validation's own (source, symbol, evidenceTag) does not match the constraint's — identity mismatch, group key does not agree." });
  } else if (constraint.basis.occurrenceCount !== validation.basis.occurrenceCount || constraint.basis.dominantClassShare !== validation.basis.dominantClassShare || constraint.basis.statisticalConfidence !== validation.basis.statisticalConfidence || constraint.basis.firstObservedAt !== validation.basis.firstObservedAt || constraint.basis.lastObservedAt !== validation.basis.lastObservedAt) {
    rejected.push({ source: constraintNode, target: validationNode, reason: "validation.basis diverges from the current adaptive_constraints row's own basis — the validation is stale relative to the latest recompute." });
  } else {
    proven.push({
      source: constraintNode,
      target: validationNode,
      mechanism: "lib/ai/learningValidation/validate.ts copies AdaptiveConstraint.basis verbatim into ConstraintValidation.basis — proven here by exact field equality between the two persisted rows.",
      relationshipType: "COPY_FORWARD",
      evidence: [
        { kind: "adaptive_constraints", ref: groupNodeSuffix, detail: `basis.occurrenceCount=${constraint.basis.occurrenceCount}, generatedAt=${constraint.generatedAt}` },
        { kind: "constraint_validations", ref: groupNodeSuffix, detail: `status=${validation.status}, validatedAt=${validation.validatedAt}` },
      ],
      confidence: null,
      limitations: [],
    });
  }

  // -------------------------------------------------------------------
  // Validation -> Qualification -> Decision (reuses Phase 8.3.6 verbatim)
  // -------------------------------------------------------------------
  const qualificationNode = node("qualification", groupNodeSuffix);
  const decisionNode = node("decision", groupNodeSuffix);
  if (!validation) {
    rejected.push({ source: validationNode, target: qualificationNode, reason: "no constraint_validations row currently persisted for this group — nothing for qualify.ts's cautionConstraintPresent check to read." });
  } else {
    const [chainEntry] = buildLearningLoopChains([validation], memory);
    if (!chainEntry.currentlyInfluencesDecisions) {
      rejected.push({ source: validationNode, target: qualificationNode, reason: `constraint_validations.status="${validation.status}" !== "VALID" — lib/ai/learningLoop/traceChain.ts::buildLearningLoopChains() reports currentlyInfluencesDecisions=false; qualify.ts's cautionConstraintPresent check only ever reads VALID-status validations.` });
    } else {
      proven.push({
        source: validationNode,
        target: qualificationNode,
        mechanism: chainEntry.influenceCitation ?? "see lib/ai/learningLoop/traceChain.ts::buildLearningLoopChains()",
        relationshipType: "GATING_INFLUENCE",
        evidence: [{ kind: "constraint_validations", ref: groupNodeSuffix, detail: `status=VALID, validatedAt=${validation.validatedAt}` }],
        confidence: null,
        limitations: ["Proves the code path this VALID validation would trigger; does not by itself confirm a specific autonomous cycle actually read this exact validation — pair with a Cognitive Trace record for per-cycle confirmation."],
      });
      proven.push({
        source: qualificationNode,
        target: decisionNode,
        mechanism: 'lib/ai/autonomousDecision/decide.ts::decideAutonomous() requires qualification.status==="QUALIFIED" for EXECUTE (signals.qualificationQualified); a CAUTION-qualified cycle fails that condition and falls through to the final "otherwise -> WAIT" branch.',
        relationshipType: "GATING_INFLUENCE",
        evidence: [{ kind: "code_reference", ref: "lib/ai/autonomousDecision/decide.ts::decideAutonomous()", detail: "selectAutonomousDecision() priority order: requiredContextMissing||qualificationInsufficient||preEntryInsufficient -> WAIT; preEntryBlocked -> REJECT; qualificationConflicted -> REJECT; preEntryCaution -> WAIT; preEntryValid&&qualificationQualified -> EXECUTE; otherwise -> WAIT." }],
        confidence: null,
        limitations: [],
      });
    }
  }

  return { proven, rejected };
}

/**
 * Derives the Memory -> Qualification -> Decision edge for one symbol's
 * current `DecisionMemoryResult`, by citing `qualify.ts`'s real
 * `hasNegativeMemorySignal()`/`selectQualificationStatus()` branches and
 * `decide.ts`'s real `qualificationConflicted -> REJECT` branch. This is a
 * CODE-BEHAVIOR proof (the branch exists and would fire on this memory
 * shape), never a historical replay claim — Cognitive Replay (8.3.7)
 * explicitly cannot reconstruct what memory looked like at a past cycle's
 * time (see lib/ai/cognitiveReplay/contracts.ts header); this function
 * only proves what the CURRENT memory result would do if read right now.
 */
export function deriveMemoryInfluence(symbol: string, memory: DecisionMemoryResult | null): CausalChainResult {
  const memoryNode = node("decision_evaluations", `memory:${symbol}`);
  const qualificationNode = node("qualification", `memory:${symbol}`);
  const decisionNode = node("decision", `memory:${symbol}`);

  if (!memory) {
    return { proven: [], rejected: [{ source: memoryNode, target: qualificationNode, reason: `no DecisionMemoryResult supplied for ${symbol} — qualify.ts's hasNegativeMemorySignal() returns false for a null context.memory by construction; nothing to prove.` }] };
  }

  const negativeEvaluations = memory.matchedEvaluations.filter((e) => NEGATIVE_EVALUATION_CLASSES.includes(e.evaluationClass));
  const hasNegativeSignal = negativeEvaluations.length > 0 || memory.matchedPatterns.length > 0;

  if (!hasNegativeSignal) {
    return { proven: [], rejected: [{ source: memoryNode, target: qualificationNode, reason: `${symbol}'s current DecisionMemoryResult carries no negative-class matchedEvaluations and no matchedPatterns — lib/ai/decisionQualification/qualify.ts::hasNegativeMemorySignal() would return false; no CONFLICTED gating for this memory shape.` }] };
  }

  const citedEvidenceRefs = [
    ...negativeEvaluations.map((e) => ({ kind: "decision_evaluations" as const, ref: e.sourceSignalId, detail: `evaluationClass=${e.evaluationClass} (negative)` })),
    ...memory.matchedPatterns.map((p) => ({ kind: "failure_pattern_candidates" as const, ref: `${p.source}:${p.symbol}:${p.evidenceTag}`, detail: `occurrenceCount=${p.occurrenceCount}, confidence=${p.confidence}` })),
  ];

  return {
    proven: [
      {
        source: memoryNode,
        target: qualificationNode,
        mechanism: "lib/ai/decisionQualification/qualify.ts::hasNegativeMemorySignal() finds a negative-class matchedEvaluation or a non-empty matchedPatterns list in context.memory -> negativeMemorySignalPresent=true -> selectQualificationStatus() (priority 4, before the risk/caution checks) returns CONFLICTED.",
        relationshipType: "GATING_INFLUENCE",
        evidence: citedEvidenceRefs,
        confidence: null,
        limitations: ["Code-behavior proof only: proves this memory shape would produce CONFLICTED if read by qualify.ts right now. Does not claim any past autonomous cycle actually saw this exact memory result — decisionMemory is query-time-only and was never persisted per cycle, so no historical instance of this edge can ever be replayed (see lib/ai/cognitiveReplay's own MEMORY_NOT_PERSISTED_PER_CYCLE reason)."],
      },
      {
        source: qualificationNode,
        target: decisionNode,
        mechanism: "lib/ai/autonomousDecision/decide.ts::decideAutonomous(): selectAutonomousDecision() checks signals.qualificationConflicted (qualification.status===\"CONFLICTED\") -> REJECT, ahead of the preEntryValid && qualificationQualified -> EXECUTE branch.",
        relationshipType: "GATING_INFLUENCE",
        evidence: [{ kind: "code_reference", ref: "lib/ai/autonomousDecision/decide.ts::decideAutonomous()", detail: "qualificationConflicted -> REJECT (priority 3 of 6, before the EXECUTE branch)" }],
        confidence: null,
        limitations: ["Code-behavior proof only — see the Memory->Qualification edge's own limitation above."],
      },
    ],
    rejected: [],
  };
}
