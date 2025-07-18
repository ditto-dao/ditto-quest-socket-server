import { ServiceType, ShopItem, ShopItemType } from "@prisma/client";
import { logger } from "../utils/logger";
import { SocketManager } from "../socket/socket-manager";
import { canUserMintEquipment, mintEquipmentToUser } from "./equipment-inventory-operations";
import { canUserMintItem, mintItemToUser } from "./item-inventory-operations";
import { requireUserMemoryManager } from "../managers/global-managers/global-managers";
import { MAX_INITIAL_INVENTORY_SLOTS, MAX_INITIAL_SLIME_INVENTORY_SLOTS } from "../utils/config";

const NUM_INVENTORY_SLOTS_PER_PURCHASE = 4;
const NUM_SLIME_INVENTORY_SLOTS_PER_PURCHASE = 2;

export async function handleShopPurchase(
    userId: string,
    shopItem: ShopItem,
    quantity: number,
    socketManager: SocketManager
): Promise<{ [key: string]: any }> { // Return updates instead of emitting
    const updates: { [key: string]: any } = {};

    switch (shopItem.type) {
        case ShopItemType.EQUIPMENT:
            if (shopItem.equipmentId && (await canUserMintEquipment(userId, shopItem.equipmentId))) {
                const invUpdate = await mintEquipmentToUser(userId, shopItem.equipmentId, quantity);
                socketManager.emitEvent(userId, 'update-inventory', {
                    userId: userId,
                    payload: [invUpdate],
                });
                logger.info(`✅ Added ${quantity}x equipment ${shopItem.equipmentId} to user ${userId}`);
            }
            break;

        case ShopItemType.ITEM:
            if (shopItem.itemId && (await canUserMintItem(userId, shopItem.itemId))) {
                const invUpdate = await mintItemToUser(userId, shopItem.itemId, quantity);
                socketManager.emitEvent(userId, 'update-inventory', {
                    userId: userId,
                    payload: [invUpdate],
                });
                logger.info(`✅ Added ${quantity}x item ${shopItem.itemId} to user ${userId}`);
            }
            break;

        case ShopItemType.SERVICE:
            const serviceUpdates = await handleServicePurchase(userId, shopItem.serviceType, quantity, socketManager);
            Object.assign(updates, serviceUpdates);
            break;

        default:
            throw new Error(`Unknown shop item type: ${shopItem.type}`);
    }

    return updates;
}

// Handle service purchases
export async function handleServicePurchase(
    userId: string,
    serviceType: ServiceType | null,
    quantity: number,
    socketManager: SocketManager
): Promise<{ [key: string]: any }> { // Return updates instead of emitting
    if (serviceType === null) {
        throw new Error(`Unable to purchase service. Service type is null.`)
    }

    const userMemoryManager = requireUserMemoryManager();
    const userData = userMemoryManager.getUser(userId);
    if (!userData) throw new Error("User data not found");

    const updates: { [key: string]: any } = {};

    switch (serviceType) {
        case ServiceType.STAT_RESET_POINT:
            const newResetPoints = userData.statResetPoints + quantity;
            await userMemoryManager.updateUserField(userId, 'statResetPoints', newResetPoints);
            updates.statResetPoints = newResetPoints;
            logger.info(`✅ Added ${quantity} stat reset points to user ${userId}. New total: ${newResetPoints}`);
            break;

        case ServiceType.INVENTORY_SLOT:
            const newMaxSlots = userData.maxInventorySlots + quantity * NUM_INVENTORY_SLOTS_PER_PURCHASE;
            await userMemoryManager.updateUserField(userId, 'maxInventorySlots', newMaxSlots);
            updates.maxInventorySlots = newMaxSlots;
            logger.info(`✅ Added ${quantity} inventory slots to user ${userId}. New total: ${newMaxSlots}`);
            break;

        case ServiceType.SLIME_INVENTORY_SLOT:
            const newMaxSlimeSlots = userData.maxSlimeInventorySlots + quantity * NUM_SLIME_INVENTORY_SLOTS_PER_PURCHASE;
            await userMemoryManager.updateUserField(userId, 'maxSlimeInventorySlots', newMaxSlimeSlots);
            updates.maxSlimeInventorySlots = newMaxSlimeSlots;
            logger.info(`✅ Added ${quantity} slime inventory slots to user ${userId}. New total: ${newMaxSlimeSlots}`);
            break;

        default:
            throw new Error(`Unknown service type: ${serviceType}`);
    }

    return updates;
}

/**
 * Calculate how many inventory slot purchases the user has made
 */
function getInventorySlotPurchaseCount(currentMaxSlots: number): number {
    const extraSlots = currentMaxSlots - MAX_INITIAL_INVENTORY_SLOTS;
    return Math.max(0, Math.floor(extraSlots / NUM_INVENTORY_SLOTS_PER_PURCHASE));
}

/**
 * Calculate how many slime inventory slot purchases the user has made
 */
function getSlimeInventorySlotPurchaseCount(currentMaxSlots: number): number {
    const extraSlots = currentMaxSlots - MAX_INITIAL_SLIME_INVENTORY_SLOTS;
    return Math.max(0, Math.floor(extraSlots / NUM_SLIME_INVENTORY_SLOTS_PER_PURCHASE));
}

/**
 * Get the next inventory slot price in GP
 * Price increases by 100% for each purchase (2x multiplier)
 */
export function getInventorySlotPriceGP(userId: string, basePriceGP: number): number {
    const userMemoryManager = requireUserMemoryManager();

    if (userMemoryManager.hasUser(userId)) {
        const user = userMemoryManager.getUser(userId)!;
        const purchaseCount = getInventorySlotPurchaseCount(user.maxInventorySlots);
        const multiplier = Math.pow(2, purchaseCount);
        return Math.floor(basePriceGP * multiplier);
    } else {
        throw new Error(`Unable to get inventory slot price. User not in memory.`)
    }
}

/**
 * Get the next inventory slot price in DITTO wei
 * Price increases by 100% for each purchase (2x multiplier)
 */
export function getInventorySlotPriceDittoWei(userId: string, basePriceDittoWei: string): string {
    const userMemoryManager = requireUserMemoryManager();

    if (userMemoryManager.hasUser(userId)) {
        const user = userMemoryManager.getUser(userId)!;
        const purchaseCount = getInventorySlotPurchaseCount(user.maxInventorySlots);
        const multiplier = Math.pow(2, purchaseCount);
        const basePrice = BigInt(basePriceDittoWei);
        const newPrice = (basePrice * BigInt(Math.floor(multiplier * 1000))) / BigInt(1000);
        return newPrice.toString();
    } else {
        throw new Error(`Unable to get inventory slot price. User not in memory.`)
    }
}

/**
 * Get the next slime inventory slot price in GP
 * Price increases by 100% for each purchase (2x multiplier)
 */
export function getSlimeInventorySlotPriceGP(userId: string, basePriceGP: number): number {
    const userMemoryManager = requireUserMemoryManager();

    if (userMemoryManager.hasUser(userId)) {
        const user = userMemoryManager.getUser(userId)!;
        const purchaseCount = getSlimeInventorySlotPurchaseCount(user.maxSlimeInventorySlots);
        const multiplier = Math.pow(2, purchaseCount);
        return Math.floor(basePriceGP * multiplier);
    } else {
        throw new Error(`Unable to get slime inventory slot price. User not in memory.`)
    }
}

/**
 * Get the next slime inventory slot price in DITTO wei
 * Price increases by 100% for each purchase (2x multiplier)
 */
export function getSlimeInventorySlotPriceDittoWei(userId: string, basePriceDittoWei: string): string {
    const userMemoryManager = requireUserMemoryManager();

    if (userMemoryManager.hasUser(userId)) {
        const user = userMemoryManager.getUser(userId)!;
        const purchaseCount = getSlimeInventorySlotPurchaseCount(user.maxSlimeInventorySlots);
        const multiplier = Math.pow(2, purchaseCount);
        const basePrice = BigInt(basePriceDittoWei);
        const newPrice = (basePrice * BigInt(Math.floor(multiplier * 1000))) / BigInt(1000);
        return newPrice.toString();
    } else {
        throw new Error(`Unable to get slime inventory slot price. User not in memory.`)
    }
}