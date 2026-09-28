import { DEFAULT_FAN_PREVIEW_SPEED, fanSpeedToHoverOffsetM } from "./environmentPreview";
import { clamp } from "./math";
import {
  sampleVideoDerivedBalloonMotion,
} from "./realBalloonReference";
import {
  DEFAULT_BALLOON_PHYSICS_CONTROLS,
  normaliseBalloonPhysicsControls,
  type BalloonPhysicsControls,
} from "./balloonSurfaceControls";

const TAU = Math.PI * 2;

export interface BernoulliBalloonState {
  offsetM: { x: number; y: number; z: number };
  velocityMps: { x: number; y: number; z: number };
  radiiScale: { x: number; y: number; z: number };
  wobble: number;
  deformationRate: number;
  principalAxisOffsetDeg: number;
  flowAttachment: number;
}

/**
 * Low-order visual dynamics for a large, light balloon held in a vertical jet.
 * It is not CFD. It represents the behaviours that matter to the digital twin:
 * lift equilibrium, Bernoulli self-centering, under-damped lateral sway,
 * slow vortex forcing and approximately volume-preserving membrane bulging.
 */
export class BernoulliAirJetModel {
  private position = { x: 0.12, y: fanSpeedToHoverOffsetM(DEFAULT_FAN_PREVIEW_SPEED), z: -0.07 };
  private velocity = { x: 0, y: 0, z: 0 };
  private previousScale = { x: 1, y: 1, z: 1 };

  step(
    fanSpeed: number,
    deltaS: number,
    timeS: number,
    controls: Partial<BalloonPhysicsControls> = DEFAULT_BALLOON_PHYSICS_CONTROLS,
  ): BernoulliBalloonState {
    const fan = clamp(fanSpeed);
    const physics = normaliseBalloonPhysicsControls(controls);
    const safeDelta = Math.max(0, Math.min(0.1, Number.isFinite(deltaS) ? deltaS : 0));
    const steps = safeDelta === 0 ? 0 : Math.max(1, Math.ceil(safeDelta / (1 / 120)));
    const dt = steps > 0 ? safeDelta / steps : 0;

    for (let step = 0; step < steps; step += 1) {
      const t = timeS - safeDelta + dt * (step + 1);
      const fanSquared = fan * fan;
      const videoMotion = sampleVideoDerivedBalloonMotion(t);
      const centerGain = 0.6 + physics.centerDrift * 0.55;
      const targetHeight = fanSpeedToHoverOffsetM(fan) +
        videoMotion.centerOffsetM.y * (0.58 + physics.verticalBreathing * 0.46);

      // The lift equilibrium moves with air speed. A low natural frequency and
      // moderate damping give the heavy, delayed rise and settle seen in a
      // large latex envelope rather than a small, twitchy particle.
      const massScale = 0.72 + physics.mass * 0.72;
      const verticalOmega = (0.66 + fan * 0.22) / Math.sqrt(massScale);
      const verticalDamping = 2 * (0.34 + physics.damping * 0.52) * verticalOmega;
      const verticalAcceleration =
        verticalOmega * verticalOmega * (targetHeight - this.position.y) -
        verticalDamping * this.velocity.y;

      // The jet centre wanders slowly. Bernoulli attachment supplies a
      // restoring acceleration toward it, while vortex shedding introduces a
      // small cross-coupled force instead of uncorrelated noise.
      const depthMotion = sampleVideoDerivedBalloonMotion(t + 4.25);
      const jetX = videoMotion.centerOffsetM.x * centerGain;
      const jetZ = depthMotion.centerOffsetM.x * centerGain * 0.46;
      const lateralOmega = 0.48 + fan * 0.43;
      const lateralDamping = 2 * (0.24 + physics.damping * 0.42 + fan * 0.08) * lateralOmega;
      const sheddingPhase = t * TAU / (6.8 - fan * 1.15);
      const turbulenceScale = 0.15 + physics.jetTurbulence * 1.15;
      const sheddingForce = turbulenceScale * (0.018 + fanSquared * 0.042) * Math.sin(sheddingPhase);
      const swirlForce = turbulenceScale * (0.014 + fanSquared * 0.034) * Math.cos(sheddingPhase * 0.83 + 0.7);
      const accelerationX =
        lateralOmega * lateralOmega * (jetX - this.position.x) -
        lateralDamping * this.velocity.x +
        sheddingForce + this.velocity.z * 0.055 * fan;
      const accelerationZ =
        lateralOmega * lateralOmega * (jetZ - this.position.z) -
        lateralDamping * this.velocity.z +
        swirlForce - this.velocity.x * 0.055 * fan;

      this.velocity.x += accelerationX * dt;
      this.velocity.y += verticalAcceleration * dt;
      this.velocity.z += accelerationZ * dt;
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;

      const radial = Math.hypot(this.position.x, this.position.z);
      if (radial > 0.52) {
        const scale = 0.52 / radial;
        this.position.x *= scale;
        this.position.z *= scale;
        this.velocity.x *= 0.72;
        this.velocity.z *= 0.72;
      }
      this.position.y = Math.max(0.34, Math.min(2.75, this.position.y));
    }

    const lateralOffset = Math.hypot(this.position.x, this.position.z);
    const lateralSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const attachmentRadius = 0.58 + fan * 0.24;
    const flowAttachment = clamp(
      1 - lateralOffset / attachmentRadius - lateralSpeed * 0.18,
    );
    const videoMotion = sampleVideoDerivedBalloonMotion(timeS);
    const deformationGain =
      (0.64 + physics.squashStretch * 0.44) * (0.88 + fan * 0.15);
    const verticalGain = deformationGain *
      (0.62 + physics.verticalBreathing * 0.46);
    const scaleX = 1 + (videoMotion.radiiScale.x - 1) * deformationGain;
    const scaleY = 1 + (videoMotion.radiiScale.y - 1) * verticalGain;
    const scaleZ = 1 / Math.max(0.82, scaleX * scaleY);
    const deformationRate = safeDelta > 0
      ? Math.hypot(
          scaleX - this.previousScale.x,
          scaleY - this.previousScale.y,
          scaleZ - this.previousScale.z,
        ) / safeDelta
      : 0;
    this.previousScale = { x: scaleX, y: scaleY, z: scaleZ };

    return {
      offsetM: { ...this.position },
      velocityMps: { ...this.velocity },
      radiiScale: { x: scaleX, y: scaleY, z: scaleZ },
      wobble: clamp(
        videoMotion.wobble * (0.65 + physics.lowerBulge * 0.5) *
        (0.9 + fan * 0.12) +
        lateralSpeed * (0.06 + physics.asymmetry * 0.2),
      ),
      deformationRate,
      principalAxisOffsetDeg:
        videoMotion.principalAxisDeg * (0.7 + physics.asymmetry * 0.42),
      flowAttachment,
    };
  }

  reset(fanSpeed = DEFAULT_FAN_PREVIEW_SPEED): void {
    this.position = { x: 0.12, y: fanSpeedToHoverOffsetM(fanSpeed), z: -0.07 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.previousScale = { x: 1, y: 1, z: 1 };
  }
}
