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
});

client.request.Login({ user: 'foo', password: 'bar' });

const server = createServer<Topo>({
  request: {
    Login: async ({ password, user }) => {
      return { foo: '' };
    },
  },
  emit: {},
});
