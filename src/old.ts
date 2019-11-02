import cuid from 'cuid';
import { SubscribeMethod } from 'suub';

export type ConnectionRequestId = string;

export type CreateTopology<T extends Requests> = T;

export interface ConnectionRequest<Topology extends Requests> {
  type: 'REQUEST';
  id: ConnectionRequestId;
  data: Topology[keyof Topology]['request'];
}

export interface ConnectionResponse<Topology extends Requests> {
  type: 'RESPONSE';
  responseTo: ConnectionRequestId;
  data: Topology[keyof Topology]['response'];
}

export interface ConnectionEmit<Emit> {
  type: 'EMIT';
  data: Emit;
}

export type LocalMessage<LocalTopology extends Requests, RemoteTopology extends Requests, LocalEmit> =
  | ConnectionRequest<LocalTopology>
  | ConnectionResponse<RemoteTopology>
  | ConnectionEmit<LocalEmit>;

export type RemoteMessage<LocalTopology extends Requests, RemoteTopology extends Requests, RemoteEmit> =
  | ConnectionResponse<LocalTopology>
  | ConnectionRequest<RemoteTopology>
  | ConnectionEmit<RemoteEmit>;

export interface Connection<LocalTopology extends Requests, LocalEmit> {
  request<K extends keyof LocalTopology>(
    key: K,
    message: LocalTopology[K]['request']
  ): Promise<LocalTopology[K]['response']>;
  emit(message: LocalEmit): void;
  idle(): Promise<void>;
}

export const Connection = {
  create: createConnection,
};

interface PromiseActions {
  resolve(data: unknown): void;
  reject(error: unknown): void;
}

export interface Socket<LocalTopology extends Requests, RemoteTopology extends Requests, LocalEmit, RemoteEmit> {
  onMessage: SubscribeMethod<RemoteMessage<LocalTopology, RemoteTopology, RemoteEmit>>;
  onClose: SubscribeMethod<void>;
  onOpen: SubscribeMethod<void>;
  connect: () => Promise<void>;
  emit(message: LocalMessage<LocalTopology, RemoteTopology, LocalEmit>): void;
}

type Switch<Topology extends Requests> = {
  [K in keyof Topology]: (msg: Topology[K]['request']) => Promise<Topology[K]['response']>;
};

interface Options<LocalTopology extends Requests, RemoteTopology extends Requests, LocalEmit, RemoteEmit> {
  socket: Socket<LocalTopology, RemoteTopology, LocalEmit, RemoteEmit>;
  requestIs: (msg: RemoteTopology[keyof RemoteTopology]['request'], key: keyof RemoteTopology) => boolean;
  onEmit: (msg: RemoteEmit) => void;
  onRequest: Switch<RemoteTopology>;
}

interface IdleQueueItem {
  resolve: () => void;
  reject: () => void;
}

function createConnection<LocalTopology extends Requests, RemoteTopology extends Requests, LocalEmit, RemoteEmit>(
  options: Options<LocalTopology, RemoteTopology, LocalEmit, RemoteEmit>
): Connection<LocalTopology, LocalEmit> {
  const { socket, onEmit, requestIs, onRequest } = options;

  let idleQueue: Array<IdleQueueItem> = [];

  const requests: Map<ConnectionRequestId, PromiseActions> = new Map();

  function resolveIdle() {
    while (requests.size === 0 && idleQueue.length > 0) {
      const next = idleQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  socket.onClose(() => {
    // reject all item in the queue
    while (idleQueue.length > 0) {
      const next = idleQueue.shift();
      if (next) {
        next.reject();
      }
    }
  });

  socket.onMessage(async message => {
    if (message.type === 'RESPONSE') {
      const actions = requests.get(message.responseTo);
      if (!actions) {
        throw new Error(`Invalid response`);
      }
      requests.delete(message.responseTo);
      actions.resolve(message.data);
      resolveIdle();
      return;
    } else if (message.type === 'REQUEST') {
      const keys = Object.keys(onRequest);
      const key = keys.find((key): boolean => requestIs(message.data, key));
      if (!key) {
        throw new Error('Invalid message');
      }
      const requestHandler = onRequest[key];
      const responseData = await requestHandler(message.data);
      const response: ConnectionResponse<RemoteTopology> = {
        type: 'RESPONSE',
        responseTo: message.id,
        data: responseData,
      };
      socket.emit(response);
      return;
    } else if (message.type === 'EMIT') {
      onEmit(message.data);
      return;
    } else {
      throw new Error('Invalid message');
    }
  });

  function request<K extends keyof LocalTopology>(
    _key: K,
    message: LocalTopology[K]['request']
  ): Promise<LocalTopology[K]['response']> {
    return new Promise((resolve, reject): void => {
      const request: ConnectionRequest<LocalTopology> = {
        type: 'REQUEST',
        id: cuid(),
        data: message,
      };
      requests.set(request.id, { resolve, reject });
      socket.emit(request);
    });
  }

  function send(message: LocalEmit): void {
    const emit: ConnectionEmit<LocalEmit> = {
      type: 'EMIT',
      data: message,
    };
    socket.emit(emit);
  }

  async function idle(): Promise<void> {
    await socket.connect();
    if (requests.size === 0) {
      return Promise.resolve();
    }
    const prom = new Promise<void>((resolve, reject) => {
      idleQueue.push({ resolve, reject: () => reject('Connection Error') });
    });
    return prom;
  }

  const result: Connection<LocalTopology, LocalEmit> = {
    emit: send,
    request,
    idle,
  };

  return result;
}
