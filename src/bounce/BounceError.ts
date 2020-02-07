export class BounceError extends Error {
  constructor(message: string) {
    super(`[Bounce]: ${message}`);
    // Tiny hack to make extending error works
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static Canceled: typeof Canceled;
  public static Timeout: typeof Timeout;
  public static ServerHandlerError: typeof ServerHandlerError;
  public static MissingServerHandler: typeof MissingServerHandler;
  public static UnkwownError: typeof UnkwownError;
  public static NotConnected: typeof NotConnected;
}

class Canceled extends BounceError {
  constructor() {
    super(`Canceled`);
  }
}

class Timeout extends BounceError {
  constructor() {
    super(`Timeout`);
  }
}

class ServerHandlerError extends BounceError {
  constructor() {
    super(`ServerHandlerError`);
  }
}

class MissingServerHandler extends BounceError {
  constructor() {
    super(`MissingServerHandler`);
  }
}

class UnkwownError extends BounceError {
  constructor() {
    super(`UnkwownError`);
  }
}

class NotConnected extends BounceError {
  constructor() {
    super(`NotConnected`);
  }
}

BounceError.Canceled = Canceled;
BounceError.Timeout = Timeout;
BounceError.ServerHandlerError = ServerHandlerError;
BounceError.MissingServerHandler = MissingServerHandler;
BounceError.UnkwownError = UnkwownError;
BounceError.NotConnected = NotConnected;
