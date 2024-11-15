import * as dotenv from 'dotenv';
dotenv.config();

export const PORT = (process.env.PORT !== undefined && !isNaN(parseInt(process.env.PORT))) ? parseInt(process.env.PORT) : -1

export const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || ""

export const SOCKET_PATH = process.env.SOCKET_PATH || ""

export const BOT_TOKEN = process.env.BOT_TOKEN || ""

export const BOT_TOKEN_DEV = process.env.BOT_TOKEN_DEV || ""

export const HP_EXP_PER_EXP = (process.env.HP_EXP_PER_EXP !== undefined && !isNaN(parseFloat(process.env.HP_EXP_PER_EXP))) ? parseFloat(process.env.HP_EXP_PER_EXP) : 1

export const GEN_0_SLIME_TRAIT_PROBABILITIES = process.env.GEN_0_SLIME_TRAIT_PROBABILITIES ? process.env.GEN_0_SLIME_TRAIT_PROBABILITIES.split(' ').map(prob => parseFloat(prob)) : []