export interface RequestItem {
  request: object | null;
  response: object | null;
}

export interface Requests {
  [name: string]: RequestItem;
}

export interface Emits {
  [name: string]: object | null;
}

export interface Topology {
  localRequests: Requests;
  remoteRequests: Requests;
  localEmits: Emits;
  remoteEmits: Emits;
}

export type CreateTopology<T extends Topology> = T;

export type RemoteTopology<T extends Topology> = CreateTopology<{
  localRequests: T['remoteRequests'];
  localEmits: T['remoteEmits'];
  remoteRequests: T['localRequests'];
  remoteEmits: T['localEmits'];
}>;

export interface Server<T extends Topology> {
  request: <K extends keyof T['localRequests']>(
    type: K,
    data: T['localRequests'][K]['request']
  ) => Promise<T['localRequests'][K]['response']>;
  emit: <K extends keyof T['localEmits']>(type: K, data: T['localEmits'][K]) => void;
  incoming: (message: object) => void;
  close: () => void;
  idle: () => Promise<void>;
}

export interface Hander<T extends Topology> {
  request: {
    [K in keyof T['remoteRequests']]: (
      data: T['remoteRequests'][K]['request']
    ) => Promise<T['remoteRequests'][K]['response']>;
  };
  emit: {
    [K in keyof T['remoteEmits']]: (args: T['remoteEmits'][K]) => void;
  };
  outgoing: (message: object) => void;
}

export interface PromiseActions {
  resolve(data: unknown): void;
  reject(error: unknown): void;
}

export interface MessageInternal {
  type: string;
  kind: 'EMIT' | 'REQUEST' | 'RESPONSE';
  id: string;
  data: object | null;
}

export interface IdleQueueItem {
  resolve: () => void;
  reject: () => void;
}
