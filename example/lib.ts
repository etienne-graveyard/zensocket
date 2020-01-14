const REQUEST = Symbol("REQUEST");
const RESPONSE = Symbol("RESPONSE");
const STATE = Symbol("STATE");

export type RequestAny = Request<any, any>;
export type ResponseAny = Response<any>;
export type StateAny = State<any, any>;

export type Requests = { [key: string]: RequestAny };
export type Responses = { [key: string]: ResponseAny };
export type Topology = { [key: string]: StateAny };

export interface Request<Data, Res extends Responses> {
  [REQUEST]: true;
  data: Data;
  responses: Res;
  withResponses: <R extends Responses>(responses: R) => Request<Data, Res & R>;
}

export interface Response<Data> {
  [RESPONSE]: true;
  data: Data;
}

export interface State<Data, Req extends Requests> {
  [STATE]: true;
  data: Data;
  requests: Req;
  withRequests: <R extends Requests>(requests: R) => State<Data, R & Req>;
}

type WithResponses<Res> = <Req extends Requests>(
  requests: Req
) => {
  [K in keyof Req]: Req[K] extends Request<infer D, infer R>
    ? Request<D, R & Res>
    : never;
};

export function request<Data = {}>(): Request<Data, {}> {
  function withResponses(m: any, responses: any) {
    const nextMessage = {
      ...m,
      responses: {
        ...(m.responses === null ? {} : m.responses),
        ...responses
      },
      withResponses: (responses: any) => withResponses(nextMessage, responses)
    };
    return nextMessage;
  }
  const message: Request<Data, {}> = {
    [REQUEST]: true,
    responses: null as any,
    data: null as any,
    withResponses: (responses: any) => withResponses(message, responses)
  };
  return message;
}

export function response<Data = {}>(): Response<Data> {
  const response: Response<Data> = {
    [RESPONSE]: true,
    data: null as any
  };
  return response;
}

export function state<Data>(): State<Data, {}> {
  function withRequests(state: State<any, any>, requests: any) {
    const nextState: State<any, any> = {
      ...state,
      requests: {
        ...(state.requests === null ? {} : state.requests),
        ...requests
      },
      withRequests: (requests: any) => withRequests(nextState, requests)
    };
    return nextState;
  }
  const state: State<Data, {}> = {
    [STATE]: true,
    data: null as any,
    requests: null as any,
    withRequests: (requests: any) => withRequests(state, requests)
  };
  return state;
}

export function withResponses<R extends Responses>(
  responses: R
): WithResponses<R> {
  return messages => {
    return Object.keys(messages).reduce<any>((acc, key) => {
      acc[key] = messages[key].withResponses(responses);
      return acc;
    }, {});
  };
}

export function createTopology<T extends Topology>(topo: T): T {
  return topo;
}
