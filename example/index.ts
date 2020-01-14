import { withResponses, request, response, createTopology, state } from "./lib";
import { handle } from "handle";

const withError = withResponses({
  InternalError: response<{ errorCode: number }>()
});

const withAuth = withResponses({
  AuthenticationRequired: response()
});

const withAlreadyLogedIn = withResponses({
  AlreadyAuthenticated: response<{}>()
});

const rootState = state<{}>().withRequests(
  withError(
    withAlreadyLogedIn({
      RequestLogin: request<{ email: string }>().withResponses({
        MailSent: response<{}>()
      }),
      ValidateValidationCode: request<{ code: string }>().withResponses({
        Authenticated: response<{ me: { id: string } }>(),
        InvalidCode: response()
      })
    })
  )
);

const authenticatedState = state<{ user: string }>().withRequests({
  MeUpdated: request<{
    me: { email: string };
  }>(),
  AtomUpdated: request<{
    courseId: string;
    atomId: string;
    atom: any;
  }>(),
  ...withError(
    withAuth({
      GetMe: request<{ foo: string }>().withResponses({
        Success: response<{ me: { id: string } }>(),
        Yolo: response<{ foo: string }>()
      })
    })
  )
});

const clientTopo = createTopology({
  root: rootState,
  authenticated: authenticatedState
});

handle(clientTopo)({
  root: received => {
    return received.send.InternalError({ errorCode: 4 });
  },
  authenticated: received => {
    if (received.isOneOf(["AtomUpdated", "MeUpdated"])) {
      return null;
    }
    if (received.is("GetMe")) {
      return received.send.Success({ me: { id: "etienne" } });
    }
    return null;
  }
});
