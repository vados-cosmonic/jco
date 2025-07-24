import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { fire } from '@bytecodealliance/jco-std/http/adapters/hono';

const app = Hono();
app.get('/', (c) => {
    return stream(c, async (stream) => {
        stream.onAbort(() => {
            console.error('ABORTED STREAM');
        });
        await stream.pipe(c.body);
    });
});

fire(app);
