import type {
  AudioPreviewAdapter,
  RuntimeSnapshot,
} from "../core/contracts";
import { clamp } from "../core/math";

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
  private active = false;

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
