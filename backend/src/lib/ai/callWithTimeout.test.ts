import { describe, expect, it } from "vitest";

import { AiTimeoutError, callWithTimeout } from "./callWithTimeout";

describe("callWithTimeout", () => {
  it("returns the value when the call finishes in time", async () => {
    await expect(
      callWithTimeout("fast call", 1000, async () => "done"),
    ).resolves.toBe("done");
  });

  it("rejects with AiTimeoutError when the deadline passes", async () => {
    await expect(
      callWithTimeout(
        "slow call",
        50,
        () =>
          new Promise<string>((resolve) => {
            const timer = setTimeout(() => resolve("too late"), 5000);
            timer.unref();
          }),
      ),
    ).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("aborts the signal so fetch-style calls stop work", async () => {
    let aborted = false;
    await callWithTimeout("observed", 50, (signal) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    }).catch(() => undefined);
    expect(aborted).toBe(true);
  });
});
