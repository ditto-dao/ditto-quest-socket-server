import { DomainWithMonsters, FullMonster } from "../../../sql-services/combat-service";

export class DomainManager {

    constructor() { }

    /**
     * Selects a random monster from a domain using weighted spawn rates.
     *
     * @param domain - A `DomainWithMonsters` object containing all monster spawn data
     * @returns A randomly selected `Monster` object with all nested data
     */
    static getRandomMonsterFromDomain(domain: DomainWithMonsters): FullMonster {
        const pool = domain.monsters;

        if (!pool || pool.length === 0) throw new Error(`No monsters in this domain`);

        // Total weight of all monsters
        const totalWeight = pool.reduce((sum, entry) => sum + entry.spawnRate, 0);
        const rand = Math.random() * totalWeight;

        let cumulative = 0;
        for (const entry of pool) {
            cumulative += entry.spawnRate;
            if (rand <= cumulative) {
                return entry.monster;
            }
        }

        // Fallback in case of rounding issues
        return pool[pool.length - 1].monster;
    }
}
