import { Hono } from 'hono';
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono';

const app = Hono();
app.get('/', (c) => c.body);

fire(app);
