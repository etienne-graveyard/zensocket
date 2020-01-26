import { CreateEvents, EventDef, createClient, createServer } from "./lib";

interface Me {
  id: string;
  email: string;
}

type Events = CreateEvents<{
  Me: EventDef<Me>;
  Courses: EventDef<Array<{ id: string; name: string }>>;
  Course: EventDef<
    { id: string; name: string; content: string },
    { courseId: string }
  >;
}>;

const client = createClient<Events>();

client.subscribe("Course", { courseId: "qSDFGH" }, e => {
  console.log(e.data.id);
});

const server = createServer<Events>();

server.on("Course", e => {
  e.query;
});
