export class CoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export class AuthError extends CoreError {
  constructor(code: string, statusCode: number, message: string) {
    super(code, statusCode, message);
    this.name = "AuthError";
  }
}
