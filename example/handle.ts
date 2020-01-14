import { Requests, Responses, Topology } from "./lib";

const RECEIVED = Symbol("RECEIVED");
const SENT = Symbol("SENT");

export interface Received<M extends Requests> {
  [RECEIVED]: true;
  type: keyof M;
  data: M[keyof M]["data"];
  send: TopologySender<M[keyof M]["responses"]>;
  is: <T extends keyof M>(type: T) => this is Received<Pick<M, T>>;
  isOneOf: <T extends keyof M>(
    type: ReadonlyArray<T>
  ) => this is Received<Pick<M, T>>;
  include: <T extends keyof M>(types: ReadonlyArray<T>) => Received<Pick<M, T>>;
  exclude: <T extends keyof M>(types: ReadonlyArray<T>) => Received<Omit<M, T>>;
}

export interface Sent<Data> {
  [SENT]: true;
  data: Data;
}

type ResponseSender<Res extends Responses, K extends keyof Res> = (
  data: Res[K]["data"]
) => Sent<Res[K]["data"]>;

export type TopologySender<Res extends Responses> = {
  [K in keyof Res]: ResponseSender<Res, K>;
};

type RequestHandler<R extends Requests> = (
  received: Received<R>
) => null | Sent<any> | Promise<null | Sent<any>>;

type TopologyHandler<T extends Topology> = {
  [S in keyof T]: RequestHandler<T[S]["requests"]>;
};

export function handle<T extends Topology>(topo: T) {
  return (handler: TopologyHandler<T>) => {
    return {};
  };
}
