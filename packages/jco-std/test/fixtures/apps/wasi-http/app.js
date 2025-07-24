import { Hono } from "hono";
import { fire } from "@bytecodealliance/jco-std/adapters/http/hono";

const app = new Hono();
app.get("/", (c) => c.text("Hello World!"));
fire(app, { useWasiHttp: true });

export { incomingHandler } from "@bytecodealliance/jco-std/adapters/http/hono";
