import { Hono } from 'hono';
import { fire } from '@bytecodealliance/jco-std/http/adapters/hono';

const app = Hono();
app.get('/', (c) => c.body);

fire(app);
