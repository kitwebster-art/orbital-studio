import { describe, expect, it } from "vitest";
import {
  createLinkTransportCommand,
  createMidiTransportCommand,
  createMtcTransportCommand,
  createOscTransportCommand,
  LiveTransport,
  parseTransportCommand,
  serialiseTransportCommand,
  TRANSPORT_COMMAND_SCHEMA_VERSION,
} from "./liveTransport";
import { createGeneratedFallbackTimeline } from "./sequencer";

describe("Ableton-neutral live transport", () => {
  it("uses one versioned command contract for MIDI, OSC, Link and MTC", () => {
    const commands = [
      createMidiTransportCommand("start", 1),
      createOscTransportCommand("/orbital/transport", "clock", 2, { beat: 4 }),
      createLinkTransportCommand("tempo", 3, { tempoBpm: 128 }),
      createMtcTransportCommand(
        { hours: 0, minutes: 1, seconds: 2, frames: 3, fps: 25 },
        4,
      ),
    ];

    for (const command of commands) {
      expect(command.schemaVersion).toBe(TRANSPORT_COMMAND_SCHEMA_VERSION);
      expect(parseTransportCommand(serialiseTransportCommand(command))).toEqual(command);
    }
  });

  it("locks to a source clock, exposes latency, then enters deterministic fallback", () => {
    const transport = new LiveTransport({
      fallbackTimeline: createGeneratedFallbackTimeline({ phrases: 4 }),
      clockLossTimeoutS: 0.2,
    });
    expect(transport.state).toBe("disconnected");
    transport.connect(0);
    transport.receiveCommand(createMidiTransportCommand("start", 0));
    const locked = transport.ingestClock({
      protocol: "midi",
      beat: 0,
      sourceAtMonotonicS: 0,
      receivedAtMonotonicS: 0.1,
      sequence: 1,
    });
    expect(locked.state).toBe("connected");
    expect(locked.clockLocked).toBe(true);
    expect(locked.diagnostics.sourceToRuntimeMs).toBeCloseTo(100, 8);

    const lost = transport.tick(0.3);
    expect(lost.state).toBe("clock-lost");
    expect(lost.fallbackActive).toBe(true);
    expect(lost.clockLocked).toBe(false);
    expect(lost.diagnostics.clockLosses).toBe(1);
    expect(lost.diagnostics.sourceAgeMs).toBeCloseTo(300, 8);
  });

  it("reconnects and recovers from clock loss without selecting Ableton", () => {
    const transport = new LiveTransport({ clockLossTimeoutS: 0.1 });
    transport.connect();
    transport.receiveCommand(createLinkTransportCommand("start", 0));
    transport.ingestClock({ protocol: "link", beat: 2, receivedAtMonotonicS: 0, sequence: 1 });
    transport.tick(0.2);
    expect(transport.clockLost).toBe(true);

    expect(transport.reconnect(0.3).state).toBe("reconnecting");
    expect(transport.connect(0.4).state).toBe("connected");
    expect(transport.diagnostics.reconnects).toBe(1);

    const recovered = transport.ingestClock({
      protocol: "link",
      beat: 3,
      receivedAtMonotonicS: 0.5,
      sequence: 3,
    });
    expect(recovered.state).toBe("connected");
    expect(recovered.fallbackActive).toBe(false);
    expect(recovered.clockLocked).toBe(true);
    expect(recovered.diagnostics.droppedClockSamples).toBe(1);
  });

  it("routes semantic seek and tempo commands to both primary and fallback clocks", () => {
    const transport = new LiveTransport();
    transport.connect();
    transport.receiveCommand(createOscTransportCommand("/orbital/seek", "seek", 1, { beat: 8 }));
    expect(transport.currentBeat).toBe(8);
    transport.receiveCommand(createLinkTransportCommand("tempo", 2, { tempoBpm: 60 }));
    expect(transport.sequencer.bpm).toBe(60);
    transport.send(createMidiTransportCommand("ping", 3));
    expect(transport.drainOutgoing()).toHaveLength(1);
    expect(transport.drainOutgoing()).toEqual([]);
  });
});
