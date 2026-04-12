import { expect, test } from "bun:test";
import { getDb } from "../src/db/database";
import { createHonoServer } from "../src/api/server";

test("WebSocket session invalidation", async () => {
    // Setup server
    const mockClient: any = { isReady: true, isAuthenticated: true };
    const { start, broadcast } = createHonoServer(mockClient);

    // We need AUTH_PASSWORD set for server to start
    process.env.AUTH_PASSWORD = "secure_password_123";

    const { bunServer } = start();

    const db = getDb();
    db.createSession("test_token", "fp1", new Date(Date.now() + 100000).toISOString());

    // Connect WS
    const wsUrl = new URL(bunServer.url);
    wsUrl.protocol = "ws:";
    wsUrl.pathname = "/ws";

    const ws = new WebSocket(wsUrl.toString(), {
        headers: { "X-Auth-Token": "test_token", "X-Fingerprint": "fp1" }
    });

    await new Promise(resolve => ws.onopen = resolve);

    let receivedData = null;
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.event === "test_event") receivedData = msg.data;
    };

    broadcast("test_event", "hello");
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(receivedData).toBe("hello"); // Should receive data

    // Logout (delete session)
    db.deleteSession("test_token");

    // Broadcast again
    receivedData = null;
    broadcast("test_event", "hello_again");
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(receivedData).toBeNull(); // Should not receive data, should be disconnected

    ws.close();
    bunServer.stop(true);
});
