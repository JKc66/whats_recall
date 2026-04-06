process.env.NODE_ENV = "test";
import { expect, test, describe } from "bun:test";
import { actionsQueue } from "../src/whatsapp/queue.ts";

describe("ActionsQueue", () => {
  test("should process actions in sequence", async () => {
    const sequence: number[] = [];
    const pushToSequence = (n: number) => async () => {
      sequence.push(n);
    };

    actionsQueue.enqueue(pushToSequence(1), "step 1");
    actionsQueue.enqueue(pushToSequence(2), "step 2");
    actionsQueue.enqueue(pushToSequence(3), "step 3");

    // Give it more than enough time to finish with the 10ms test delay
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(sequence).toEqual([1, 2, 3]);
    const status = actionsQueue.getStatus();
    expect(status.pending).toBe(0);
    expect(status.isProcessing).toBe(false);
  });

  test("should continue processing if an action fails", async () => {
    let lastActionFired = false;

    actionsQueue.enqueue(async () => {
      throw new Error("BOOM");
    }, "exploding action");

    actionsQueue.enqueue(async () => {
      lastActionFired = true;
    }, "recovery action");

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(lastActionFired).toBe(true);
    expect(actionsQueue.getStatus().pending).toBe(0);
  });

  test("should correctly track total processed actions", async () => {
    const initialTotal = actionsQueue.getStatus().totalProcessed;
    
    actionsQueue.enqueue(async () => {}, "count test 1");
    actionsQueue.enqueue(async () => {}, "count test 2");
    
    await new Promise((resolve) => setTimeout(resolve, 400));
    
    expect(actionsQueue.getStatus().totalProcessed).toBe(initialTotal + 2);
  });
});
