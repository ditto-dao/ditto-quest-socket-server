import pino from 'pino';
import pinoPretty from 'pino-pretty';
import * as dotenv from 'dotenv';
dotenv.config();

// Function to get time in UTC+8
const getUTC8Time = () => {
    return new Date(new Date().getTime()) // Offset by 8 hours
        .toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true, // Use false for 24-hour format
            timeZone: 'Asia/Singapore', // Explicitly set timezone
        });
};

const stream = pinoPretty({
    colorize: false,
    levelFirst: true,
    translateTime: 'dd-mm-yyyy, h:MM:ss TT', // Keeps formatting for consistency
});

export const logger = pino({
    level: process.env.LOG_LEVEL || 'debug',
    base: null, // Removes default metadata
    timestamp: () => `,"time":"${getUTC8Time()}"`, // Manually injects UTC+8 timestamp
}, stream);
