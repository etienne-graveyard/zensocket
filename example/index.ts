import {
  CreateTopology,
  ZenSocket,
  MessageBuilder,
  CreateMessages
} from "../src";

type AuthenticatedMessageBuilder<
  Req,
  Res extends { [key: string]: any }
> = MessageBuilder<
  Req,
  Res & {
    Unauthenticated: { error: string };
  }
>;

type Topo = CreateTopology<{
  localRequests: CreateMessages<{
    Ping: MessageBuilder<
      { ping: number },
      {
        Pong: { pong: number };
        Oops: { error: string };
      }
    >;
    GetAll: AuthenticatedMessageBuilder<{}, {}>;
    Foo: AuthenticatedMessageBuilder<
      {},
      {
        Bar: { bar: string };
      }
    >;
  }>;
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
    return message.response.Unauthenticated({ error: "yolo" });
  },
  emit: {},
  outgoing: message => {
    console.log("send to client", message);
    client.incoming(message);
  }
});

client.request.Ping({ ping: 42 }).then(res => {
  console.log(res.type);
});
