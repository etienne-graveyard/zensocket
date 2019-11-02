import cuid from 'cuid';

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
  clientRequests: Requests;
  serverRequests: Requests;
  clientEmits: Emits;
  serverEmits: Emits;
}

export type CreateTopology<T extends Topology> = T;

interface LocalTopo {
  localRequests: Requests;
  localEmits: Emits;
  remoteRequests: Requests;
  remoteEmits: Emits;
}

type CreateLocalTopo<T extends LocalTopo> = T;

type ServerTopo<T extends Topology> = CreateLocalTopo<{
  localRequests: T['serverRequests'];
  localEmits: T['serverEmits'];
  remoteRequests: T['clientRequests'];
  remoteEmits: T['clientEmits'];
}>;

type ClientTopo<T extends Topology> = CreateLocalTopo<{
  localRequests: T['clientRequests'];
  localEmits: T['clientEmits'];
  remoteRequests: T['serverRequests'];
  remoteEmits: T['serverEmits'];
}>;

interface Server<T extends LocalTopo> {
  request: {
    [K in keyof T['localRequests']]: (
      args: T['localRequests'][K]['request']
    ) => Promise<T['localRequests'][K]['response']>;
  };
  emit: {
    [K in keyof T['localEmits']]: (args: T['localEmits'][K]) => void;
  };
  incoming: (message: object) => void;
}

interface Hander<T extends LocalTopo> {
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

interface PromiseActions {
  resolve(data: unknown): void;
  reject(error: unknown): void;
}

interface MessageInternal {
  type: string;
  kind: 'EMIT' | 'REQUEST' | 'RESPONSE';
  id: string;
  data: object | null;
}

function isMessage(message: any): message is MessageInternal {
  if ('type' in message && 'kind' in message && 'id' in message && 'data' in message) {
    const mess = message as any;
    if (
      typeof mess.type === 'string' &&
      typeof mess.id === 'string' &&
      ['EMIT', 'REQUEST', 'RESPONSE'].indexOf(mess.kind) >= 0
    ) {
      return true;
    }
  }
  return false;
}

export function createClient<T extends Topology>(handler: Hander<ClientTopo<T>>): Server<ClientTopo<T>> {
  return create(handler);
}

export function createServer<T extends Topology>(handler: Hander<ServerTopo<T>>): Server<ServerTopo<T>> {
  return create(handler);
}

export function create(handler: Hander<any>): Server<any> {
  const requests: Map<string, PromiseActions> = new Map();

  return {
    incoming,
  };

  function incoming(message: object) {
    if (isMessage(message)) {
      console.log(message);

      return;
    }
    console.warn('Invalid message');
    return;
  }
}
