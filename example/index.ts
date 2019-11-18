import { CreateTopology, ZenSocket, Request } from "../src";

type UnauthenticatedResponse = { Unauthenticated: { error: string } };
type PongResponse = { Pong: { pong: number } };
type OopsResponse = { Oops: { error: string } };
type BarResponse = { Bar: { bar: string } };

type AuthenticatedRequest<Req, Res> = Request<
  Req,
  Res & UnauthenticatedResponse
>;

type Topo = CreateTopology<{
  localRequests: {
    Ping: Request<{ ping: number }, PongResponse & OopsResponse>;
    GetAll: AuthenticatedRequest<{}, PongResponse & OopsResponse>;
    Foo: AuthenticatedRequest<{}, BarResponse>;
  };
  remoteRequests: {};
  localEmits: {};
  remoteEmits: {};
}>;

const client = ZenSocket.createLocal<Topo>({
  request: null,
  emit: {},
  outgoing: message => {
    console.log("send to server", message);
    server.incoming(message);
  }
});

const server = ZenSocket.createRemote<Topo>({
  request: async (message, is) => {
    if (is.Ping(message)) {
      return message.response.Pong({ pong: message.data.ping });
    }
    // return message.response.Unauthenticated({ error: "yolo" });
    throw new Error("");
  },
  emit: {},
  outgoing: message => {
    console.log("send to client", message);
    client.incoming(message);
  }
});

client.request.Ping({ ping: 42 }).then(({ response, is }) => {
  if (is.Pong(response)) {
    console.log("Ping returned Pong", response.data);
  }
});

client.request
  .GetAll({})
  .then(({ is, response }) => {
    if (is.Unauthenticated(response)) {
      console.log("GetAll returned Unauthenticated", response.data);
    }
  })
  .catch(err => {
    console.log(err);
  });
