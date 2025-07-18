import { parseUnits } from "ethers";
import { DITTO_DECIMALS } from "./config";

// Gacha
export const SLIME_GACHA_PULL_TRX_NOTE = 'Slime gacha pull';
export const SLIME_GACHA_PRICE_GOLD = 10000;
export const SLIME_GACHA_PRICE_DITTO_WEI = parseUnits("5000", DITTO_DECIMALS);

// Domain
export const ENTER_DOMAIN_TRX_NOTE = 'Enter domain';

// Dungeon
export const ENTER_DUNGEON_TRX_NOTE = 'Enter dungeon';

//Shop
export const SHOP_PURCHASE_DITTO_TRX_NOTE_PREFIX = "SHOP_PURCHASE";