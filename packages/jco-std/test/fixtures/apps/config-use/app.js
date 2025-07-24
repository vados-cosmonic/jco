import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { fire } from '@bytecodealliance/jco-std/http/adapters/hono';

const app = Hono();
// Use logging middleware, via the custom logger
app.get('/', (c, ctx) => {
    const key = c.param('key');
    if (!ctx.config) {
        throw new HTTPException(500, {
            message: 'unexpectedly missing config helper',
        });
    }
    return c.text(ctx.config.get(key));
});
fire(app);
