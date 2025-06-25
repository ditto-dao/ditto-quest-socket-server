/**
 * User operation lock keys for preventing race conditions
 * Use these constants with userMemoryManager.getUserLock(userId).acquire(LOCK_KEY, callback)
 */

export const USER_LOCK_KEYS = {
    // Slime operations (breeding, gacha, burning, minting)
    SLIME_OPERATIONS: 'slime-operations',

    // Inventory operations (add/remove items, update quantities)
    INVENTORY_OPERATIONS: 'inventory-operations',

    // Equipment operations (equip/unequip gear)
    EQUIPMENT_OPERATIONS: 'equipment-operations',

    // Currency operations (gold, any other currencies)
    CURRENCY_OPERATIONS: 'currency-operations',

    // Experience and progression (farming exp, crafting exp, combat exp, skill points, leveling)
    PROGRESSION_OPERATIONS: 'progression-operations',

    // User profile/account changes (settings, upgrades, account modifications)
    PROFILE_OPERATIONS: 'profile-operations',
} as const;

// Type for autocomplete and type safety
export type UserLockKey = typeof USER_LOCK_KEYS[keyof typeof USER_LOCK_KEYS];