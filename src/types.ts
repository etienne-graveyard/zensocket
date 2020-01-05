// Definition

const OPAQUE = Symbol("OPAQUE");

interface MessageResponse {
  [OPAQUE]: true;
}

export type ResponseGroup = { [key: string]: object };

type RequestGroup = { [key: string]: Request<any, any> };

export type Request<Data, Res extends ResponseGroup> = {
  [OPAQUE]: true;
  data: Data;
  res: Res;
};

export interface EmitsDef {
  [name: string]: object | null;
}

export interface Topology {
  localRequests: RequestGroup;
  remoteRequests: RequestGroup;
  localEmits: EmitsDef;
  remoteEmits: EmitsDef;
}

// Used to validated the created type
export type CreateTopology<T extends Topology> = T;

export type RemoteTopology<T extends Topology> = CreateTopology<{
  localRequests: T["remoteRequests"];
  localEmits: T["remoteEmits"];
  remoteRequests: T["localRequests"];
  remoteEmits: T["localEmits"];
}>;

// Handler

type RequestResolved<M extends RequestGroup> = {
  [K in keyof M]: {
    type: K;
    data: M[K]["data"];
    response: {
      [L in keyof M[K]["res"]]: (data: M[K]["res"][L]) => MessageResponse;
    };
  };
};

export type RequestIs<M extends RequestGroup> = {
  [K in keyof M]: (
    message: AnyKey<RequestResolved<M>>
  ) => message is RequestResolved<M>[K];
};

type RequestHandler<M extends RequestGroup> = AnyKey<M> extends never
  ? null
  : (
      message: AnyKey<RequestResolved<M>>,
      is: RequestIs<M>
    ) => Promise<MessageResponse>;

export interface Hander<T extends Topology> {
  request: RequestHandler<T["remoteRequests"]>;
  emit: {
    [K in keyof T["remoteEmits"]]: (args: T["remoteEmits"][K]) => void;
  };
  outgoing: (message: object) => void;
}

// Send

type ResponseResolved<M extends ResponseGroup> = {
  [K in keyof M]: {
    type: K;
    data: M[K];
  };
};

export type ResponseIs<M extends ResponseGroup> = {
  [K in keyof M]: (
    message: AnyKey<ResponseResolved<M>>
  ) => message is ResponseResolved<M>[K];
};

export type ResponseObject<Res extends RequestGroup> = {
  response: AnyKey<ResponseResolved<Res>>;
  is: ResponseIs<Res>;
};

export type SendRequestOptions = {
  timeout?: number;
};

export type SendRequest<M extends RequestGroup> = {
  [K in keyof M]: (
    data: M[K]["data"],
    options?: SendRequestOptions
  ) => Promise<ResponseObject<M[K]["res"]>>;
};

export type SendEmit<M extends EmitsDef> = {
  [K in keyof M]: (data: M[K]) => void;
};

// Server

export interface Server<T extends Topology> {
  update: (handler: Hander<T>) => void;
  request: SendRequest<T["localRequests"]>;
  emit: SendEmit<T["localEmits"]>;
  incoming: (message: object) => void;
  close: () => void;
  idle: () => Promise<void>;
}

// Internal

export type AnyKey<T extends { [key: string]: any }> = T[keyof T];

export interface MessageInternal {
  type: string;
  kind: "EMIT" | "REQUEST" | "RESPONSE";
  id: string;
  data: any;
}

export interface IdleQueueItem {
  resolve: () => void;
  reject: () => void;
}
