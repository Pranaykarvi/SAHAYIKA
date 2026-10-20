// Error types services and controllers may throw; the central error handler
// maps them to HTTP. No Express imports here, so services can use them too.
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "forbidden") {
    super(403, "FORBIDDEN", message);
  }
}
