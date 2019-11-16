const OPAQUE = Symbol("OPAQUE");

type MessagesDefAny = { [key: string]: MessageBuilder<any, any> };

export type CreateMessages<T extends MessagesDefAny> = {
  [K in keyof T]: T[K] & { type: K };
};

export type MessagesAny = CreateMessages<MessagesDefAny>;

interface MessageResponse {
  [OPAQUE]: true;
}

export type MessageBuilder<Data, Res extends { [key: string]: any }> = {
  [OPAQUE]: true;
  data: Data;
  res: Res;
};

type MessagesObject<Messages extends MessagesAny> = {
  [K in keyof Messages]: {
    type: K;
    data: Messages[K]["data"];
    response: {
      [L in keyof Messages[K]["res"]]: (
        data: Messages[K]["res"][L]
      ) => MessageResponse;
    };
  };
};

type MessageObject<Messages extends MessagesAny> = MessagesObject<
  Messages
>[keyof Messages];

export type MessageAny<Messages extends MessagesAny> = Messages[keyof Messages];

export interface Emits {
  [name: string]: object | null;
}

export interface Topology {
  localRequests: MessagesAny;
  remoteRequests: MessagesAny;
  localEmits: Emits;
  remoteEmits: Emits;
}

export type CreateTopology<T extends Topology> = T;

export type RemoteTopology<T extends Topology> = CreateTopology<{
  localRequests: T["remoteRequests"];
  localEmits: T["remoteEmits"];
  remoteRequests: T["localRequests"];
  remoteEmits: T["localEmits"];
}>;

type ResponseAny<M extends MessageBuilder<any, any>> = {
  [K in keyof M]: M[K] & { type: K };
}[keyof M];

export type SendRequest<Messages extends MessagesAny> = {
  [K in keyof Messages]: (
    data: Messages[K]["data"]
  ) => Promise<ResponseAny<Messages[K]["res"]>>;
};

export interface Server<T extends Topology> {
  request: SendRequest<T["localRequests"]>;
  emit: <K extends keyof T["localEmits"]>(
    type: K,
    data: T["localEmits"][K]
  ) => void;
  incoming: (message: object) => void;
  close: () => void;
  idle: () => Promise<void>;
}

export type MessageIs<Messages extends MessagesAny> = {
  [K in keyof Messages]: (
    message: MessageObject<Messages>
  ) => message is MessagesObject<Messages>[K];
};

type RequestHandler<Messages extends MessagesAny> = MessageAny<
  Messages
> extends never
  ? null
  : (
      message: MessageObject<Messages>,
      is: MessageIs<Messages>
    ) => Promise<MessageResponse>;

export interface Hander<T extends Topology> {
  request: RequestHandler<T["remoteRequests"]>;
  emit: {
    [K in keyof T["remoteEmits"]]: (args: T["remoteEmits"][K]) => void;
  };
  outgoing: (message: object) => void;
}

export interface PromiseActions {
  resolve(data: unknown): void;
  reject(error: unknown): void;
}

export interface MessageInternal {
  type: string;
  kind: "EMIT" | "REQUEST" | "RESPONSE";
  id: string;
  data: object | null;
}

export interface IdleQueueItem {
  resolve: () => void;
  reject: () => void;
}
