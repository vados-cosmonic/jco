import { test } from "node:test";
import { serve } from "bytecodealliance/jco";

test("jco serve basic HTTP request works", () => {
  await serve("");

});
