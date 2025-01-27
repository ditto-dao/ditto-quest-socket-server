import * as dotenv from 'dotenv';
dotenv.config();

export const PORT = (process.env.PORT !== undefined && !isNaN(parseInt(process.env.PORT))) ? parseInt(process.env.PORT) : -1

export const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || ""

export const SOCKET_PATH = process.env.SOCKET_PATH || ""

export const BOT_TOKEN = process.env.BOT_TOKEN || ""

export const BOT_TOKEN_DEV = process.env.BOT_TOKEN_DEV || ""

export const HP_EXP_PER_EXP = (process.env.HP_EXP_PER_EXP !== undefined && !isNaN(parseFloat(process.env.HP_EXP_PER_EXP))) ? parseFloat(process.env.HP_EXP_PER_EXP) : 1

export const GACHA_PULL_ODDS = process.env.GACHA_PULL_ODDS ? process.env.GACHA_PULL_ODDS.split(' ').map(prob => parseFloat(prob)) : []

export const MAX_CONCURRENT_IDLE_ACTIVITIES = (process.env.MAX_CONCURRENT_IDLE_ACTIVITIES !== undefined && !isNaN(parseInt(process.env.MAX_CONCURRENT_IDLE_ACTIVITIES))) ? parseInt(process.env.MAX_CONCURRENT_IDLE_ACTIVITIES) : 1

export const MAX_OFFLINE_IDLE_PROGRESS_S = (process.env.MAX_OFFLINE_IDLE_PROGRESS_S !== undefined && !isNaN(parseInt(process.env.MAX_OFFLINE_IDLE_PROGRESS_S))) ? parseInt(process.env.MAX_OFFLINE_IDLE_PROGRESS_S) : 1

export const AWS_S3_REGION = process.env.AWS_S3_REGION || ""

export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ""

export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ""

export const SLIMES_TARGET_FOLDER = process.env.SLIMES_TARGET_FOLDER || ""

export const S3_UPLOAD_CACHE_CONTROL = process.env.S3_UPLOAD_CACHE_CONTROL || ""