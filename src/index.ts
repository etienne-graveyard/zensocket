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
  request: <K extends keyof T['localRequests']>(
    type: K,
    data: T['localRequests'][K]['request']
  ) => Promise<T['localRequests'][K]['response']>;
  emit: <K extends keyof T['localEmits']>(type: K, data: T['localEmits'][K]) => void;
  incoming: (message: object) => void;
  close: () => void;
  idle: () => Promise<void>;
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

interface IdleQueueItem {
  resolve: () => void;
  reject: () => void;
}

export function create(handler: Hander<any>): Server<any> {
  const requests: Map<string, PromiseActions> = new Map();
  let idleQueue: Array<IdleQueueItem> = [];

  return {
    incoming,
    request,
    emit,
    idle,
    close,
  };

  function close() {
    // reject all item in the queue
    while (idleQueue.length > 0) {
      const next = idleQueue.shift();
      if (next) {
        next.reject();
      }
    }
  }

  function resolveIdle() {
    while (requests.size === 0 && idleQueue.length > 0) {
      const next = idleQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  async function idle(): Promise<void> {
    if (requests.size === 0) {
      return Promise.resolve();
    }
    const prom = new Promise<void>((resolve, reject) => {
      idleQueue.push({ resolve, reject: () => reject('Connection Error') });
    });
    return prom;
  }

  async function request(type: string | number | symbol, data: object): Promise<any> {
    if (typeof type !== 'string') {
      throw new Error('type should be a string');
    }
    return new Promise((resolve, reject): void => {
      const request: MessageInternal = {
        kind: 'REQUEST',
        id: cuid(),
        type,
        data,
      };
      requests.set(request.id, { resolve, reject });
      handler.outgoing(request);
    });
  }

  async function emit(type: string | number | symbol, data: object): Promise<void> {
    if (typeof type !== 'string') {
      throw new Error('type should be a string');
    }
    const message: MessageInternal = {
      id: cuid(),
      data,
      kind: 'EMIT',
      type,
    };
    handler.outgoing(message);
  }

  function incoming(message: object) {
    if (isMessage(message)) {
      if (message.kind === 'RESPONSE') {
        const actions = requests.get(message.id);
        if (!actions) {
          throw new Error(`Invalid response`);
        }
        requests.delete(message.id);
        actions.resolve(message.data);
        resolveIdle();
        return;
      }
      if (message.kind === 'REQUEST') {
        const reqHandler = handler.request[message.type];
        if (!reqHandler) {
          throw new Error('Invalid message');
        }
        return reqHandler(message.data).then(data => {
          const response: MessageInternal = {
            kind: 'RESPONSE',
            id: message.id,
            data,
            type: message.type,
          };
          handler.outgoing(response);
        });
      }
      if (message.type === 'EMIT') {
        const emitHandler = handler.emit[message.type];
        if (!emitHandler) {
          throw new Error('Invalid message');
        }
        return emitHandler(message.data);
      }
      throw new Error('Invalid message');
    }
    console.warn('Invalid message');
    return;
  }
}
