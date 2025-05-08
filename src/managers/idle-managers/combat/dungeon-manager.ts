import { Combat } from "@prisma/client";
import { DungeonWithMonsters, FullMonster } from "../../../sql-services/combat-service";
import { calculateCombatPower } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export type DungeonState = {
    floor: number;
    monsterIndex: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    startTimestamp: number;
};

export class DungeonManager {

    static dungeonStateByUserId: Record<string, DungeonState> = {};

    constructor() { }

    static getMonsterFromDungeonByIndex(
        dungeon: DungeonWithMonsters,
        index: number
    ): FullMonster {
        if (
            index < 0 ||
            index >= dungeon.monsterSequence.length
        ) {
            throw new Error(`Invalid monster index: ${index}`);
        }

        const monsterEntry = dungeon.monsterSequence[index];

        if (!monsterEntry || !monsterEntry.monster) {
            throw new Error(`Monster not found at index ${index}`);
        }

        return monsterEntry.monster;
    }

    static getBuffedFullMonster(monster: FullMonster, growthFactor: number): FullMonster {
        const c = monster.combat;

        const buff = (v: number) => Math.ceil(v * growthFactor);

        const buffedCombat: Combat = {
            ...c,
            hp: 0, // temp placeholder
            maxHp: buff(c.maxHp),
            atkSpd: buff(c.atkSpd),
            acc: buff(c.acc),
            eva: buff(c.eva),
            maxMeleeDmg: buff(c.maxMeleeDmg),
            maxRangedDmg: buff(c.maxRangedDmg),
            maxMagicDmg: buff(c.maxMagicDmg),
            critChance: buff(c.critChance),
            critMultiplier: buff(c.critMultiplier),
            dmgReduction: buff(c.dmgReduction),
            magicDmgReduction: buff(c.magicDmgReduction),
            hpRegenRate: buff(c.hpRegenRate),
            hpRegenAmount: buff(c.hpRegenAmount),

            // unchanged fields (carry over as-is)
            id: c.id,
            attackType: c.attackType,
            meleeFactor: c.meleeFactor,
            rangeFactor: c.rangeFactor,
            magicFactor: c.magicFactor,
            reinforceAir: c.reinforceAir,
            reinforceWater: c.reinforceWater,
            reinforceEarth: c.reinforceEarth,
            reinforceFire: c.reinforceFire,
        };
        buffedCombat.cp = calculateCombatPower(buffedCombat);

        // After buffing, set current hp = maxHp
        buffedCombat.hp = buffedCombat.maxHp;

        return {
            ...monster,
            combat: buffedCombat,
        };
    }

    static initDungeonState(userId: string, startTimestamp: number) {
        this.dungeonStateByUserId[userId] = {
            floor: 1,
            monsterIndex: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            startTimestamp,
        };
    }

    static updateDamage(userId: string, dealt: number, taken: number) {
        const state = this.dungeonStateByUserId[userId];
        if (!state) return;

        state.totalDamageDealt += Math.max(0, dealt);
        state.totalDamageTaken += Math.max(0, taken);

        logger.info(`[DungeonManager] [${userId}] +${dealt} dealt, +${taken} taken`);
    }

    static incrementMonsterIndex(userId: string, maxIndex: number) {
        const state = this.dungeonStateByUserId[userId];
        if (!state) return;

        state.monsterIndex++;
        if (state.monsterIndex >= maxIndex) {
            state.monsterIndex = 0;
            state.floor++;
        }
    }

    static getState(userId: string): DungeonState | undefined {
        return this.dungeonStateByUserId[userId];
    }

    static clearState(userId: string) {
        delete this.dungeonStateByUserId[userId];
    }
}
