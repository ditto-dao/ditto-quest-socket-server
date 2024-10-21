import * as dotenv from 'dotenv';
dotenv.config();

export const PORT = (process.env.PORT !== undefined && !isNaN(parseInt(process.env.PORT))) ? parseInt(process.env.PORT) : -1

export const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || ""

export const SOCKET_PATH = process.env.SOCKET_PATH || ""
