import { expect, test, describe } from "bun:test";
import { safeMerge } from "../src/whatsapp.js";

describe("safeMerge", () => {
    test("should merge two objects correctly", () => {
        const oldObj = { a: 1, b: 2 };
        const newObj = { b: 3, c: 4 };
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test("should not overwrite with undefined", () => {
        const oldObj = { a: 1, b: 2 };
        const newObj = { b: undefined, c: 4 };
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 1, b: 2, c: 4 });
    });

    test("should not overwrite with null", () => {
        const oldObj = { a: 1, b: 2 };
        const newObj = { b: null, c: 4 };
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 1, b: 2, c: 4 });
    });

    test("should handle empty oldObj", () => {
        const oldObj = {};
        const newObj = { a: 1, b: 2 };
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    test("should handle empty newObj", () => {
        const oldObj = { a: 1, b: 2 };
        const newObj = {};
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    test("should handle both empty objects", () => {
        const oldObj = {};
        const newObj = {};
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({});
    });

    test("should not mutate the original objects", () => {
        const oldObj = { a: 1, b: 2 };
        const newObj = { b: 3, c: 4 };
        safeMerge(oldObj, newObj);
        expect(oldObj).toEqual({ a: 1, b: 2 });
        expect(newObj).toEqual({ b: 3, c: 4 });
    });

    test("should overwrite falsy values like 0, false, empty string", () => {
        const oldObj = { a: 1, b: true, c: "test" };
        const newObj = { a: 0, b: false, c: "" };
        const result = safeMerge(oldObj, newObj);
        expect(result).toEqual({ a: 0, b: false, c: "" });
    });
});
