import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { fire, logger } from '@bytecodealliance/jco-std/http/adapters/hono';

const app = Hono();
// Use logging middleware, via the custom logger
app.use(logger(logger.build()));
app.get('/', (c) => {
    logger.debug('entered handler');
    c.text('Hello World!');
});
fire(app);
