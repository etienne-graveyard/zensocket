export type Outgoing = (msg: any) => void;

export interface ZensocketClient {
  connected(outgoing: Outgoing): void;
  disconnected(): void;
  incoming(message: any): void;
  destroy(): void;
}

export interface ZensocketServer {
  incoming(message: any): void;
  destroy(): void;
}
