import { logger } from '../utils/logger';
import { calculateExpForNextLevel } from '../utils/helpers';
import { prisma } from './client';
import { EquipmentType, User, Prisma } from '@prisma/client';

// Interface for user input
interface CreateUserInput {
    telegramId: string;
    username?: string;
}

// Function to create a user
export async function createUser(input: CreateUserInput): Promise<User> {
    try {
        // Create a new user in the database
        const user = await prisma.user.create({
            data: {
                telegramId: input.telegramId,
                username: input.username,
                combat: {
                    create: {}, // No need to specify defaults; Prisma handles this from the schema
                },
            },
            include: {
                hat: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                armour: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                weapon: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                shield: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                cape: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                necklace: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                pet: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                spellbook: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                inventory: {
                    select: {
                        id: true,
                        itemId: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        item: true,       // Includes all fields of Item
                        equipment: true,  // Includes all fields of Equipment
                    }
                },
                combat: true, // Include combat stats if needed
                // Include equipped slime with full trait details
                equippedSlime: {
                    include: {
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },

                // Include all owned slimes with full trait details
                slimes: {
                    include: {
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },
            },
        });

        logger.info(`User created: ${JSON.stringify(user, null, 2)}`);
        return user;
    } catch (error) {
        logger.error(`Failed to create user: ${error}`);
        throw error;
    }
}

// Function to check if a user exists by their telegramId
export async function userExists(telegramId: string): Promise<boolean> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: { telegramId: true }  // Only fetch the telegramId to speed up the query
        });
        return user !== null;
    } catch (error) {
        logger.error(`Failed to check user existence: ${error}`);
        throw error;
    }
}

// Function to retrieve a user by their telegramId
export async function getUserData(telegramId: string): Promise<User | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                hat: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                armour: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                weapon: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                shield: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                cape: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                necklace: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                pet: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                spellbook: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                inventory: {
                    select: {
                        id: true,
                        itemId: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        item: true,       // Includes all fields of Item
                        equipment: true,  // Includes all fields of Equipment
                    }
                },
                combat: true, // Include combat stats if needed

                // Include equipped slime with full trait details
                equippedSlime: {
                    include: {
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },

                // Include all owned slimes with full trait details
                slimes: {
                    include: {
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },
            },
        });

        if (user) {
            logger.info(`User found for ID: ${telegramId}`);
            return user;
        } else {
            logger.info(`No user found with telegramId: ${telegramId}`);
            return null;
        }
    } catch (error) {
        logger.error(`Error fetching user: ${error}`);
        throw error;
    }
}

export async function getNextInventoryOrder(telegramId: string): Promise<number> {
    const maxOrder = await prisma.inventory.aggregate({
        where: { userId: telegramId },
        _max: { order: true },
    });
    return (maxOrder._max.order ?? -1) + 1; // Start from 0 if no records exist
}

// Function to update a user's gold balance
export async function updateUserGoldBalance(telegramId: string, increment: number): Promise<number> {
    try {
        const user = await prisma.user.update({
            where: { telegramId },
            data: {
                goldBalance: {
                    increment: increment // Use 'increment' to adjust the balance by a positive or negative amount
                }
            }
        });
        logger.info(`User gold balance updated successfully: new balance is ${user.goldBalance}`);
        return user.goldBalance;
    } catch (error) {
        logger.error(`Error updating user's gold balance: ${error}`);
        throw error;
    }
}

interface IncrementMaxHpExpResponse {
    hpLevelUp: boolean,
    hpLevel: number,
    hpExp: number,
    expToNextHpLevel: number
}

// Function to increment experience for maxHp and check for maxHp level-up, return true if level up
export async function incrementMaxHpExp(telegramId: string, hpExpToAdd: number): Promise<IncrementMaxHpExpResponse> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                hpLevel: true,
                expToNextHpLevel: true,
                expHp: true
            }
        });

        if (!user) {
            logger.info(`No user found with telegramId: ${telegramId}`);
            throw new Error(`Invalid telegram ID`);
        }

        let hpLevelUp = false;
        let newHpExp = user.expHp + hpExpToAdd;
        let newHpLevel = user.hpLevel;

        // Check if the user's hp experience exceeds the threshold for maxHp level-up
        while (newHpExp >= user.expToNextHpLevel) {
            hpLevelUp = true;
            newHpExp -= user.expToNextHpLevel; // Reduce expToNextHpLevel from the accumulated hp exp
            newHpLevel++; // Increment maxHp by 10 (10 HP per level)
            user.expToNextHpLevel = calculateExpForNextLevel(newHpLevel + 1); // Update exp required for next hp level
        }

        // Update the user's maxHp and expToNextHpLevel
        await prisma.user.update({
            where: { telegramId },
            data: {
                hpLevel: newHpLevel,
                expToNextHpLevel: user.expToNextHpLevel,
            }
        });

        logger.info(`User's hpLevel updated successfully to ${newHpLevel}. Remaining expToNextHpLevel: ${user.expToNextHpLevel}`);

        return {
            hpLevelUp: hpLevelUp,
            hpLevel: newHpLevel,
            hpExp: newHpExp,
            expToNextHpLevel: user.expToNextHpLevel
        };
    } catch (error) {
        logger.error(`Error incrementing maxHp experience: ${error}`);
        throw error;
    }
}

interface IncrementUserExpResponse {
    exp: number;
}

// Function to increment a user's experience points
export async function incrementUserExp(telegramId: string, expToAdd: number): Promise<IncrementUserExpResponse> {
    try {
        let user = await prisma.user.update({
            where: { telegramId },
            data: {
                exp: {
                    increment: expToAdd
                }
            },
            include: { combat: true }
        });

        logger.info(`Experience added successfully. New experience: ${user.exp}`);

        return {
            exp: user.exp,
        };
    } catch (error) {
        logger.error(`Error incrementing user's experience: ${error}`);
        throw error;
    }
}

interface CheckAndHandleLevelUpUserResponse {
    exp: number,
    expToNextLevel: number,
    outstandingSkillPoints: number,
    hp: number
}

// Function to handle the leveling up process if necesssary
export async function checkAndHandleLevelUp(telegramId: string): Promise<CheckAndHandleLevelUpUserResponse | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: { combat: true }
        });

        if (!user) {
            throw new Error("User not found.");
        }
        if (!user.combat) {
            throw new Error("User combat data not found.");
        }

        // Check if the user has enough experience to level up
        if (user.exp >= user.expToNextLevel) {
            const newLevel = user.level + 1;
            const expToNextLevel = calculateExpForNextLevel(newLevel + 1);
            const newExp = user.exp - user.expToNextLevel;
            const regenHp = user.combat.hpLevel * 10; // Regen HP to 10 times the hpLevel

            // Update user data in the database
            await prisma.user.update({
                where: { telegramId },
                data: {
                    level: newLevel,
                    exp: newExp,
                    expToNextLevel: expToNextLevel,
                    combat: {
                        update: {
                            hp: regenHp
                        }
                    }
                }
            });

            return {
                exp: newExp,
                expToNextLevel,
                outstandingSkillPoints: user.outstandingSkillPoints,
                hp: regenHp
            };
        } else {
            // Return null if the user does not have enough exp to level up
            return null;
        }
    } catch (error) {
        logger.error(`Error in checkAndHandleLevelUp: ${error}`);
        throw error;
    }
}

interface UseSPToUpgradeSkillResponse {
    outstandingSkillPoints: number;
    skillUpdated: 'str' | 'def' | 'dex' | 'magic' | 'hp' | 'maxHp';
    incrementAmount: number;
}

// Function to use skill points to increase skill
export async function useSkillPointsToUpgradeSkill(telegramId: string, pointsToUse: number, skill: 'str' | 'def' | 'dex' | 'magic' | 'hp' | 'maxHp'): Promise<UseSPToUpgradeSkillResponse> {
    try {
        // Fetch user data with all skill fields to ensure TypeScript recognizes the properties correctly
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                outstandingSkillPoints: true,
                str: true,  // Select all possible skill fields
                def: true,
                dex: true,
                magic: true,
                hpLevel: true
            }
        });

        if (!user) {
            throw new Error(`Unable to find user.`);
        }

        // Check if the user has enough outstanding skill points
        if (user.outstandingSkillPoints >= pointsToUse) {
            // Update the specific skill and decrement the outstanding skill points
            await prisma.user.update({
                where: { telegramId },
                data: {
                    [skill]: {
                        increment: pointsToUse
                    },
                    outstandingSkillPoints: {
                        decrement: pointsToUse
                    }
                }
            });
            logger.info(`Skill ${skill} incremented by ${pointsToUse}. Remaining outstanding skill points: ${user.outstandingSkillPoints - pointsToUse}`);

            return {
                outstandingSkillPoints: user.outstandingSkillPoints - pointsToUse,
                skillUpdated: skill,
                incrementAmount: pointsToUse
            }
        } else {
            throw new Error(`Not enough skill points.`);
        }
    } catch (error) {
        logger.error(`Error using skill points to upgrade ${skill}: ${error}`);
        throw error;
    }
}

/* USER SPECIFIC EQUIPMENT FUNCTIONS */

// Function to get equipped item from user by equipment type
export async function getEquippedByEquipmentType(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }> | null> {
    try {
        // Fetch the user's equipped item for the given equipment type
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                hat: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                armour: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                weapon: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                shield: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                cape: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                necklace: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                pet: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                spellbook: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
            },
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        // Dynamically extract the equipped item based on the equipment type
        const equippedInventory = user[equipmentType] as Prisma.InventoryGetPayload<{
            include: {
                id: true,
                equipmentId: true,
                equipment: true,
                quantity: true,
                order: true,
                createdAt: true,
            }
        }> | null;

        return equippedInventory;
    } catch (error) {
        console.error(`Error fetching equipped item for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to equip equipment by inventory ID
export async function equipEquipmentForUser(
    telegramId: string,
    inventoryId: number
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }>> {
    try {
        // Fetch the equipment from the user's inventory
        const equipmentInventory = await prisma.inventory.findUnique({
            where: { id: inventoryId },
            include: { equipment: true }, // Include equipment details
        });

        // Check if the equipment exists and belongs to the user
        if (!equipmentInventory || equipmentInventory.userId.toString() !== telegramId) {
            throw new Error(`Inventory ID ${inventoryId} not found in inventory for user ${telegramId}`);
        }

        if (!equipmentInventory.equipment) {
            throw new Error(`Inventory object is not an equipment`);
        }

        const equipmentType = equipmentInventory.equipment.type;
        const equipField = `${equipmentType}InventoryId`; // Dynamically construct the inventory ID field name

        // Equip the new equipment
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                [equipField]: inventoryId, // Update the specific inventory field for the equipment type
            },
            include: {
                [equipmentType]: { include: { equipment: true } }, // Include the updated relation details
            },
        });

        logger.info(
            `User ${telegramId} equipped ${equipmentInventory.equipment.name} of type ${equipmentType}.`
        );

        return equipmentInventory; // Return the equipment inventory details
    } catch (error) {
        logger.error(
            `Failed to equip equipment ${inventoryId} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

// Function to unequip equipment by type for the user
export async function unequipEquipmentForUser(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<boolean> {
    try {
        // Dynamically construct the inventory ID field name
        const equipField = `${equipmentType}InventoryId`;

        // Fetch the user's currently equipped item for the given slot
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: { [equipField]: true }, // Fetch only the relevant field
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        // Check if the slot is already empty
        if (user[equipField] === null) {
            logger.info(
                `User ${telegramId} already has nothing equipped in the ${equipmentType} slot.`
            );
            return false; // No update needed
        }

        // Perform the unequip operation
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                [equipField]: null, // Clear the field for the equipment type
            },
            include: {
                [equipmentType]: true, // Include the related equipment details
            },
        });

        logger.info(
            `User ${telegramId} unequipped equipment of type ${equipmentType}.`
        );

        return !!updatedUser;
    } catch (error) {
        logger.error(
            `Failed to unequip equipment of type ${equipmentType} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

/* USER SPECIFIC FARMING FUNCTIONS */

export async function getUserFarmingLevel(telegramId: number): Promise<number> {
  try {
    // Fetch the user farming level
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() },
      select: { farmingLevel: true }, // Select only the farming level
    });

    if (!user) {
      throw new Error(`User with telegramId ${telegramId} not found.`);
    }

    return user.farmingLevel;
  } catch (error) {
    console.error(`Error fetching user farming level: ${error}`);
    throw error; // Re-throw the error for further handling
  }
}

export async function addFarmingExp(userId: number, expToAdd: number) {
    const user = await prisma.user.findUnique({ where: { telegramId: userId.toString() } });

    if (!user) {
        throw new Error("User not found");
    }

    let { farmingExp, expToNextFarmingLevel, farmingLevel } = user;
    let farmingLevelsGained = 0;

    // Add experience
    farmingExp += expToAdd;

    // Check for level-ups
    while (farmingExp >= expToNextFarmingLevel) {
        farmingExp -= expToNextFarmingLevel; // Remove exp required for the current level
        farmingLevel += 1; // Increment level
        farmingLevelsGained += 1;
        expToNextFarmingLevel = calculateExpForNextLevel(farmingLevel + 1); // Calculate new exp requirement
    }

    // Update the user
    await prisma.user.update({
        where: { telegramId: userId.toString() },
        data: {
            farmingExp,
            expToNextFarmingLevel,
            farmingLevel,
        },
    });

    return { farmingLevel, farmingLevelsGained, farmingExp, expToNextFarmingLevel };
}


/* USER SPECIFIC CRAFTING FUNCTIONS */

export async function getUserCraftingLevel(telegramId: number): Promise<number> {
    try {
      // Fetch the user farming level
      const user = await prisma.user.findUnique({
        where: { telegramId: telegramId.toString() },
        select: { craftingLevel: true }, // Select only the farming level
      });
  
      if (!user) {
        throw new Error(`User with telegramId ${telegramId} not found.`);
      }
  
      return user.craftingLevel;
    } catch (error) {
      console.error(`Error fetching user crafting level: ${error}`);
      throw error; // Re-throw the error for further handling
    }
  }

export async function addCraftingExp(userId: number, expToAdd: number) {
    const user = await prisma.user.findUnique({ where: { telegramId: userId.toString() } });

    if (!user) {
        throw new Error("User not found");
    }

    let { craftingExp, expToNextCraftingLevel, craftingLevel } = user;
    let craftingLevelsGained = 0;

    // Add experience
    craftingExp += expToAdd;

    // Check for level-ups
    while (craftingExp >= expToNextCraftingLevel) {
        craftingExp -= expToNextCraftingLevel; // Remove exp required for the current level
        craftingLevel += 1; // Increment level
        craftingLevelsGained += 1;
        expToNextCraftingLevel = calculateExpForNextLevel(craftingLevel + 1); // Calculate new exp requirement
    }

    // Update the user
    await prisma.user.update({
        where: { telegramId: userId.toString() },
        data: {
            craftingLevel,
            craftingExp,
            expToNextCraftingLevel,
        },
    });

    return { craftingLevel, craftingLevelsGained, craftingExp, expToNextCraftingLevel };
}