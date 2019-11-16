import cuid from "cuid";
import {
  Hander,
  MessageInternal,
  PromiseActions,
  RemoteTopology,
  Server,
  Topology,
  IdleQueueItem,
  SendRequest,
  MessageIs
} from "./types";
import { isMessage } from "./utils";

export const ZenSocket = {
  createLocal,
  createRemote
};

function createLocal<T extends Topology>(handler: Hander<T>): Server<T> {
  return create(handler);
}

function createRemote<T extends Topology>(
  handler: Hander<RemoteTopology<T>>
): Server<RemoteTopology<T>> {
  return create(handler);
}

function create(handler: Hander<any>): Server<any> {
  const requests: Map<string, PromiseActions> = new Map();
  let idleQueue: Array<IdleQueueItem> = [];

  const response = createResponse();
  const is = createIs();

  return {
    incoming,
    request: createRequest(),
    emit,
    idle,
    close
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
      idleQueue.push({ resolve, reject: () => reject("Connection Error") });
    });
    return prom;
  }

  function createRequest(): SendRequest<Topology["localRequests"]> {
    return new Proxy(
      {},
      {
        get: (_target, type) => (data: any) => {
          if (typeof type !== "string") {
            return undefined;
          }
          return new Promise((resolve, reject): void => {
            const request: MessageInternal = {
              kind: "REQUEST",
              id: cuid(),
              type,
              data
            };
            requests.set(request.id, { resolve, reject });
            handler.outgoing(request);
          });
        }
      }
    ) as any;
  }

  function createResponse(): any {
    return new Proxy(
      {},
      {
        get: (_target, type) => (data: any) => {
          if (typeof type !== "string") {
            return undefined;
          }
          return { type, data };
        }
      }
    ) as any;
  }

  function createIs(): MessageIs<any> {
    return new Proxy(
      {},
      {
        get: (_target, type) => (message: any) => message.type === type
      }
    ) as any;
  }

  async function emit(
    type: string | number | symbol,
    data: object
  ): Promise<void> {
    if (typeof type !== "string") {
      throw new Error("type should be a string");
    }
    const message: MessageInternal = {
      id: cuid(),
      data,
      kind: "EMIT",
      type
    };
    handler.outgoing(message);
  }

  function incoming(message: object) {
    if (isMessage(message)) {
      if (message.kind === "RESPONSE") {
        const actions = requests.get(message.id);
        if (!actions) {
          throw new Error(`Invalid response`);
        }
        requests.delete(message.id);
        actions.resolve({ type: message.type, data: message.data });
        resolveIdle();
        return;
      }
      if (message.kind === "REQUEST") {
        if (!handler.request) {
          throw new Error("Missing request handler ?");
        }
        return handler
          .request(
            {
              type: message.type,
              data: message.data,
              response: response
            },
            is
          )
          .then((res: any) => {
            const response: MessageInternal = {
              kind: "RESPONSE",
              id: message.id,
              data: res.data,
              type: res.type
            };
            handler.outgoing(response);
          });
      }
      if (message.kind === "EMIT") {
        const emitHandler = handler.emit[message.type];
        if (!emitHandler) {
          throw new Error("Invalid message");
        }
        return emitHandler(message.data);
      }
      throw new Error("Invalid message");
    }
    console.warn("Invalid message");
    return;
  }
}
