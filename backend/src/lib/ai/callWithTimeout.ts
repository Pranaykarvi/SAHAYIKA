export class AiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTimeoutError";
  }
}

// Every provider call runs under a deadline and fails closed: on timeout the
// signal is aborted and this rejects, so a slow provider can never produce a
// partial result that gets written. The race also covers implementations
// that ignore the abort signal.
export async function callWithTimeout<T>(
  label: string,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new AiTimeoutError(`${label} timed out after ${timeoutMs}ms`),
            ),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
