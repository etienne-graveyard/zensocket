import { CreateTopology, createClient, createServer } from '../src';

type Topo = CreateTopology<{
  clientRequests: {
    Login: {
      request: { user: string; password: string };
      response: { foo: string };
    };
  };
  serverRequests: {};
  clientEmits: {};
  serverEmits: {};
}>;

const client = createClient<Topo>({
  request: {},
  emit: {},
  outgoing: message => {
    console.log('send to server', message);
    server.incoming(message);
  },
});

client.request('Login', { user: 'foo', password: 'bar' });

const server = createServer<Topo>({
  request: {
    Login: async ({ password, user }) => {
      return { foo: '' };
    },
  },
  emit: {},
  outgoing: message => {
    console.log('send to client', message);
    client.incoming(message);
  },
});
