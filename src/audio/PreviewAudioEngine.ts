import type {
  AudioPreviewAdapter,
  RuntimeSnapshot,
} from "../core/contracts";
import { clamp } from "../core/math";
import {
  DEFAULT_SHADER_EVENT_SOUND_CONTROLS,
  normaliseShaderEventSoundControls,
  shaderEventBucket,
  type ShaderEventSoundControls,
  type ShaderEventSoundPalette,
} from "../core/shaderEventSound";
import { beatFragmentationGate } from "../core/beatFragmentation";
import { phraseAudioEventGate, phraseEvolutionState } from "../core/phraseEvolution";

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

const SCALE_RATIOS = [
  1,
  9 / 8,
  6 / 5,
  4 / 3,
  3 / 2,
  8 / 5,
  16 / 9,
] as const;

export class PreviewAudioEngine implements AudioPreviewAdapter {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sub: Voice | null = null;
  private drone: Voice | null = null;
  private melody: Voice | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private eventDry: GainNode | null = null;
  private eventWet: GainNode | null = null;
  private eventReverb: ConvolverNode | null = null;
  private eventControls: ShaderEventSoundControls = { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS };
  private lastEventBucket = -1;
  private eventIndex = 0;
  private lastBeatStep = -1;
  private active = false;
  private phraseEnergy = 1;

  get enabled(): boolean {
    return this.active;
  }

  async enable(): Promise<void> {
    if (!this.context) {
      this.createGraph();
    }
    if (!this.context || !this.master) {
      return;
    }
    await this.context.resume();
    this.active = true;
    this.master.gain.setTargetAtTime(0.075, this.context.currentTime, 0.12);
  }

  disable(): void {
    this.active = false;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    }
  }

  setShaderEventSoundControls(controls: Partial<ShaderEventSoundControls>): void {
    this.eventControls = normaliseShaderEventSoundControls({ ...this.eventControls, ...controls });
    if (this.context && this.eventWet && this.eventDry) {
      const now = this.context.currentTime;
      this.eventDry.gain.setTargetAtTime(0.44 * this.eventControls.level, now, 0.05);
      this.eventWet.gain.setTargetAtTime(0.52 * this.eventControls.level * this.eventControls.reverb, now, 0.08);
    }
  }

  updateShaderEvents(timeS: number, fragmentationEnabled: boolean, bpm: number, phraseEvolution: number): void {
    if (!this.active || !this.eventControls.enabled || !fragmentationEnabled) {
      this.lastEventBucket = -1;
      return;
    }
    const bucket = shaderEventBucket(timeS, this.eventControls.density, bpm);
    if (bucket === this.lastEventBucket) return;
    this.lastEventBucket = bucket;
    this.phraseEnergy = phraseEvolutionState(timeS, bpm, phraseEvolution).energy;
    if (beatFragmentationGate(bucket, this.eventControls.density) &&
        phraseAudioEventGate(bucket, this.phraseEnergy)) {
      this.triggerBeatEvent(bucket, this.phraseEnergy);
    }
  }

  triggerShaderEvent(palette = this.eventControls.palette): void {
    if (!this.context || !this.active || !this.eventDry || !this.eventWet || !this.eventReverb) return;
    const mixed: Exclude<ShaderEventSoundPalette, "mixed">[] = ["space", "metal", "bass", "sweep", "attack"];
    const style = palette === "mixed" ? mixed[this.eventIndex++ % mixed.length]! : palette;
    const now = this.context.currentTime;
    const pan = Math.sin((this.eventIndex + 1) * 2.17) * 0.82;
    const settings = {
      space: { type: "sine" as OscillatorType, from: 980, to: 164, duration: 1.65, attack: 0.012 },
      metal: { type: "triangle" as OscillatorType, from: 2160, to: 640, duration: 1.05, attack: 0.003 },
      bass: { type: "sine" as OscillatorType, from: 72, to: 31, duration: 1.42, attack: 0.008 },
      sweep: { type: "sawtooth" as OscillatorType, from: 118, to: 2380, duration: 1.18, attack: 0.018 },
      attack: { type: "square" as OscillatorType, from: 3260, to: 280, duration: 0.24, attack: 0.0015 },
    }[style];
    const oscillator = this.context.createOscillator();
    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(settings.to, now + settings.duration);
    const gain = this.context.createGain();
    const peak = (style === "bass" ? 0.42 : style === "attack" ? 0.18 : 0.24) *
      clamp(this.phraseEnergy, 0.18, 1.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + settings.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    oscillator.connect(gain).connect(panner);
    panner.connect(this.eventDry);
    panner.connect(this.eventReverb);
    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.02);
  }

  private triggerBeatEvent(step: number, energy: number): void {
    if (!this.context || !this.active) return;
    if (step === this.lastBeatStep) return;
    this.lastBeatStep = step;
    if (step % 4 === 0 || step % 16 === 10) this.triggerKick(step);
    if (energy > 0.52 && (step % 8 === 3 || step % 8 === 6)) this.triggerNoiseHit(step);
    if (energy > 1.0 && step % 4 === 1) this.triggerNoiseHit(step + 8);
    this.triggerShaderEvent(step % 8 === 0 ? "bass" : step % 4 === 2 ? "metal" : "mixed");
  }

  private triggerKick(step: number): void {
    if (!this.context || !this.eventDry || !this.eventReverb) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(step % 16 === 10 ? 118 : 92, now);
    oscillator.frequency.exponentialRampToValueAtTime(31, now + 0.18);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.46 * clamp(this.phraseEnergy, 0.2, 1.12), now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.31);
    oscillator.connect(gain).connect(this.eventDry);
    gain.connect(this.eventReverb);
    oscillator.start(now);
    oscillator.stop(now + 0.34);
  }

  private triggerNoiseHit(step: number): void {
    if (!this.context || !this.eventDry || !this.eventReverb) return;
    const duration = step % 8 === 6 ? 0.035 : 0.075;
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = step % 8 === 6 ? 5_800 : 2_600;
    filter.Q.value = 1.8;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.16 * clamp(this.phraseEnergy, 0.2, 1.12), this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    const pan = this.context.createStereoPanner();
    pan.pan.value = step % 2 === 0 ? -0.55 : 0.55;
    source.connect(filter).connect(gain).connect(pan);
    pan.connect(this.eventDry);
    pan.connect(this.eventReverb);
    source.start();
  }

  update(snapshot: RuntimeSnapshot): void {
    if (!this.context || !this.active) {
      return;
    }
    const now = this.context.currentTime;
    const params = snapshot.audiovisual;
    const residual = snapshot.world.prediction?.residualM;
    const residualMagnitude = residual
      ? Math.hypot(residual.x, residual.y, residual.z)
      : 0;
    const confidence = snapshot.world.confidence;
    const trackingGate = snapshot.world.stateValid ? 1 : 0.12;

    if (this.sub) {
      const subFrequency = 28 + params.energy * 9 + params.organic * 4;
      this.sub.oscillator.frequency.setTargetAtTime(
        subFrequency,
        now,
        0.18,
      );
      this.sub.gain.gain.setTargetAtTime(
        0.26 * params.sub * trackingGate,
        now,
        0.12,
      );
      this.sub.panner.pan.setTargetAtTime(0, now, 0.2);
    }

    if (this.drone) {
      const beating = 47 + params.fracture * 12 + residualMagnitude * 14;
      this.drone.oscillator.frequency.setTargetAtTime(beating, now, 0.16);
      this.drone.gain.gain.setTargetAtTime(
        0.075 *
          clamp(0.18 + params.organic + params.energy * 0.4) *
          trackingGate,
        now,
        0.14,
      );
      this.drone.panner.pan.setTargetAtTime(
        Math.sin(snapshot.showTimeS * 0.09) * params.spatialMotion * 0.8,
        now,
        0.12,
      );
    }

    if (this.melody) {
      const scaleIndex =
        Math.floor(
          snapshot.showTimeS * (0.12 + params.melody * 0.35) +
            snapshot.movementProgress * 4,
        ) % SCALE_RATIOS.length;
      const root = 73.42;
      this.melody.oscillator.frequency.setTargetAtTime(
        root * SCALE_RATIOS[scaleIndex],
        now,
        0.08,
      );
      const breathing =
        0.5 + 0.5 * Math.sin(snapshot.showTimeS * (0.6 + params.energy));
      this.melody.gain.gain.setTargetAtTime(
        0.05 *
          params.melody *
          params.organic *
          breathing *
          trackingGate,
        now,
        0.09,
      );
      this.melody.panner.pan.setTargetAtTime(
        Math.cos(snapshot.showTimeS * 0.13) * params.spatialMotion,
        now,
        0.12,
      );
    }

    if (this.noiseGain && this.noiseFilter) {
      const glitchPulse =
        Math.pow(
          Math.max(
            0,
            Math.sin(snapshot.showTimeS * (10 + params.glitch * 23)),
          ),
          18,
        ) * params.glitch;
      const noiseAmount =
        (params.fracture * 0.025 +
          glitchPulse * 0.075 +
          residualMagnitude * params.residualGain * 0.06) *
        trackingGate;
      this.noiseGain.gain.setTargetAtTime(noiseAmount, now, 0.025);
      this.noiseFilter.frequency.setTargetAtTime(
        420 + params.energy * 3_200 + (1 - confidence) * 1_500,
        now,
        0.08,
      );
      this.noiseFilter.Q.setTargetAtTime(
        0.8 + params.glitch * 7,
        now,
        0.08,
      );
    }
  }

  dispose(): void {
    this.disable();
    this.sub?.oscillator.stop();
    this.drone?.oscillator.stop();
    this.melody?.oscillator.stop();
    this.noiseSource?.stop();
    void this.context?.close();
    this.context = null;
  }

  private createGraph(): void {
    this.context = new AudioContext({
      latencyHint: "interactive",
    });
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    this.eventDry = this.context.createGain();
    this.eventDry.gain.value = 0.44 * this.eventControls.level;
    this.eventWet = this.context.createGain();
    this.eventWet.gain.value = 0.52 * this.eventControls.level * this.eventControls.reverb;
    this.eventReverb = this.context.createConvolver();
    const impulseSeconds = 3.8;
    const impulse = this.context.createBuffer(2, Math.floor(this.context.sampleRate * impulseSeconds), this.context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const samples = impulse.getChannelData(channel);
      for (let index = 0; index < samples.length; index += 1) {
        const decay = Math.pow(1 - index / samples.length, 2.8);
        samples[index] = (Math.random() * 2 - 1) * decay * (channel === 0 ? 0.92 : 1);
      }
    }
    this.eventReverb.buffer = impulse;
    this.eventDry.connect(this.master);
    this.eventReverb.connect(this.eventWet).connect(this.master);

    this.sub = this.createVoice("sine", 32, 0);
    this.drone = this.createVoice("triangle", 52, -0.45);
    this.melody = this.createVoice("sine", 73.42, 0.45);

    const noiseBuffer = this.context.createBuffer(
      1,
      this.context.sampleRate * 2,
      this.context.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < noiseData.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.94 + white * 0.06;
      noiseData[index] = previous;
    }
    this.noiseSource = this.context.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseFilter = this.context.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 900;
    this.noiseFilter.Q.value = 1.2;
    this.noiseGain = this.context.createGain();
    this.noiseGain.gain.value = 0;
    const noisePanner = this.context.createStereoPanner();
    noisePanner.pan.value = -0.15;
    this.noiseSource
      .connect(this.noiseFilter)
      .connect(this.noiseGain)
      .connect(noisePanner)
      .connect(this.master);
    this.noiseSource.start();
  }

  private createVoice(
    type: OscillatorType,
    frequency: number,
    pan: number,
  ): Voice {
    if (!this.context || !this.master) {
      throw new Error("Audio graph has not been initialised");
    }
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    oscillator.connect(gain).connect(panner).connect(this.master);
    oscillator.start();
    return {
      oscillator,
      gain,
      panner,
    };
  }
}
