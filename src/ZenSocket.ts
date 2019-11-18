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
  RequestIs,
  SendEmit,
  ResponseObject
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

function create<T extends Topology>(handler: Hander<T>): Server<T> {
  const requests: Map<
    string,
    PromiseActions<ResponseObject<T["localRequests"]>>
  > = new Map();
  let idleQueue: Array<IdleQueueItem> = [];

  const response = createResponse();
  const is = createIs();

  return {
    incoming,
    request: createRequest(),
    emit: createEmit(),
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

  function createEmit(): SendEmit<Topology["localEmits"]> {
    return new Proxy(
      {},
      {
        get: (_target, type) => (data: any) => {
          if (typeof type !== "string") {
            return undefined;
          }
          const request: MessageInternal = {
            kind: "EMIT",
            id: cuid(),
            type,
            data
          };
          handler.outgoing(request);
          return;
        }
      }
    ) as any;
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

  function createIs(): RequestIs<any> {
    return new Proxy(
      {},
      {
        get: (_target, type) => (message: any) => message.type === type
      }
    ) as any;
  }

  function incoming(message: object) {
    if (isMessage(message)) {
      if (message.kind === "RESPONSE") {
        const actions = requests.get(message.id);
        if (!actions) {
          throw new Error(`Invalid response`);
        }
        requests.delete(message.id);
        actions.resolve({
          is: is as any,
          response: { type: message.type, data: message.data }
        });
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
