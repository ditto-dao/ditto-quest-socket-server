import * as dotenv from 'dotenv';
dotenv.config();

export const PORT = (process.env.PORT !== undefined && !isNaN(parseInt(process.env.PORT))) ? parseInt(process.env.PORT) : -1

export const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || ""

export const SOCKET_PATH = process.env.SOCKET_PATH || ""

export const SOCKET_ORIGIN_DITTO_LEDGER = process.env.SOCKET_ORIGIN_DITTO_LEDGER || ""

export const SOCKET_PATH_DITTO_LEDGER = process.env.SOCKET_PATH_DITTO_LEDGER || ""

export const DEVELOPMENT_FUNDS_KEY  = process.env.DEVELOPMENT_FUNDS_KEY || ""

export const DITTO_DECIMALS = (process.env.DITTO_DECIMALS !== undefined && !isNaN(parseInt(process.env.DITTO_DECIMALS))) ? parseInt(process.env.DITTO_DECIMALS) : 9;

export const BOT_TOKEN = process.env.BOT_TOKEN || ""

export const LOGIN_TIMEOUT_MS = (process.env.LOGIN_TIMEOUT_MS !== undefined && !isNaN(parseInt(process.env.LOGIN_TIMEOUT_MS))) ? parseInt(process.env.LOGIN_TIMEOUT_MS) : 5000

export const HP_EXP_PER_EXP = (process.env.HP_EXP_PER_EXP !== undefined && !isNaN(parseFloat(process.env.HP_EXP_PER_EXP))) ? parseFloat(process.env.HP_EXP_PER_EXP) : 1

export const ABILITY_POINTS_PER_LEVEL = (process.env.ABILITY_POINTS_PER_LEVEL !== undefined && !isNaN(parseInt(process.env.ABILITY_POINTS_PER_LEVEL))) ? parseInt(process.env.ABILITY_POINTS_PER_LEVEL) : 3

export const GACHA_PULL_ODDS = process.env.GACHA_PULL_ODDS ? process.env.GACHA_PULL_ODDS.split(' ').map(prob => parseFloat(prob)) : []

export const GACHA_PULL_ODDS_NERF = process.env.GACHA_PULL_ODDS_NERF ? process.env.GACHA_PULL_ODDS_NERF.split(' ').map(prob => parseFloat(prob)) : []

export const MAX_CONCURRENT_IDLE_ACTIVITIES = (process.env.MAX_CONCURRENT_IDLE_ACTIVITIES !== undefined && !isNaN(parseInt(process.env.MAX_CONCURRENT_IDLE_ACTIVITIES))) ? parseInt(process.env.MAX_CONCURRENT_IDLE_ACTIVITIES) : 1

export const MAX_OFFLINE_IDLE_PROGRESS_S = (process.env.MAX_OFFLINE_IDLE_PROGRESS_S !== undefined && !isNaN(parseInt(process.env.MAX_OFFLINE_IDLE_PROGRESS_S))) ? parseInt(process.env.MAX_OFFLINE_IDLE_PROGRESS_S) : 1

export const AWS_S3_REGION = process.env.AWS_S3_REGION || ""

export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ""

export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ""

export const SLIMES_TARGET_FOLDER = process.env.SLIMES_TARGET_FOLDER || ""

export const S3_UPLOAD_CACHE_CONTROL = process.env.S3_UPLOAD_CACHE_CONTROL || ""

export const REFERRAL_BOOST = (process.env.REFERRAL_BOOST !== undefined && !isNaN(parseFloat(process.env.REFERRAL_BOOST))) ? parseFloat(process.env.REFERRAL_BOOST) : 0.1

export const REFERRAL_COMBAT_CUT = (process.env.REFERRAL_COMBAT_CUT !== undefined && !isNaN(parseFloat(process.env.REFERRAL_COMBAT_CUT))) ? parseFloat(process.env.REFERRAL_COMBAT_CUT) : 0.1

export const MAX_INITIAL_INVENTORY_SLOTS = (process.env.MAX_INITIAL_INVENTORY_SLOTS !== undefined && !isNaN(parseInt(process.env.MAX_INITIAL_INVENTORY_SLOTS))) ? parseInt(process.env.MAX_INITIAL_INVENTORY_SLOTS) : 20

export const MAX_INITIAL_SLIME_INVENTORY_SLOTS = (process.env.MAX_INITIAL_SLIME_INVENTORY_SLOTS !== undefined && !isNaN(parseInt(process.env.MAX_INITIAL_SLIME_INVENTORY_SLOTS))) ? parseInt(process.env.MAX_INITIAL_SLIME_INVENTORY_SLOTS) : 20