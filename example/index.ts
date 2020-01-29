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
  getInitial: {
    Me: async () => {
      console.log('init Me');
      return { id: '', email: '' };
    },
    Atom: async ({ atomId }) => {
      return { type: '', content: '', id: atomId };
    },
    Course: async () => {
      return { id: '', name: '', content: '' };
    },
    Courses: async () => {
      return [];
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
        atom.content = e.data.content;
      }
    }
  }
  console.log({ atom });
});

setTimeout(() => {
  server.dispatch('Atom', { atomId: '1' }, { type: 'SetContent', content: 'yolo' });
}, 1000);

setTimeout(() => {
  server.unsubscribe('Atom', { atomId: '1' });
}, 2000);

setTimeout(() => {
  server.dispatch('Atom', { atomId: '1' }, { type: 'SetContent', content: 'yoooo' });
}, 3000);
