export class ZenSocketError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static RequestTimeout: typeof RequestTimeout;
}

class RequestTimeout extends Error {
  constructor() {
    super(`RequestTimeout`);
  }
}

ZenSocketError.RequestTimeout = RequestTimeout;
