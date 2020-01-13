import { withResponses, message, createTopology, createManager } from "../src";

const withError = withResponses({
  InternalError: message<{ errorCode: number }>()
});

const withAuth = withResponses({
  AuthenticationRequired: message()
});

const withAlreadyLogedIn = withResponses({
  AlreadyAuthenticated: message<{}>()
});

const clientTopo = createTopology({
  MeUpdated: message<{
    me: { email: string };
  }>(),
  AtomUpdated: message<{
    courseId: string;
    atomId: string;
    atom: any;
  }>(),
  ...withError({
    ...withAlreadyLogedIn({
      RequestLogin: message<{ email: string }>().withResponses({
        MailSent: message<{}>()
      }),
      ValidateValidationCode: message<{ code: string }>().withResponses({
        Authenticated: message<{ me: { id: string } }>(),
        InvalidCode: message()
      })
    }),
    ...withAuth({
      GetMe: message<{ foo: string }>().withResponses({
        Success: message<{ me: { id: string } }>(),
        Yolo: message<{ foo: string }>()
      })
    })
  })
});

let authenticated = false;

const manager = createManager(clientTopo)
  .try(m =>
    m.handle({
      MeUpdated: async m => {},
      AtomUpdated: async m => {}
    })
  )
  .catch((m, error) => {
    return m.void();
  })
  .try(m => {
    return m.include(["RequestLogin", "ValidateValidationCode"]).exec(
      async m => {
        if (authenticated) {
          return m.send.AlreadyAuthenticated({});
        }
        return m;
      },
      m =>
        m.handle({
          RequestLogin: async (res, data) => res.send.MailSent({}),
          ValidateValidationCode: async res => {
            return res.send.InvalidCode({});
          }
        })
    );
  })
  .catch(m => {
    return m.send.InternalError({ errorCode: 42 });
  });

// manager.

// async function run(message: IncommingMessage<Topo>) {
//   const res = await handle(message, {}, async message => {
//     try {
//       if (message.isOneOf(["RequestLogin", "ValidateValidationCode"])) {
//         if (authenticated) {
//           return message.response.AlreadyAuthenticated({});
//         }
//       }

//       return handle(
//         message,
//         {
//           RequestLogin: async (r, d) => {
//             return r.MailSent({});
//           },
//           ValidateValidationCode: async (r, d) => {
//             return r.Authenticated({ me: { id: "" } });
//           }
//         },
//         async authenticatedMessage => {
//           if (authenticated === false) {
//             return authenticatedMessage.response.AuthenticationRequired({});
//           }
//           return handle(authenticatedMessage, {
//             GetMe: async (res, data) => res.Yolo({ foo: data.foo })
//           });
//         }
//       );
//     } catch (error) {
//       return message.response.InternalError({ errorCode: 5 });
//     }
//   });
//   console.log(res);
// }

// console.log(topo);
// console.log(cleanup(topo));

// import { CreateTopology, ZenSocket, Request } from "../src";

// type UnauthenticatedResponse = { Unauthenticated: { error: string } };
// type PongResponse = { Pong: { pong: number } };
// type OopsResponse = { Oops: { error: string } };
// type BarResponse = { Bar: { bar: string } };

// type AuthenticatedRequest<Req, Res> = Request<
//   Req,
//   Res & UnauthenticatedResponse
// >;

// type Topo = CreateTopology<{
//   localRequests: {
//     Ping: Request<{ ping: number }, PongResponse & OopsResponse>;
//     GetAll: AuthenticatedRequest<{}, PongResponse & OopsResponse>;
//     Foo: AuthenticatedRequest<{}, BarResponse>;
//   };
//   remoteRequests: {};
//   localEmits: {};
//   remoteEmits: {};
// }>;

// const client = ZenSocket.createLocal<Topo>({
//   request: null,
//   emit: {},
//   outgoing: message => {
//     console.log("send to server", message);
//     server.incoming(message);
//   }
// });

// const server = ZenSocket.createRemote<Topo>({
//   request: async (message, is) => {
//     if (is.Ping(message)) {
//       return message.response.Pong({ pong: message.data.ping });
//     }
//     // return message.response.Unauthenticated({ error: "yolo" });
//     throw new Error("");
//   },
//   emit: {},
//   outgoing: message => {
//     console.log("send to client", message);
//     client.incoming(message);
//   }
// });

// client.request.Ping({ ping: 42 }).then(({ response, is }) => {
//   if (is.Pong(response)) {
//     console.log("Ping returned Pong", response.data);
//   }
// });

// client.request
//   .GetAll({})
//   .then(({ is, response }) => {
//     if (is.Unauthenticated(response)) {
//       console.log("GetAll returned Unauthenticated", response.data);
//     }
//   })
//   .catch(err => {
//     console.log(err);
//   });
