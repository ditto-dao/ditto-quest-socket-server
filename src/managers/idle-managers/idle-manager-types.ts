import { Combat, Equipment, Item, Monster, Slime } from '@prisma/client';
import { CraftingRecipeRes } from '../../sql-services/crafting-service';
import { SlimeWithTraits } from '../../sql-services/slime';
import { FullMonster } from '../../sql-services/combat-service';

export interface TimerHandle {
    timeout?: NodeJS.Timeout;
    interval?: NodeJS.Timeout;
    cancel?: () => void; // new
}

export interface IdleFarmingIntervalElement {
    userId: string;
    activity: 'farming';
    startTimestamp: number;
    durationS: number;
    activityCompleteCallback: () => Promise<void>;
    activityStopCallback: () => Promise<void>;
    item: Item;
    activityInterval: TimerHandle;
    logoutTimestamp?: number;
}

export interface IdleCraftingIntervalElement {
    userId: string;
    activity: 'crafting';
    startTimestamp: number;
    durationS: number;
    activityCompleteCallback: () => Promise<void>;
    activityStopCallback: () => Promise<void>;
    equipment: Equipment;
    recipe: CraftingRecipeRes;
    activityInterval: TimerHandle;
    logoutTimestamp?: number;
}

export interface IdleBreedingIntervalElement {
    userId: string;
    activity: 'breeding';
    startTimestamp: number;
    durationS: number;
    activityCompleteCallback: () => Promise<void>;
    activityStopCallback: () => Promise<void>;
    sire: SlimeWithTraits;
    dame: SlimeWithTraits;
    activityInterval: TimerHandle;
    logoutTimestamp?: number;
}

export interface IdleCombatActivityElement {
    userId: string;
    activity: 'combat';
    startTimestamp: number;
    activityStopCallback: () => Promise<void>;

    mode: 'domain' | 'dungeon';
    currentBattleStartTimestamp?: number;

    userLevel: number;
    userHpLevel: number;

    // Common combat state
    userCombatState: Combat;
    monster?: FullMonster;

    // Domain Mode
    domainId?: number;

    // Dungeon Mode
    dungeonId?: number;
    currentFloor?: number;
    currentMonsterIndex?: number;
    totalDamageDealt?: number;
    totalDamageTaken?: number;

    logoutTimestamp?: number;
}

export type IdleActivityIntervalElement = IdleFarmingIntervalElement | IdleCraftingIntervalElement | IdleBreedingIntervalElement | IdleCombatActivityElement;

export type IntervalActivity = Exclude<IdleActivityIntervalElement, IdleCombatActivityElement>;

export interface FarmingUpdate {
    type: 'farming';
    update: {
        items?: {
            itemId: number;
            itemName: string;
            quantity: number;
            uri: string;
        }[];
        farmingExpGained?: number;
        farmingLevelsGained?: number;
    }
}

export interface CraftingUpdate {
    type: 'crafting';
    update: {
        equipment?: {
            equipmentId: number;
            equipmentName: string;
            quantity: number;
            uri: string;
        }[];
        items?: {
            itemId: number;
            itemName: string;
            quantity: number;
            uri: string;
        }[];
        craftingExpGained?: number;
        craftingLevelsGained?: number;
    }
}

export interface BreedingUpdate {
    type: 'breeding';
    update: {
        slimes?: SlimeWithTraits[];
    }
}

export interface CombatUpdate {
    type: 'combat';
    update: {
        monstersKilled?: { name: string, uri: string, quantity: number }[];
        items?: {
            itemId: number;
            itemName: string;
            quantity: number;
            uri: string;
        }[];
        equipment?: {
            equipmentId: number;
            equipmentName: string;
            quantity: number;
            uri: string;
        }[];
        expGained?: number;
        levelsGained?: number;
        hpExpGained?: number;
        hpLevelsGained?: number;
        dittoGained?: string;
        userDied?: boolean;
        goldGained?: number;
    };
}

export type ProgressUpdate = FarmingUpdate | CraftingUpdate | BreedingUpdate | CombatUpdate;