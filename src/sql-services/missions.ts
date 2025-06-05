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

const missions = [
    {
        type: MissionType.FARM,
        label: "Farm Barkwood x1",
        itemId: 26,
        quantity: 1,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 1,
        claimed: false,
    },
    {
        type: MissionType.CRAFT,
        label: "Craft Rustfang x1",
        equipmentId: 1,
        quantity: 1,
        rewardDitto: parseUnits("5000", DITTO_DECIMALS),
        progress: 0,
        round: 2,
        claimed: false,
    },
    {
        type: MissionType.COMBAT,
        label: "Kill Spriggloo x1",
        monsterId: 1,
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
            itemId: "itemId" in next ? next.itemId : null,
            equipmentId: "equipmentId" in next ? next.equipmentId : null,
            monsterId: "monsterId" in next ? next.monsterId : null,
            slimeRarity: "slimeRarity" in next ? next.slimeRarity as Rarity : null,
            quantity: next.quantity,
            rewardDitto: next.rewardDitto.toString(),
            progress: 0,
            round: next.round,
            claimed: false,
        },
    });

    return created;
}

// FARM
export async function updateFarmMission(telegramId: string, itemId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.FARM || mission.itemId !== itemId) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// CRAFT
export async function updateCraftMission(telegramId: string, equipmentId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.CRAFT || mission.equipmentId !== equipmentId) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// COMBAT
export async function updateCombatMission(telegramId: string, monsterId: number, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.COMBAT || mission.monsterId !== monsterId) return;

    await prisma.userMission.update({
        where: { id: mission.id },
        data: { progress: { increment: quantity } },
    });
}

// COMBAT (Batch)
export async function updateCombatMissions(updates: { telegramId: string; monsterId: number; quantity: number }[]) {
    for (const { telegramId, monsterId, quantity } of updates) {
        const mission = await prisma.userMission.findFirst({ where: { telegramId } });
        if (!mission || mission.type !== MissionType.COMBAT || mission.monsterId !== monsterId) continue;

        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
    }
}

// BREED
export async function updateBreedMission(telegramId: string, rarity: Rarity, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.BREED || mission.slimeRarity === null) return;

    const rarityOrder: Rarity[] = ["D", "C", "B", "A", "S"];
    if (rarityOrder.indexOf(rarity) >= rarityOrder.indexOf(mission.slimeRarity)) {
        await prisma.userMission.update({
            where: { id: mission.id },
            data: { progress: { increment: quantity } },
        });
    }
}

// GACHA
export async function updateGachaMission(telegramId: string, rarity: Rarity, quantity: number) {
    const mission = await prisma.userMission.findFirst({ where: { telegramId } });
    if (!mission || mission.type !== MissionType.GACHA) return;

    const shouldIncrement =
        mission.slimeRarity === null ||
        ["D", "C", "B", "A", "S"].indexOf(rarity) >= ["D", "C", "B", "A", "S"].indexOf(mission.slimeRarity);

    if (shouldIncrement) {
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

    if (mission.round >= 5) {
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