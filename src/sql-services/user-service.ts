import { logger } from '../utils/logger';
import { calculateExpForNextLevel, getEquipFieldByType } from '../utils/helpers';
import { prisma } from './client';
import { EquipmentInventory, EquipmentType, User } from '@prisma/client';

// Interface for user input
interface CreateUserInput {
    telegramId: number;
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
                hat: true,
                armour: true,
                weapon: true,
                shield: true,
                cape: true,
                necklace: true,
                pet: true,
                spellbook: true,
                equipmentInventory: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                str: true,
                                def: true,
                                dex: true,
                                magic: true,
                                hp: true,
                                rarity: true,
                                type: true,
                            },
                        },
                    },
                },
                itemInventory: {
                    select: {
                        id: true,
                        itemId: true,
                        quantity: true,
                        item: {
                            select: {
                                itemId: true,
                                name: true,
                                description: true,
                                rarity: true,
                            },
                        },
                    },
                },
                combat: true, // Include combat stats if needed

                // Include equipped slime with full trait details
                equippedSlime: {
                    include: {
                        AuraDominant: true,
                        AuraHidden1: true,
                        AuraHidden2: true,
                        AuraHidden3: true,
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        CoreDominant: true,
                        CoreHidden1: true,
                        CoreHidden2: true,
                        CoreHidden3: true,
                        HeadpieceDominant: true,
                        HeadpieceHidden1: true,
                        HeadpieceHidden2: true,
                        HeadpieceHidden3: true,
                        TailDominant: true,
                        TailHidden1: true,
                        TailHidden2: true,
                        TailHidden3: true,
                        ArmsDominant: true,
                        ArmsHidden1: true,
                        ArmsHidden2: true,
                        ArmsHidden3: true,
                        EyesDominant: true,
                        EyesHidden1: true,
                        EyesHidden2: true,
                        EyesHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },

                // Include all owned slimes with full trait details
                Slime: {
                    include: {
                        AuraDominant: true,
                        AuraHidden1: true,
                        AuraHidden2: true,
                        AuraHidden3: true,
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        CoreDominant: true,
                        CoreHidden1: true,
                        CoreHidden2: true,
                        CoreHidden3: true,
                        HeadpieceDominant: true,
                        HeadpieceHidden1: true,
                        HeadpieceHidden2: true,
                        HeadpieceHidden3: true,
                        TailDominant: true,
                        TailHidden1: true,
                        TailHidden2: true,
                        TailHidden3: true,
                        ArmsDominant: true,
                        ArmsHidden1: true,
                        ArmsHidden2: true,
                        ArmsHidden3: true,
                        EyesDominant: true,
                        EyesHidden1: true,
                        EyesHidden2: true,
                        EyesHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },
            },
        });

        logger.info(`User created: ${user}`);
        return user;
    } catch (error) {
        logger.error(`Failed to create user: ${error}`);
        throw error;
    }
}

// Function to check if a user exists by their telegramId
export async function userExists(telegramId: number): Promise<boolean> {
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
export async function getUserData(telegramId: number): Promise<User | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                hat: true,
                armour: true,
                weapon: true,
                shield: true,
                cape: true,
                necklace: true,
                pet: true,
                spellbook: true,
                equipmentInventory: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                str: true,
                                def: true,
                                dex: true,
                                magic: true,
                                hp: true,
                                rarity: true,
                                type: true,
                            },
                        },
                    },
                },
                itemInventory: {
                    select: {
                        id: true,
                        itemId: true,
                        quantity: true,
                        item: {
                            select: {
                                itemId: true, // Use itemId instead of id
                                name: true,
                                description: true,
                                rarity: true,
                            },
                        },
                    },
                },
                combat: true, // Include combat stats if needed

                // Include equipped slime with full trait details
                equippedSlime: {
                    include: {
                        AuraDominant: true,
                        AuraHidden1: true,
                        AuraHidden2: true,
                        AuraHidden3: true,
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        CoreDominant: true,
                        CoreHidden1: true,
                        CoreHidden2: true,
                        CoreHidden3: true,
                        HeadpieceDominant: true,
                        HeadpieceHidden1: true,
                        HeadpieceHidden2: true,
                        HeadpieceHidden3: true,
                        TailDominant: true,
                        TailHidden1: true,
                        TailHidden2: true,
                        TailHidden3: true,
                        ArmsDominant: true,
                        ArmsHidden1: true,
                        ArmsHidden2: true,
                        ArmsHidden3: true,
                        EyesDominant: true,
                        EyesHidden1: true,
                        EyesHidden2: true,
                        EyesHidden3: true,
                        MouthDominant: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },

                // Include all owned slimes with full trait details
                Slime: {
                    include: {
                        AuraDominant: true,
                        AuraHidden1: true,
                        AuraHidden2: true,
                        AuraHidden3: true,
                        BodyDominant: true,
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        CoreDominant: true,
                        CoreHidden1: true,
                        CoreHidden2: true,
                        CoreHidden3: true,
                        HeadpieceDominant: true,
                        HeadpieceHidden1: true,
                        HeadpieceHidden2: true,
                        HeadpieceHidden3: true,
                        TailDominant: true,
                        TailHidden1: true,
                        TailHidden2: true,
                        TailHidden3: true,
                        ArmsDominant: true,
                        ArmsHidden1: true,
                        ArmsHidden2: true,
                        ArmsHidden3: true,
                        EyesDominant: true,
                        EyesHidden1: true,
                        EyesHidden2: true,
                        EyesHidden3: true,
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


// Function to update a user's gold balance
export async function updateUserGoldBalance(telegramId: number, increment: number): Promise<number> {
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
export async function incrementMaxHpExp(telegramId: number, hpExpToAdd: number): Promise<IncrementMaxHpExpResponse> {
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
export async function incrementUserExp(telegramId: number, expToAdd: number): Promise<IncrementUserExpResponse> {
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
export async function checkAndHandleLevelUp(telegramId: number): Promise<CheckAndHandleLevelUpUserResponse | null> {
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
export async function useSkillPointsToUpgradeSkill(telegramId: number, pointsToUse: number, skill: 'str' | 'def' | 'dex' | 'magic' | 'hp' | 'maxHp'): Promise<UseSPToUpgradeSkillResponse> {
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

// Function to equip equipment by equipment inventory id
export async function equipEquipmentForUser(
    telegramId: number,
    equipmentInvId: number
): Promise<EquipmentInventory & { equipment: { type: EquipmentType } } | null> {
    try {
        // Fetch the equipment from the user's inventory
        const equipmentInventory = await prisma.equipmentInventory.findUnique({
            where: { id: equipmentInvId },
            include: { equipment: true } // Include equipment details
        });

        // Check if the equipment exists and belongs to the user
        if (!equipmentInventory || equipmentInventory.userId !== telegramId) {
            logger.error(`Equipment ${equipmentInvId} not found in inventory for user ${telegramId}`);
            return null;
        }

        const equipmentType = equipmentInventory.equipment.type;

        // Define the corresponding field to update based on the equipment type
        const equipField = getEquipFieldByType(equipmentType);

        if (!equipField) {
            throw new Error(`Invalid equipment type: ${equipmentType}`);
        }

        // Unequip the currently equipped item of the same type, if any
        await prisma.user.update({
            where: { telegramId },
            data: {
                [equipField]: equipmentInvId // Equip the new equipment
            },
            include: {
                [equipField]: true
            }
        });

        logger.info(`User ${telegramId} equipped ${equipmentInventory.equipment.name} of type ${equipmentType}.`);
        return equipmentInventory;

    } catch (error) {
        logger.error(`Failed to equip equipment ${equipmentInvId} for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to unequip equipment by type for the user
export async function unequipEquipmentForUser(
    telegramId: number,
    equipmentType: EquipmentType
): Promise<void> {
    try {
        // Define the corresponding field to update based on the equipment type
        const equipField = getEquipFieldByType(equipmentType);

        if (!equipField) {
            throw new Error(`Invalid equipment type: ${equipmentType}`);
        }

        // Update the user and set the specific equipment field to null (unequip)
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                [equipField]: null // Unequip the item by setting the field to null
            }
        });

        logger.info(`User ${telegramId} unequipped equipment of type ${equipmentType}.`);

    } catch (error) {
        logger.error(`Failed to unequip equipment of type ${equipmentType} for user ${telegramId}: ${error}`);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}
