import cuid from 'cuid';
import { Hander, MessageInternal, PromiseActions, RemoteTopology, Server, Topology, IdleQueueItem } from './types';
import { isMessage } from './utils';

export const ZenSocket = {
  createLocal,
  createRemote,
};

function createLocal<T extends Topology>(handler: Hander<T>): Server<T> {
  return create(handler);
}

function createRemote<T extends Topology>(handler: Hander<RemoteTopology<T>>): Server<RemoteTopology<T>> {
  return create(handler);
}

function create(handler: Hander<any>): Server<any> {
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
      if (message.kind === 'EMIT') {
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
