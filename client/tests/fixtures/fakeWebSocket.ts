// A minimal WebSocket stand-in so net/socket.ts can be driven in jsdom without a server.
import type { S2C } from "../../src/net/protocol";

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  binaryType = "blob";
  sent: unknown[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Deliver a server message to the client. */
  emit(msg: S2C): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** Deliver a binary frame (the partner's voice in voice rooms). */
  emitBinary(data: ArrayBuffer): void {
    this.onmessage?.({ data });
  }
}
