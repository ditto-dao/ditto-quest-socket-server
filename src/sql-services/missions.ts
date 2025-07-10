import { MissionType, Rarity, UserMission } from "@prisma/client";
import { prisma } from "./client";
import { parseUnits } from "ethers";
import { DITTO_DECIMALS } from "../utils/config";
import { DefaultEventsMap, Socket } from "socket.io";
import { MISSION_UPDATE } from "../socket/events";
import { logger } from "../utils/logger";

export async function getUserMissionByUserId(userId: string): Promise<UserMission | null> {
    return await prisma.userMission.findFirst({
        where: { telegramId: userId },
    });
}

// Updated mission definitions with multiple target support
export const missions = [
    {
        type: MissionType.FARM,
        label: "Farm Barkwood x3",
        itemIds: [26], // Array of valid item IDs
        quantity: 3,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 1,
        claimed: false,
    },
    {
        type: MissionType.CRAFT,
        label: "Craft Rustfang, Barksting, or Twigwand x1",
        equipmentIds: [1, 21, 41], // Multiple equipment options
        quantity: 1,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 2,
        claimed: false,
    },
    {
        type: MissionType.COMBAT,
        label: "Kill any monster in Sparkroot Clearing",
        monsterIds: [1, 2, 3, 4, 5, 6], // Multiple monster options
        quantity: 1,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 3,
        claimed: false,
    },
    {
        type: MissionType.GACHA,
        label: "Gacha pull x1",
        quantity: 1,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 4,
        claimed: false,
    },
    {
        type: MissionType.BREED,
        label: "Breed slime x1",
        quantity: 1,
        rewardDitto: parseUnits("50000", DITTO_DECIMALS),
        progress: 0,
        round: 5,
        claimed: false,
    }
];

export async function generateNewMission(
    telegramId: string,
    oldMission: UserMission | null
): Promise<UserMission | null> {
    const next =
        oldMission === null
            ? missions[0]
            : missions.find((m) => m.round === oldMission.round + 1) ?? null;

    // If no next mission, insert a dummy 'Tutorial Complete' mission and return
    if (!next) {
        if (oldMission) {
            await prisma.userMission.delete({
                where: { id: oldMission.id },
            });
        }

        const completed = await prisma.userMission.create({
            data: {
                telegramId,
                label: "Tutorial Complete",
                type: "FARM", // Valid dummy value from MissionType enum
                itemId: null,
                equipmentId: null,
                monsterId: null,
                slimeRarity: null,
                itemIds: undefined,
                equipmentIds: undefined,
                monsterIds: undefined,
                slimeRarities: undefined,
                quantity: 0,
                rewardDitto: "0",
                progress: 0,
                round: 6, // Clearly indicates completion
                claimed: true,
            },
        });

        return completed;
    }

    // Otherwise, replace old mission with the next one
    if (oldMission) {
        await prisma.userMission.delete({
            where: { id: oldMission.id },
        });
    }

    const created = await prisma.userMission.create({
        data: {
            telegramId,
            label: next.label,
            type: next.type,
            // Set both old and new fields for compatibility
            itemId: "itemIds" in next && Array.isArray(next.itemIds) && next.itemIds.length > 0 ? next.itemIds[0] : null,
            equipmentId: "equipmentIds" in next && Array.isArray(next.equipmentIds) && next.equipmentIds.length > 0 ? next.equipmentIds[0] : null,
            monsterId: "monsterIds" in next && Array.isArray(next.monsterIds) && next.monsterIds.length > 0 ? next.monsterIds[0] : null,
            slimeRarity: "slimeRarities" in next && Array.isArray(next.slimeRarities) && next.slimeRarities.length > 0 ? next.slimeRarities[0] as Rarity : null,
            // New array fields
            itemIds: "itemIds" in next ? JSON.stringify(next.itemIds) : undefined,
            equipmentIds: "equipmentIds" in next ? JSON.stringify(next.equipmentIds) : undefined,
            monsterIds: "monsterIds" in next ? JSON.stringify(next.monsterIds) : undefined,
            slimeRarities: "slimeRarities" in next ? JSON.stringify(next.slimeRarities) : undefined,
            quantity: next.quantity,
            rewardDitto: next.rewardDitto.toString(),
            progress: 0,
            round: next.round,
            claimed: false,
        },
    });

    return created;
}

// Helper function to check if a value is in the mission's target array
function isValidTarget(mission: UserMission, targetId: number | string, targetType: 'item' | 'equipment' | 'monster' | 'slimeRarity'): boolean {
    // Try new array format first
    try {
        let targetArray: any[] | null = null;

        switch (targetType) {
            case 'item':
                targetArray = mission.itemIds ? JSON.parse(mission.itemIds as string) : null;
                break;
            case 'equipment':
                targetArray = mission.equipmentIds ? JSON.parse(mission.equipmentIds as string) : null;
                break;
            case 'monster':
                targetArray = mission.monsterIds ? JSON.parse(mission.monsterIds as string) : null;
                break;
            case 'slimeRarity':
                targetArray = mission.slimeRarities ? JSON.parse(mission.slimeRarities as string) : null;
                break;
        }

        if (targetArray && Array.isArray(targetArray)) {
            return targetArray.includes(targetId);
        }
    } catch (error) {
        logger.error(`Error parsing mission target array for ${targetType}:`, error);
    }

    // Fallback to old single ID format for backward compatibility
    switch (targetType) {
        case 'item':
            return mission.itemId === targetId;
        case 'equipment':
            return mission.equipmentId === targetId;
        case 'monster':
            return mission.monsterId === targetId;
        case 'slimeRarity':
            return mission.slimeRarity === targetId;
        default:
            return false;
    }
}

// FARM - Updated to support multiple item IDs
export async function updateFarmMission(telegramId: string, itemId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.FARM) return;

    if (!isValidTarget(mission, itemId, 'item')) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// CRAFT - Updated to support multiple equipment IDs
export async function updateCraftMission(telegramId: string, equipmentId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.CRAFT) return;

    if (!isValidTarget(mission, equipmentId, 'equipment')) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// COMBAT - Updated to support multiple monster IDs
export async function updateCombatMission(telegramId: string, monsterId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.COMBAT) return;

    if (!isValidTarget(mission, monsterId, 'monster')) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// COMBAT (Batch) - Updated to support multiple monster IDs
export async function updateCombatMissions(updates: { telegramId: string; monsterId: number; quantity: number }[]) {
    for (const { telegramId, monsterId, quantity } of updates) {
        const mission = await prisma.userMission.findFirst({ where: { telegramId } });
        if (!mission || mission.type !== MissionType.COMBAT) continue;

        if (!isValidTarget(mission, monsterId, 'monster')) continue;

        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
    }
}

// BREED - Updated to support multiple slime rarities
export async function updateBreedMission(telegramId: string, rarity: Rarity, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.BREED) return;

    // For tutorial mission (no specific rarity requirements), accept any rarity
    let validRarities: Rarity[] = [];
    try {
        if (mission.slimeRarities) {
            validRarities = JSON.parse(mission.slimeRarities as string);
        } else if (mission.slimeRarity) {
            validRarities = [mission.slimeRarity];
        }
    } catch (error) {
        logger.error("Error parsing slime rarities:", error);
        // Fallback to old format
        if (mission.slimeRarity) {
            validRarities = [mission.slimeRarity];
        }
    }

    // If no specific rarities defined, accept any rarity (tutorial mission)
    if (validRarities.length === 0) {
        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
        return;
    }

    // Check if the bred rarity meets any of the requirements
    const rarityOrder: Rarity[] = ["D", "C", "B", "A", "S"];
    const bredRarityIndex = rarityOrder.indexOf(rarity);

    const meetsRequirement = validRarities.some(requiredRarity => {
        const requiredRarityIndex = rarityOrder.indexOf(requiredRarity);
        return bredRarityIndex >= requiredRarityIndex;
    });

    if (meetsRequirement) {
        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
    }
}

// GACHA - Updated to support multiple slime rarities
export async function updateGachaMission(telegramId: string, rarity: Rarity, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.GACHA) return;

    // Similar logic to breeding missions
    let validRarities: Rarity[] = [];
    try {
        if (mission.slimeRarities) {
            validRarities = JSON.parse(mission.slimeRarities as string);
        } else if (mission.slimeRarity) {
            validRarities = [mission.slimeRarity];
        }
    } catch (error) {
        logger.error("Error parsing slime rarities:", error);
        if (mission.slimeRarity) {
            validRarities = [mission.slimeRarity];
        }
    }

    // If no specific rarities defined, accept any rarity
    if (validRarities.length === 0) {
        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
        return;
    }

    const rarityOrder: Rarity[] = ["D", "C", "B", "A", "S"];
    const gachaRarityIndex = rarityOrder.indexOf(rarity);

    const meetsRequirement = validRarities.some(requiredRarity => {
        const requiredRarityIndex = rarityOrder.indexOf(requiredRarity);
        return gachaRarityIndex >= requiredRarityIndex;
    });

    if (meetsRequirement) {
        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
    }
}

export function isMissionComplete(mission: UserMission): boolean {
    return !mission.claimed && mission.progress >= mission.quantity;
}

export async function emitMissionUpdate(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null, userId: string) {
    if (!socket) {
        logger.error(`User socket is null. Unable to emit mission update.`);
        return;
    }

    const mission = await getUserMissionByUserId(userId);

    if (!mission) {
        logger.error(`User has no current mission. Unable to emit mission update.`);
        return;
    }

    if (mission.round >= 6) {
        logger.warn(`User has cleared tutorial missions`);
        return;
    }

    socket.emit(MISSION_UPDATE, {
        userId: userId,
        payload: {
            ...mission,
            rewardDitto: mission.rewardDitto?.toString()
        }
    });
}