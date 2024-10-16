import pino from 'pino';
import pinoPretty from 'pino-pretty';
import * as dotenv from 'dotenv';
dotenv.config();

const stream = pinoPretty({
    colorize: false,
    levelFirst: true,
    translateTime: 'yyyy-dd-mm, h:MM:ss TT',
});

export const logger = pino({
    level: process.env.LOG_LEVEL || 'debug',
}, stream);