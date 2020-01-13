import {
  MESSAGE,
  Messages,
  Message,
  WithResponses,
  Manager,
  Response,
  RESPONSE,
  TopologySender
} from "./types";

export function createTopology<Topo extends Messages>(topo: Topo): Topo {
  return topo;
}

export function message<Data = {}>(): Message<Data, {}> {
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
  const message = {
    [MESSAGE]: true,
    responses: null,
    withResponses: (responses: any) => withResponses(message, responses)
  } as any;
  return message;
}

export function withResponses<Res extends Messages>(
  responses: Res
): WithResponses<Res> {
  return messages => {
    return Object.keys(messages).reduce<any>((acc, key) => {
      acc[key] = messages[key].withResponses(responses);
      return acc;
    }, {});
  };
}

export function createManager<Topo extends Messages>(
  topo: Topo
): Manager<Topo> {
  return { topo } as any;
}

function createResponse<Topo extends Messages>(
  topo: Topo,
  type: string,
  data: any
): Response<Topo> {
  return {
    [RESPONSE]: topo,
    type,
    data
  };
}

export function createResponses<Topo extends Messages>(
  topo: Topo
): TopologySender<Topo> {
  return Object.keys(topo).reduce<any>((acc, key) => {
    acc[key] = (data: any) => {
      return createResponse(topo, key, data);
    };
    return acc;
  }, {});
}

// export function createIncommingMessage<Topo extends Topology>(
//   topo: Topo,
//   type: keyof Topo,
//   data: any
// ): Manager<Topo> {
//   return {
//     [MESSAGE]: topo,
//     data,
//     type,
//     response: createResponses(topo[type].responses),
//     is: (type: any) => {
//       type === type;
//     },
//     isOneOf: (types: ReadonlyArray<any>) => {
//       return types.indexOf(type) >= 0;
//     }
//   };
// }
