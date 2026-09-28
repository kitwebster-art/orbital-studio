import { normaliseFragmentationBpm } from "./beatFragmentation";

export type PhraseEvolutionStage =
  | "emergence"
  | "breakdown"
  | "accumulation"
  | "suspension"
  | "fracture"
  | "crescendo"
  | "release"
  | "void";

export interface PhraseEvolutionState {
  phrase: number;
  bar: number;
  barInPhrase: number;
  stage: PhraseEvolutionStage;
  energy: number;
}

/** Two related 8-bar arcs form one deterministic 16-bar performance phrase. */
export function phraseEvolutionState(
  timeS: number,
  bpm: number,
  amount: number,
): PhraseEvolutionState {
  const beat = Math.max(0, Number.isFinite(timeS) ? timeS : 0) * normaliseFragmentationBpm(bpm) / 60;
  const bar = Math.floor(beat / 4);
  const barInPhrase = bar % 16;
  const phrase = Math.floor(bar / 16);
  const progress = barInPhrase + (beat % 4) / 4;
  let stage: PhraseEvolutionStage;
  let authoredEnergy: number;
  if (barInPhrase < 4) {
    stage = "emergence";
    authoredEnergy = 0.35 + progress / 4 * 0.4;
  } else if (barInPhrase === 4) {
    stage = "breakdown";
    authoredEnergy = 0.28;
  } else if (barInPhrase < 8) {
    stage = "accumulation";
    authoredEnergy = 0.58 + (progress - 5) / 3 * 0.37;
  } else if (barInPhrase === 8) {
    stage = "suspension";
    authoredEnergy = 0.38;
  } else if (barInPhrase < 12) {
    stage = "fracture";
    authoredEnergy = 0.58 + (progress - 9) / 3 * 0.42;
  } else if (barInPhrase === 12) {
    stage = "crescendo";
    authoredEnergy = 1.08;
  } else if (barInPhrase === 13) {
    stage = "release";
    authoredEnergy = 0.88;
  } else if (barInPhrase === 14) {
    stage = "release";
    authoredEnergy = 0.5;
  } else {
    stage = "void";
    authoredEnergy = 0.16;
  }
  const safeAmount = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  return {
    phrase,
    bar,
    barInPhrase,
    stage,
    energy: 1 + (authoredEnergy - 1) * safeAmount,
  };
}

/** Deterministic event thinning for the generated score at low phrase energy. */
export function phraseAudioEventGate(step: number, energy: number): boolean {
  const safeStep = Math.max(0, Math.floor(Number.isFinite(step) ? step : 0));
  const safeEnergy = Number.isFinite(energy) ? Math.max(0, energy) : 1;
  if (safeEnergy < 0.3) return safeStep % 16 === 0;
  if (safeEnergy < 0.5) return safeStep % 8 === 0;
  if (safeEnergy < 0.72) return safeStep % 4 === 0 || safeStep % 8 === 3;
  return true;
}
