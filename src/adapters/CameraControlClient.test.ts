import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraControlClient } from './CameraControlClient';
class FakeSocket {
  static OPEN = 1;
  static sockets: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) { FakeSocket.sockets.push(this); }
  close() { this.readyState = 3; }
  send(data: string) { this.sent.push(data); }
  open() { this.readyState = 1; this.onopen?.(); }
}
describe('camera control connection ownership', () => {
  beforeEach(() => { vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('window', globalThis); FakeSocket.sockets = []; });
  afterEach(() => vi.unstubAllGlobals());
  it('late close from an old connection cannot reject requests on its replacement', async () => {
    const client = new CameraControlClient();
    const first = client.connect('ws://localhost:8765'); const a = FakeSocket.sockets[0]; a.open(); await first;
    const second = client.connect('ws://localhost:8766'); const b = FakeSocket.sockets[1]; b.open(); await second;
    const result = client.request('status'); a.onclose?.();
    const request = JSON.parse(b.sent[0]);
    b.onmessage?.({ data: JSON.stringify({ schema_version: 'orbital.camera-control-result/1.0', request_id: request.request_id, ok: true, status: {} }) });
    expect((await result).ok).toBe(true);
    expect(() => client.assertEndpoint('ws://localhost:8765')).toThrow(/URL changed/);
    expect(() => client.assertEndpoint('ws://localhost:8766')).not.toThrow();
    client.disconnect();
  });
  it('disconnect invalidates endpoint and outstanding commands', async () => {
    const client = new CameraControlClient(); const connected = client.connect('ws://localhost:8765');
    const socket = FakeSocket.sockets[0]; socket.open(); await connected;
    const pending = client.request('status'); const rejection = expect(pending).rejects.toThrow(/closed/);
    socket.onclose?.(); await rejection; expect(client.endpoint).toBeNull();
  });
  it('routes calibration messages separately and sends acks', async () => {
    const client = new CameraControlClient(); const connected = client.connect('ws://localhost:8765');
    const socket = FakeSocket.sockets[0]; socket.open(); await connected;
    const seen: unknown[] = []; client.onCalibrationMessage = m => seen.push(m);
    const start = client.request('calibrate', { settings: { projector_width: 1920, projector_height: 1080 } }, 'cal-1');
    expect(JSON.parse(socket.sent[0])).toMatchObject({ request_id: 'cal-1', action: 'calibrate' });
    socket.onmessage?.({ data: JSON.stringify({ schema_version: 'orbital.calibration-pattern/1.0', session_id: 'cal-1', index: 0, total: 2, pattern: { kind: 'black' } }) });
    socket.onmessage?.({ data: JSON.stringify({ schema_version: 'orbital.camera-control/1.0', request_id: 'b', action: 'calibrate-cancel' }) });
    socket.onmessage?.({ data: JSON.stringify({ schema_version: 'orbital.camera-control-result/1.0', request_id: 'cal-1', ok: true, status: {} }) });
    expect((await start).ok).toBe(true); expect(seen).toHaveLength(2);
    expect(client.send({ schema_version: 'orbital.calibration-pattern-ack/1.0', session_id: 'cal-1', index: 0 })).toBe(true);
    expect(JSON.parse(socket.sent[1]).index).toBe(0);
    client.disconnect(); expect(client.send({})).toBe(false);
  });
});
