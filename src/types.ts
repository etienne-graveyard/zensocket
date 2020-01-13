export const MESSAGE = Symbol("MESSAGE");
export const MANAGER = Symbol("MANAGER");
// const HANDLER = Symbol("HANDLER");

export type Messages = { [key: string]: MessageAny };

export type MessageAny = Message<any, any>;

export interface Message<Data, Responses extends Messages> {
  [MESSAGE]: true;
  data: Data;
  responses: Responses;
  withResponses: <R extends Messages>(
    responses: R
  ) => Message<Data, Responses & R>;
}

type MessageSender<
  ResponseTopo extends Messages,
  K extends keyof ResponseTopo
> = (data: ResponseTopo[K]["data"]) => Promise<Manager<{}>>;

export type TopologySender<ResponseTopo extends Messages> = {
  [K in keyof ResponseTopo]: MessageSender<ResponseTopo, K>;
};

export type ExecRunner<Topo extends Messages> = (
  manager: Manager<Topo>
) => Manager<any> | Promise<Manager<any>>;

export interface Manager<M extends Messages> {
  [MANAGER]: M;
  type: keyof M;
  data: M[keyof M]["data"];
  send: TopologySender<M[keyof M]["responses"]>;
  is: <T extends keyof M>(type: T) => this is Manager<Pick<M, T>>;
  isOneOf: <T extends keyof M>(
    type: ReadonlyArray<T>
  ) => this is Manager<Pick<M, T>>;
  include: <T extends keyof M>(types: ReadonlyArray<T>) => Manager<Pick<M, T>>;
  exclude: <T extends keyof M>(types: ReadonlyArray<T>) => Manager<Omit<M, T>>;
  handle: <T extends Partial<TopologyHandler<M>>>(
    handlers: T
  ) => Manager<Omit<M, keyof T>>;
  exec: (...runners: Array<ExecRunner<M>>) => Manager<M>;
  // void response
  void: () => Manager<M>;
  // stop the current level
  break: () => Manager<M>;
  try: <T extends Messages>(
    runner: (manager: Manager<M>) => Manager<T> | Promise<Manager<T>>
  ) => {
    catch: (
      runner: (
        manager: Manager<M>,
        error: any
      ) => Manager<any> | Promise<Manager<any>>
    ) => Manager<T>;
  };
}

export type MessageHandler<
  Topo extends Messages,
  M extends keyof Topo
> = keyof Topo[M]["responses"] extends never
  ? (
      response: Manager<Pick<Topo, M>>,
      data: Topo[M]["data"]
    ) => Promise<void | Manager<any>>
  : (
      response: Manager<Pick<Topo, M>>,
      data: Topo[M]["data"]
    ) => Promise<Manager<any>>;

export type TopologyHandler<Topo extends Messages> = {
  [K in keyof Topo]: MessageHandler<Topo, K>;
};

export type WithResponses<Res> = <Topo extends Messages>(
  topo: Topo
) => {
  [K in keyof Topo]: Topo[K] extends Message<infer D, infer R>
    ? Message<D, R & Res>
    : never;
};

// export type UnhandledTopology<
//   Topo extends Topology,
//   H extends Partial<TopologyHandler<Topo>>
// > = Omit<Topo, keyof H>;

// export type TopologyResponse<Topo extends Topology> = Response<
//   Topo[keyof Topo]["responses"]
// >;

// const OPAQUE = Symbol("OPAQUE");

// interface MessageResponse {
//   [OPAQUE]: true;
// }

// export type ResponseGroup = { [key: string]: object };

// type RequestGroup = { [key: string]: Request<any, any> };

// export type Request<Data, Res extends ResponseGroup> = {
//   [OPAQUE]: true;
//   data: Data;
//   res: Res;
// };

// export interface EmitsDef {
//   [name: string]: object | null;
// }

// export interface Topology {
//   localRequests: RequestGroup;
//   remoteRequests: RequestGroup;
//   localEmits: EmitsDef;
//   remoteEmits: EmitsDef;
// }

// // Used to validated the created type
// export type CreateTopology<T extends Topology> = T;

// export type RemoteTopology<T extends Topology> = CreateTopology<{
//   localRequests: T["remoteRequests"];
//   localEmits: T["remoteEmits"];
//   remoteRequests: T["localRequests"];
//   remoteEmits: T["localEmits"];
// }>;

// // Handler

// type RequestResolved<M extends RequestGroup> = {
//   [K in keyof M]: {
//     type: K;
//     data: M[K]["data"];
//     response: {
//       [L in keyof M[K]["res"]]: (data: M[K]["res"][L]) => MessageResponse;
//     };
//   };
// };

// export type RequestIs<M extends RequestGroup> = {
//   [K in keyof M]: (
//     message: AnyKey<RequestResolved<M>>
//   ) => message is RequestResolved<M>[K];
// };

// type RequestHandler<M extends RequestGroup> = AnyKey<M> extends never
//   ? null
//   : (
//       message: AnyKey<RequestResolved<M>>,
//       is: RequestIs<M>
//     ) => Promise<MessageResponse>;

// export interface Hander<T extends Topology> {
//   request: RequestHandler<T["remoteRequests"]>;
//   emit: {
//     [K in keyof T["remoteEmits"]]: (args: T["remoteEmits"][K]) => void;
//   };
//   outgoing: (message: object) => void;
// }

// // Send

// type ResponseResolved<M extends ResponseGroup> = {
//   [K in keyof M]: {
//     type: K;
//     data: M[K];
//   };
// };

// export type ResponseIs<M extends ResponseGroup> = {
//   [K in keyof M]: (
//     message: AnyKey<ResponseResolved<M>>
//   ) => message is ResponseResolved<M>[K];
// };

// export type ResponseObject<Res extends RequestGroup> = {
//   response: AnyKey<ResponseResolved<Res>>;
//   is: ResponseIs<Res>;
// };

// export type SendRequestOptions = {
//   timeout?: number;
// };

// export type SendRequest<M extends RequestGroup> = {
//   [K in keyof M]: (
//     data: M[K]["data"],
//     options?: SendRequestOptions
//   ) => Promise<ResponseObject<M[K]["res"]>>;
// };

// export type SendEmit<M extends EmitsDef> = {
//   [K in keyof M]: (data: M[K]) => void;
// };

// // Server

// export interface Server<T extends Topology> {
//   update: (handler: Hander<T>) => void;
//   request: SendRequest<T["localRequests"]>;
//   emit: SendEmit<T["localEmits"]>;
//   incoming: (message: object) => void;
//   close: () => void;
//   idle: () => Promise<void>;
// }

// // Internal

// export type AnyKey<T extends { [key: string]: any }> = T[keyof T];

// export interface MessageInternal {
//   type: string;
//   kind: "EMIT" | "REQUEST" | "RESPONSE";
//   id: string;
//   data: any;
// }

// export interface IdleQueueItem {
//   resolve: () => void;
//   reject: () => void;
// }

// export interface Manager<Topo extends Topology> {
//   [HANDLER]: Topo;
//   // response: Response<Topo[keyof Topo]["responses"]> | null;
//   send: TopologySender<Topo[keyof Topo]["responses"]>;
//   include: <T extends keyof Topo>(
//     types: ReadonlyArray<T>
//   ) => Manager<Pick<Topo, T>>;
//   exclude: <T extends keyof Topo>(
//     types: ReadonlyArray<T>
//   ) => Manager<Omit<Topo, T>>;
//   handle: <T extends Partial<TopologyHandler<Topo>>>(
//     handlers: T
//   ) => Manager<Omit<Topo, keyof T>>;
//   exec: (
//     runner: (
//       handler: Manager<Topo>,
//       message: Manager<Topo>
//     ) => Promise<Response<Topo[keyof Topo]["responses"]> | null | void>
//   ) => Manager<Topo>;
//   run: (message: Manager<Topo>) => Promise<Response<Topo> | null>;
// }
