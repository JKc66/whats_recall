import { log } from "../logger.js";
import { randomInt } from "crypto";

/**
 * Singleton ActionsQueue to handle rate-limiting for outgoing WhatsApp messages.
 * This simulates human behavior with random delays to prevent account bans.
 */
class ActionsQueue {
    private static instance: ActionsQueue;
    private queue: {
        id: number;
        action: () => Promise<any>;
        description: string;
    }[] = [];
    private isProcessing = false;
    private actionCounter = 0;

    private constructor() {
        log("SERVER", "Queue initialized");
    }

    public static getInstance(): ActionsQueue {
        if (!ActionsQueue.instance) {
            ActionsQueue.instance = new ActionsQueue();
        }
        return ActionsQueue.instance;
    }

    /**
     * Enqueues a WhatsApp action (like sendMessage) with human-like delay protection.
     */
    public enqueue(action: () => Promise<any>, description = "UNNAMED_ACTION") {
        this.actionCounter++;
        const actionId = this.actionCounter;

        this.queue.push({
            id: actionId,
            action,
            description,
        });

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const actionData = this.queue.shift();
            if (!actionData) break;

            const delay = this.randomDelay();

            try {
                log(
                    "SERVER",
                    `Executing: ${actionData.description} (#${actionData.id})`,
                );
                await actionData.action();
            } catch (error: any) {
                log(
                    "SERVER",
                    `Failed: ${actionData.description} (#${actionData.id}) - ${error.message}`,
                );
            }

            // If there are more items, apply random delay (1s to 2.5s)
            if (this.queue.length > 0) {
                log(
                    "SERVER",
                    `Waiting ${delay}ms... (${this.queue.length} left)`,
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        this.isProcessing = false;
    }

    private randomDelay(): number {
        if (process.env.NODE_ENV === "test") return 10;
        // Random delay between 3-5 seconds (Ultra-safe range)
        return randomInt(3000, 5000);
    }

    public getStatus() {
        return {
            pending: this.queue.length,
            isProcessing: this.isProcessing,
            totalProcessed: this.actionCounter,
        };
    }
}

export const actionsQueue = ActionsQueue.getInstance();
