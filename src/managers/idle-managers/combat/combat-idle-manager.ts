import { Combat, User } from '@prisma/client';
import { Battle } from './battle';
import { SocketManager } from '../../../socket/socket-manager';
import { IdleManager } from '../idle-manager';
import { logger } from '../../../utils/logger';
import { DomainWithMonsters, DungeonWithMonsters, FullMonster, updateDungeonLeaderboard } from '../../../sql-services/combat-service';
import { DomainManager } from './domain-manager';
import { COMBAT_STARTED_EVENT } from '../../../socket/events';
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { sleep } from '../../../utils/helpers';
import { DungeonManager, DungeonState } from './dungeon-manager';
import { getUserLevel } from '../../../sql-services/user-service';

export class IdleCombatManager {
    private activeBattlesByUserId: Record<string, Battle> = {};
    private socketManager: SocketManager;
    private dittoLedgerSocket: DittoLedgerSocket;

    private endingBattlePromise: Record<string, Promise<void>> = {};
    private nextBattlePromiseByUserId: Record<string, Promise<void> | undefined> = {};
    private stopCombatPromiseByUserId: Record<string, Promise<void> | undefined> = {};
    private pendingStopCombatByUserId: Record<string, boolean> = {};

    constructor(socketManager: SocketManager, dittoLedgerSocket: DittoLedgerSocket) {
        this.socketManager = socketManager;
        this.dittoLedgerSocket = dittoLedgerSocket;
    }

    private createDomainBattle(
        idleManager: IdleManager,
        user: User,
        userCombat: Combat,
        monster: FullMonster,
        domain: DomainWithMonsters,
        userId: string,
    ) {
        const battle = new Battle('Domain', domain.id, domain.minCombatLevel, domain.maxCombatLevel, this.socketManager, this.dittoLedgerSocket, user, userCombat, monster);

        battle.onBattleEnd = async () => {
            if (this.activeBattlesByUserId[userId] === battle) {
                delete this.activeBattlesByUserId[userId];
                logger.info(`⛔ Cleared finished battle instance for user ${userId}`);

                await idleManager.removeAllCombatActivities(userId);
                logger.info(`🧹 Cleared idle combat activity for user ${userId} after death`);
            }
        };

        battle.onNextBattle = async () => {
            if (this.stopCombatPromiseByUserId[userId]) {
                logger.info(`🛑 Awaiting stopCombatPromise for user ${userId} before proceeding with next battle`);
                await this.stopCombatPromiseByUserId[userId];
                logger.info(`✅ stopCombatPromise finished. Aborting onNextBattle for user ${userId}.`);
                return;
            }

            if (this.pendingStopCombatByUserId[userId]) {
                logger.info(`⛔️ Skipping onNextBattle — stopCombat triggered for user ${userId}`);
                return;
            }

            if (this.nextBattlePromiseByUserId[userId]) {
                logger.warn(`⚠️ Next battle already in progress for user ${userId}`);
                return;
            }

            const nextBattlePromise = (async () => {
                try {
                    const nextMonster = DomainManager.getRandomMonsterFromDomain(domain);
                    if (!nextMonster) throw new Error(`Unable to get next monster in Domain ${domain.name}`);

                    await this.endActiveBattleByUser(userId, false);

                    nextMonster.combat.maxHp = Math.floor(nextMonster.combat.maxHp);
                    nextMonster.combat.hp = nextMonster.combat.maxHp;

                    if (this.stopCombatPromiseByUserId[userId] || this.pendingStopCombatByUserId[userId]) {
                        logger.info(`⛔️ Skipping createDomainBattle — stopCombat in progress for user ${userId}`);
                        return;
                    }

                    const newBattle = this.createDomainBattle(idleManager, user, battle.userCombat, nextMonster, domain, userId);
                    this.activeBattlesByUserId[userId] = newBattle;

                    await newBattle.refreshUserHp(30);

                    idleManager.updateCombatActivity(userId, {
                        userCombatState: newBattle.userCombat,
                        monster: newBattle.monster,
                        currentBattleStartTimestamp: Date.now()
                    });

                    // Just before spawning next battle
                    await sleep(800);

                    if (
                        newBattle.battleEnded ||
                        this.pendingStopCombatByUserId[userId] ||
                        this.stopCombatPromiseByUserId[userId]
                    ) {
                        logger.warn(`🧯 Aborting startBattle — stopCombat triggered or battle already ended for user ${userId}`);
                        return;
                    }

                    await sleep(10); // give tiny window for stopCombat to register

                    // 🚨 New recheck right before launch
                    if (
                        newBattle.battleEnded ||
                        this.pendingStopCombatByUserId[userId] ||
                        this.stopCombatPromiseByUserId[userId]
                    ) {
                        logger.warn(`🚪 Exit before startBattle — async race recheck caught stopCombat for user ${userId}`);
                        return;
                    }

                    logger.info(`Spawning next battle for user ${userId}`);
                    await newBattle.startBattle();

                } catch (err) {
                    logger.error(`Failed to start next battle in Domain: ${err}`);
                    await this.endActiveBattleByUser(userId, false);
                    await idleManager.removeAllCombatActivities(userId);
                } finally {
                    delete this.nextBattlePromiseByUserId[userId];
                }
            })();

            this.nextBattlePromiseByUserId[userId] = nextBattlePromise;

            nextBattlePromise.catch(err => {
                logger.error(`Unhandled error in nextBattlePromise for user ${userId}: ${err}`);
            });
        };

        return battle;
    }

    private createDungeonBattle(
        idleManager: IdleManager,
        user: User,
        userCombat: Combat,
        monster: FullMonster,
        dungeon: DungeonWithMonsters,
        userId: string,
    ) {
        const battle = new Battle('Dungeon', dungeon.id, dungeon.minCombatLevel, dungeon.maxCombatLevel, this.socketManager, this.dittoLedgerSocket, user, userCombat, monster);

        battle.onBattleEnd = async () => {
            const dungeonState = DungeonManager.getState(userId);
            if (!dungeonState) throw new Error(`Dungeon state not initialized in onBattleEnd`);

            await updateDungeonLeaderboard(userId, dungeon.id, dungeonState, dungeon.monsterSequence.length);

            DungeonManager.clearState(userId);

            if (this.activeBattlesByUserId[userId] === battle) {
                delete this.activeBattlesByUserId[userId];
                logger.info(`⛔ Cleared finished battle instance for user ${userId}`);

                await idleManager.removeAllCombatActivities(userId);
                logger.info(`🧹 Cleared idle combat activity for user ${userId} after death`);
            }
        };

        battle.onNextBattle = async () => {
            if (this.stopCombatPromiseByUserId[userId]) {
                logger.info(`🛑 Awaiting stopCombatPromise for user ${userId} before proceeding with next battle`);
                await this.stopCombatPromiseByUserId[userId];
                logger.info(`✅ stopCombatPromise finished. Aborting onNextBattle for user ${userId}.`);
                return;
            }

            if (this.pendingStopCombatByUserId[userId]) {
                logger.info(`⛔️ Skipping onNextBattle — stopCombat triggered for user ${userId}`);
                return;
            }

            if (this.nextBattlePromiseByUserId[userId]) {
                logger.warn(`⚠️ Next battle already in progress for user ${userId}`);
                return;
            }

            const nextBattlePromise = (async () => {
                try {
                    const dungeonState = DungeonManager.getState(userId);

                    if (!dungeonState) throw new Error(`Dungeon state not initialized in nextBattlePromise`);

                    DungeonManager.incrementMonsterIndex(userId, dungeon.monsterSequence.length);

                    this.socketManager.emitEvent(userId, COMBAT_STARTED_EVENT, {
                        userId,
                        payload: {
                            dungeonFloor: dungeonState.floor,
                            dungeonMonsterId: dungeonState.monsterIndex
                        }
                    });

                    let nextMonster = DungeonManager.getMonsterFromDungeonByIndex(dungeon, dungeonState.monsterIndex);

                    if (!nextMonster) throw new Error(`Unable to get next monster in Dungeon ${dungeon.name}`);

                    nextMonster = DungeonManager.getBuffedFullMonster(nextMonster, Math.pow(dungeon.monsterGrowthFactor, Math.max(1, dungeonState.floor - 1)));

                    await this.endActiveBattleByUser(userId, false);

                    nextMonster.combat.maxHp = Math.floor(nextMonster.combat.maxHp);
                    nextMonster.combat.hp = nextMonster.combat.maxHp;

                    if (this.stopCombatPromiseByUserId[userId] || this.pendingStopCombatByUserId[userId]) {
                        logger.info(`⛔️ Skipping createDungeonBattle — stopCombat in progress for user ${userId}`);
                        return;
                    }

                    const newBattle = this.createDungeonBattle(idleManager, user, battle.userCombat, nextMonster, dungeon, userId);
                    this.activeBattlesByUserId[userId] = newBattle;

                    await newBattle.refreshUserHp(15); // 15s for dungeon

                    idleManager.updateCombatActivity(userId, {
                        userCombatState: newBattle.userCombat,
                        monster: newBattle.monster,
                        currentBattleStartTimestamp: Date.now(),
                        currentFloor: dungeonState.floor,
                        currentMonsterIndex: dungeonState.monsterIndex,
                        totalDamageDealt: dungeonState.totalDamageDealt,
                        totalDamageTaken: dungeonState.totalDamageTaken,
                    });

                    // Just before spawning next battle
                    await sleep(800);

                    if (
                        newBattle.battleEnded ||
                        this.pendingStopCombatByUserId[userId] ||
                        this.stopCombatPromiseByUserId[userId]
                    ) {
                        logger.warn(`🧯 Aborting startBattle — stopCombat triggered or battle already ended for user ${userId}`);
                        return;
                    }

                    await sleep(10); // give tiny window for stopCombat to register

                    // 🚨 New recheck right before launch
                    if (
                        newBattle.battleEnded ||
                        this.pendingStopCombatByUserId[userId] ||
                        this.stopCombatPromiseByUserId[userId]
                    ) {
                        logger.warn(`🚪 Exit before startBattle — async race recheck caught stopCombat for user ${userId}`);
                        return;
                    }

                    logger.info(`Spawning next battle for user ${userId}`);
                    await newBattle.startBattle();

                } catch (err) {
                    logger.error(`Failed to start next battle in Dungeon: ${err}`);
                    await this.endActiveBattleByUser(userId, false);
                    await idleManager.removeAllCombatActivities(userId);
                } finally {
                    delete this.nextBattlePromiseByUserId[userId];
                }
            })();

            this.nextBattlePromiseByUserId[userId] = nextBattlePromise;

            nextBattlePromise.catch(err => {
                logger.error(`Unhandled error in nextBattlePromise for user ${userId}: ${err}`);
            });
        };

        return battle;
    }

    async startDomainCombat(idleManager: IdleManager, userId: string, user: User, userCombat: Combat, domain: DomainWithMonsters, startTimestamp: number, monster?: FullMonster) {
        await idleManager.removeAllCombatActivities(userId);

        const firstMonster = (monster) ? monster : DomainManager.getRandomMonsterFromDomain(domain);
        if (!firstMonster) throw new Error(`Unable to get random first monster in Domain ${domain.name}`);
        firstMonster.combat.maxHp = Math.floor(firstMonster.combat.maxHp);
        if (!monster) {
            firstMonster.combat.hp = firstMonster.combat.maxHp
        }

        if (this.activeBattlesByUserId[userId]) {
            logger.warn(`Overlapping battle detected for user ${userId}. Stopping previous battle...`);
            await this.endActiveBattleByUser(userId, false);
        }

        const battle = this.createDomainBattle(idleManager, user, userCombat, firstMonster, domain, userId);

        this.activeBattlesByUserId[userId] = battle;
        logger.info(`✅ Registered active battle for user ${userId}`);

        // HP recover 
        if (user.lastBattleEndTimestamp) {
            const elapsedMs = Date.now() - new Date(user.lastBattleEndTimestamp).getTime();

            const HEAL_THRESHOLD_MS = 10000;
            if (elapsedMs > HEAL_THRESHOLD_MS) {
                await battle.refreshUserHp(Math.floor(elapsedMs / 1000));
            }
        }

        const completeCallback = async () => {
            try {
                await this.combatStopCallback(userId);
            } catch (err) {
                logger.error(`Combat stop callback failed for user ${userId}, domain ID: ${domain.id}: ${err}`);
                this.socketManager.emitEvent(userId, COMBAT_STARTED_EVENT, {
                    userId: userId,
                    payload: {
                        monster: battle.monster,
                    }
                });
                throw err;
            }
        };

        await idleManager.appendIdleActivityByUser(userId, {
            userId: userId,
            activity: 'combat',
            activityStopCallback: completeCallback,
            mode: 'domain',
            domainId: domain.id,
            userLevel: user.level,
            userHpLevel: user.hpLevel,
            userCombatState: battle.userCombat,
            monster: battle.monster,
            startTimestamp: startTimestamp,
            currentBattleStartTimestamp: battle.currentBattleStartTimestamp ? battle.currentBattleStartTimestamp : undefined
        });

        await battle.startBattle();
    }

    async startDungeonCombat(idleManager: IdleManager, userId: string, user: User, userCombat: Combat, dungeon: DungeonWithMonsters, startTimestamp: number, monster?: FullMonster, state?: DungeonState) {
        await idleManager.removeAllCombatActivities(userId);

        DungeonManager.initDungeonState(userId, startTimestamp, state);

        const dungeonState = DungeonManager.getState(userId);

        if (!dungeonState) throw new Error(`Dungeon state not initialized in startDungeonCombat`);


        this.socketManager.emitEvent(userId, COMBAT_STARTED_EVENT, {
            userId,
            payload: {
                dungeonFloor: dungeonState.floor,
                dungeonMonsterId: dungeonState.monsterIndex
            }
        });

        const firstMonster = (monster) ? monster : DungeonManager.getMonsterFromDungeonByIndex(dungeon, 0);
        if (!firstMonster) throw new Error(`Unable to get first monster in Dungeon ${dungeon.name}`);
        firstMonster.combat.maxHp = Math.floor(firstMonster.combat.maxHp);
        if (!monster) {
            firstMonster.combat.hp = firstMonster.combat.maxHp
        }

        if (this.activeBattlesByUserId[userId]) {
            logger.warn(`Overlapping battle detected for user ${userId}. Stopping previous battle...`);
            await this.endActiveBattleByUser(userId, false);
        }

        const battle = this.createDungeonBattle(idleManager, user, userCombat, firstMonster, dungeon, userId);

        this.activeBattlesByUserId[userId] = battle;
        logger.info(`✅ Registered active battle for user ${userId}`);

        // HP recover 
        if (user.lastBattleEndTimestamp) {
            const elapsedMs = Date.now() - new Date(user.lastBattleEndTimestamp).getTime();

            const HEAL_THRESHOLD_MS = 10000;
            if (elapsedMs > HEAL_THRESHOLD_MS) {
                await battle.refreshUserHp(Math.floor(elapsedMs / 1000));
            }
        }

        const completeCallback = async () => {
            try {
                await this.combatStopCallback(userId);
            } catch (err) {
                logger.error(`Combat stop callback failed for user ${userId}, dungeon ID: ${dungeon.id}: ${err}`);
                this.socketManager.emitEvent(userId, COMBAT_STARTED_EVENT, {
                    userId: userId,
                    payload: {
                        monster: battle.monster,
                    }
                });
                throw err;
            }
        };

        await idleManager.appendIdleActivityByUser(userId, {
            userId: userId,
            activity: 'combat',
            activityStopCallback: completeCallback,
            mode: 'dungeon',
            dungeonId: dungeon.id,
            userLevel: user.level,
            userHpLevel: user.hpLevel,
            userCombatState: battle.userCombat,
            monster: battle.monster,
            startTimestamp: startTimestamp,
            currentBattleStartTimestamp: battle.currentBattleStartTimestamp ? battle.currentBattleStartTimestamp : undefined,
            currentFloor: 1,
            currentMonsterIndex: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
        });

        await battle.startBattle();
    }

    async endActiveBattleByUser(userId: string, emitStopEvent: boolean = true): Promise<void> {
        const existing = this.endingBattlePromise[userId];
        if (existing) {
            logger.warn(`Battle end already in progress for user ${userId}, waiting...`);
            await existing;
            return;
        }

        const battle = this.activeBattlesByUserId[userId];
        if (!battle) {
            logger.warn(`No active battle found for user ${userId}`);
            return;
        }

        const endPromise = (async () => {
            try {
                logger.info(`Calling endBattle for user ${userId}. battleEnded = ${battle.battleEnded}`);
                await battle.endBattle(emitStopEvent);

                delete this.activeBattlesByUserId[userId];
                logger.info(`Deleted active battle cache for user: ${userId}`);
            } catch (err) {
                logger.error(`Error while stopping battle for user ${userId}: ${err}`);
                throw err;
            } finally {
                delete this.endingBattlePromise[userId]; // clean up
            }
        })();

        this.endingBattlePromise[userId] = endPromise;
        await endPromise;
    }

    async stopCombat(idleManager: IdleManager, userId: string): Promise<void> {
        const stopPromise = (async () => {
            this.pendingStopCombatByUserId[userId] = true;

            // 🚫 Preemptively neuter onNextBattle to avoid race
            const battle = this.activeBattlesByUserId[userId];
            if (battle) {
                battle.onNextBattle = async () => {
                    logger.warn(`🚫 nextBattle aborted — stopCombat override active for user ${userId}`);
                };
            }

            const nextBattle = this.nextBattlePromiseByUserId[userId];
            if (nextBattle) {
                logger.info(`🛑 stopCombat waiting for next battle transition to finish for user ${userId}`);
                await nextBattle;
            }

            // 🧯 Final race guard: manually end battle if still running
            if (battle && battle.battleEnded === false) {
                logger.warn(`🧯 stopCombat found battle still running for user ${userId}, calling endBattle manually`);
                await battle.endBattle(true);

                if (battle.onBattleEnd) {
                    try {
                        logger.info(`📊 Manually invoking onBattleEnd for user ${userId}`);
                        await battle.onBattleEnd();
                    } catch (err) {
                        logger.error(`Error invoking onBattleEnd for user ${userId}: ${err}`);
                    }
                }
            }

            try {
                await idleManager.removeAllCombatActivities(userId);
            } finally {
                delete this.pendingStopCombatByUserId[userId];
            }
        })();

        this.stopCombatPromiseByUserId[userId] = stopPromise;

        try {
            await stopPromise;
        } finally {
            delete this.stopCombatPromiseByUserId[userId];
        }
    }

    async combatStopCallback(userId: string): Promise<void> {
        const stopPromise = (async () => {
            this.pendingStopCombatByUserId[userId] = true;

            const nextBattle = this.nextBattlePromiseByUserId[userId];
            if (nextBattle) {
                logger.info(`🛑 combatStopCallback waiting for next battle to finish for user ${userId}`);
                await nextBattle;
            }

            try {
                await this.endActiveBattleByUser(userId, true);
            } catch (err) {
                logger.error(`Error during combat stop callback for user ${userId}: ${err}`);
                throw err;
            } finally {
                delete this.pendingStopCombatByUserId[userId];
            }
        })();

        this.stopCombatPromiseByUserId[userId] = stopPromise;

        try {
            await stopPromise;
        } finally {
            delete this.stopCombatPromiseByUserId[userId];
        }
    }

    updateUserCombatMidBattle(userId: string, combat: Combat, updatedHp?: number) {
        if (this.activeBattlesByUserId[userId]) {
            this.activeBattlesByUserId[userId].updateUserCombat(combat, updatedHp);
        }
    }
}
