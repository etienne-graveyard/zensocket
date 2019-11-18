// Definition

const OPAQUE = Symbol("OPAQUE");

interface MessageResponse {
  [OPAQUE]: true;
}

type ResponseGroupDef = { [key: string]: object };

type GroupDef = { [key: string]: MessageDef<any, any> };

export type MessageDef<Data, Res extends ResponseGroupDef> = {
  [OPAQUE]: true;
  data: Data;
  res: Res;
};

export interface EmitsDef {
  [name: string]: object | null;
}

export interface Topology {
  localRequests: GroupDef;
  remoteRequests: GroupDef;
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

type RequestResolved<M extends GroupDef> = {
  [K in keyof M]: {
    type: K;
    data: M[K]["data"];
    response: {
      [L in keyof M[K]["res"]]: (data: M[K]["res"][L]) => MessageResponse;
    };
  };
};

export type RequestIs<M extends GroupDef> = {
  [K in keyof M]: (
    message: AnyKey<RequestResolved<M>>
  ) => message is RequestResolved<M>[K];
};

type RequestHandler<M extends GroupDef> = AnyKey<M> extends never
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

type ResponseResolved<M extends ResponseGroupDef> = {
  [K in keyof M]: {
    type: K;
    data: M[K];
  };
};

export type ResponseIs<M extends ResponseGroupDef> = {
  [K in keyof M]: (
    message: AnyKey<ResponseResolved<M>>
  ) => message is ResponseResolved<M>[K];
};

export type ResponseObject<Res extends GroupDef> = {
  response: AnyKey<ResponseResolved<Res>>;
  is: ResponseIs<Res>;
};

export type SendRequestOptions = {
  timeout?: number;
};

export type SendRequest<M extends GroupDef> = {
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
