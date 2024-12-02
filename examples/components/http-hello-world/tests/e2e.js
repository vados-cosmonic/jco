import { test } from "node:test";
import { serve } from "bytecodealliance/jco";

test("jco serve basic HTTP request works", async () => {
  let args = {};
  let opts = {};
  await serve("path/to/component", args, opts);

  // TODO: perform fetch request against component
  // TODO: might be worth refactoring into a common 'test:e2e' NPM script
});
