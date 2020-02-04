import { Flow, createFlowClient, createFlowServer } from '../src';

interface Me {
  id: string;
  email: string;
}

type Atom = { id: string; type: string; content: string };

type AtomFragment = {
  type: 'SetContent';
  content: string;
};

type Flows = {
  Me: Flow<null, Me>;
  Atom: Flow<{ atomId: string }, Atom, AtomFragment>;
  Courses: Flow<null, Array<{ id: string; name: string }>>;
  Course: Flow<{ courseId: string }, { id: string; name: string; content: string }>;
};

const client = createFlowClient<Flows>({
  zenid: 'main',
  outgoing: message => {
    console.log('UP', message);
    server.incoming(message);
  }
});

const server = createFlowServer<Flows>({
  zenid: 'main',
  outgoing: message => {
    console.log('DOWN', message);
    client.incoming(message);
  },
  handleSubscribe: {
    Me: async () => {
      return {
        state: { id: '', email: '' },
        unsubscribe: () => null
      };
    },
    Atom: async ({ atomId }, dispatch) => {
      setTimeout(() => {
        dispatch({ type: 'SetContent', content: 'yolo' });
      }, 1000);
      setTimeout(() => {
        dispatch({ type: 'SetContent', content: 'yoooo' });
      }, 3000);
      return {
        state: { type: '', content: '', id: atomId },
        unsubscribe: () => null
      };
    },
    Course: async () => {
      return {
        state: { id: '', name: '', content: '' },
        unsubscribe: () => null
      };
    },
    Courses: async () => {
      return {
        state: [],
        unsubscribe: () => null
      };
    }
  }
});

client.subscribe('Course', { courseId: '4333' });
client.subscribe('Atom', { atomId: '1' });
client.subscribe('Me');

client.onStateChange(() => {
  console.log({
    Course: client.state('Course', { courseId: '4333' }),
    Atom: client.state('Atom', { atomId: '1' }),
    Me: client.state('Me')
  });
});

let atom: Atom | null = null;

client.on(e => {
  console.log(e);
  if (e.type === 'Initial') {
    if (e.is('Atom')) {
      atom = e.data;
    }
  }
  if (e.type === 'Fragment') {
    if (e.is('Atom')) {
      if (atom === null) {
        throw new Error('What ?');
      }
      if (e.data.type === 'SetContent') {
        console.log(e.data);
        atom.content = e.data.content;
      }
    }
  }
  console.log({ atom });
});

setTimeout(() => {
  server.unsubscribe('Atom', { atomId: '1' });
}, 2000);
