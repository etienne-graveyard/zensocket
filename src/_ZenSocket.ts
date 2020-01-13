import cuid from "cuid";
import {
  Hander,
  MessageInternal,
  RemoteTopology,
  Server,
  Messages,
  IdleQueueItem,
  SendRequest,
  RequestIs,
  SendEmit,
  ResponseObject,
  SendRequestOptions
} from "./types";
import { isMessageInternal } from "./utils";
import { RequestController } from "./RequestController";

export const ZenSocket = {
  createLocal,
  createRemote
};

function createLocal<T extends Messages>(handler: Hander<T>): Server<T> {
  return create(handler);
}

function createRemote<T extends Messages>(
  handler: Hander<RemoteTopology<T>>
): Server<RemoteTopology<T>> {
  return create(handler);
}

function create<T extends Messages>(handler: Hander<T>): Server<T> {
  let currentHandler: Hander<T> = handler;
  const requests: Map<
    string,
    RequestController<ResponseObject<T["localRequests"]>>
  > = new Map();
  let idleQueue: Array<IdleQueueItem> = [];

  const response = createResponse();
  const is = createIs();

  return {
    update: replaceHandler,
    incoming,
    request: createRequest(),
    emit: createEmit(),
    idle,
    close
  };

  function replaceHandler(handler: Hander<T>) {
    currentHandler = handler;
  }

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

  function createEmit(): SendEmit<Messages["localEmits"]> {
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
          currentHandler.outgoing(request);
          return;
        }
      }
    ) as any;
  }

  function createRequest(): SendRequest<Messages["localRequests"]> {
    return new Proxy(
      {},
      {
        get: (_target, type) => (
          data: any,
          options: SendRequestOptions = {}
        ) => {
          const { timeout = 5000 } = options;
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
            requests.set(
              request.id,
              RequestController.create(resolve, reject, timeout)
            );
            currentHandler.outgoing(request);
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
    if (isMessageInternal(message)) {
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
        if (!currentHandler.request) {
          throw new Error("Missing request handler ?");
        }
        return currentHandler
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
            currentHandler.outgoing(response);
          });
      }
      if (message.kind === "EMIT") {
        const emitHandler = currentHandler.emit[message.type];
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
