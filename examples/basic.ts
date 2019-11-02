import { CreateTopology, ZenSocket } from '../src';

type Topo = CreateTopology<{
  localRequests: {
    Login: {
      request: { user: string; password: string };
      response: { foo: string };
    };
  };
  remoteRequests: {};
  localEmits: {};
  remoteEmits: {};
}>;

const client = ZenSocket.createLocal<Topo>({
  request: {},
  emit: {},
  outgoing: message => {
    console.log('send to server', message);
    server.incoming(message);
  },
});

client.request('Login', { user: 'foo', password: 'bar' });

const server = ZenSocket.createRemote<Topo>({
  request: {
    Login: async ({ password, user }) => {
      console.log(password, user);
      return { foo: '' };
    },
  },
  emit: {},
  outgoing: message => {
    console.log('send to client', message);
    client.incoming(message);
  },
});
