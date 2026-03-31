import { expect, test } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

test("src/whatsapp/media.ts should not use Math.random()", async () => {
    const filePath = join(process.cwd(), "src/whatsapp/media.ts");
    const content = await readFile(filePath, "utf-8");

    expect(content).not.toContain("Math.random()");
});
