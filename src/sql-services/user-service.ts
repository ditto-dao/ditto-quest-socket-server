import { logger } from '../utils/logger';
import { calculateCombatPower, calculateExpForNextLevel, calculateHpExpGained } from '../utils/helpers';
import { prisma } from './client';
import { Combat, EquipmentType, Prisma, StatEffect, User } from '@prisma/client';
import { ABILITY_POINTS_PER_LEVEL } from '../utils/config';
import { getBaseMaxHpFromHpLvl, getBaseAtkSpdFromDex, getBaseAccFromDex, getBaseEvaFromDex, getBaseMaxDmg, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseDmgReductionFromDef, getBaseMagicDmgReductionFromDefAndMagic, getBaseHpRegenRateFromHpLvl, getBaseHpRegenAmtFromHpLvl } from '../managers/idle-managers/combat/combat-helpers';

// Interface for user input
interface CreateUserInput {
    telegramId: string;
    username?: string;
}

export type FullUserData = Prisma.UserGetPayload<{
    include: {
        combat: true;
        lastBattleEndTimestamp: true;
        inventory: {
            select: {
                id: true;
                itemId: true;
                equipmentId: true;
                quantity: true;
                order: true;
                createdAt: true;
                item: {
                    include: {
                        statEffect: true;
                    }
                };
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        hat: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        armour: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        weapon: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        shield: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        cape: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        necklace: {
            select: {
                id: true;
                equipmentId: true;
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
                quantity: true;
                order: true;
                createdAt: true;
            };
        };
        equippedSlime: {
            include: {
                BodyDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                BodyHidden1: true;
                BodyHidden2: true;
                BodyHidden3: true;
                PatternDominant:
                {
                    include: {
                        statEffect: true;
                    }
                };
                PatternHidden1: true;
                PatternHidden2: true;
                PatternHidden3: true;
                PrimaryColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PrimaryColourHidden1: true;
                PrimaryColourHidden2: true;
                PrimaryColourHidden3: true;
                AccentDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                AccentHidden1: true;
                AccentHidden2: true;
                AccentHidden3: true;
                DetailDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                DetailHidden1: true;
                DetailHidden2: true;
                DetailHidden3: true;
                EyeColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeColourHidden1: true;
                EyeColourHidden2: true;
                EyeColourHidden3: true;
                EyeShapeDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeShapeHidden1: true;
                EyeShapeHidden2: true;
                EyeShapeHidden3: true;
                MouthDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                MouthHidden1: true;
                MouthHidden2: true;
                MouthHidden3: true;
            };
        };
        slimes: {
            include: {
                BodyDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                BodyHidden1: true;
                BodyHidden2: true;
                BodyHidden3: true;
                PatternDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PatternHidden1: true;
                PatternHidden2: true;
                PatternHidden3: true;
                PrimaryColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PrimaryColourHidden1: true;
                PrimaryColourHidden2: true;
                PrimaryColourHidden3: true;
                AccentDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                AccentHidden1: true;
                AccentHidden2: true;
                AccentHidden3: true;
                DetailDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                DetailHidden1: true;
                DetailHidden2: true;
                DetailHidden3: true;
                EyeColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeColourHidden1: true;
                EyeColourHidden2: true;
                EyeColourHidden3: true;
                EyeShapeDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeShapeHidden1: true;
                EyeShapeHidden2: true;
                EyeShapeHidden3: true;
                MouthDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                MouthHidden1: true;
                MouthHidden2: true;
                MouthHidden3: true;
            };
        };
    };
}>;

// Function to create a user
export async function createUser(input: CreateUserInput): Promise<FullUserData> {
    try {
        // Create a new user in the database
        const user = await prisma.user.create({
            data: {
                telegramId: input.telegramId,
                username: input.username,
                combat: {
                    create: {}, // Always create combat for new user
                },
            },
            include: {
                hat: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                armour: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                weapon: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                shield: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                cape: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                        quantity: true,
                        order: true,
                        createdAt: true,
                    }
                },
                necklace: {
                    select: {
                        id: true,
                        equipmentId: true,
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
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
                        item: {
                            include: {
                                statEffect: true,
                            },
                        },
                        equipment: {
                            include: {
                                statEffect: true,
                            },
                        },
                    }
                },
                combat: true,
                equippedSlime: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: { include: { statEffect: true } },
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: { include: { statEffect: true } },
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: { include: { statEffect: true } },
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: { include: { statEffect: true } },
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: { include: { statEffect: true } },
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: { include: { statEffect: true } },
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true,
                    },
                },
                slimes: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternDominant: { include: { statEffect: true } },
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourDominant: { include: { statEffect: true } },
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentDominant: { include: { statEffect: true } },
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailDominant: { include: { statEffect: true } },
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeDominant: { include: { statEffect: true } },
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthDominant: { include: { statEffect: true } },
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


export async function getUserData(telegramId: string): Promise<FullUserData | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                combat: true,
                inventory: {
                    select: {
                        id: true,
                        itemId: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        item: {
                            include: {
                                statEffect: true
                            }
                        },
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                hat: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                armour: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                weapon: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                shield: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                cape: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                necklace: {
                    select: {
                        id: true,
                        equipmentId: true,
                        quantity: true,
                        order: true,
                        createdAt: true,
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                equippedSlime: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },

                        // Hidden traits: keep them without statEffects
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true
                    }
                },
                slimes: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },

                        // Hidden traits excluded from statEffect
                        BodyHidden1: true,
                        BodyHidden2: true,
                        BodyHidden3: true,
                        PatternHidden1: true,
                        PatternHidden2: true,
                        PatternHidden3: true,
                        PrimaryColourHidden1: true,
                        PrimaryColourHidden2: true,
                        PrimaryColourHidden3: true,
                        AccentHidden1: true,
                        AccentHidden2: true,
                        AccentHidden3: true,
                        DetailHidden1: true,
                        DetailHidden2: true,
                        DetailHidden3: true,
                        EyeColourHidden1: true,
                        EyeColourHidden2: true,
                        EyeColourHidden3: true,
                        EyeShapeHidden1: true,
                        EyeShapeHidden2: true,
                        EyeShapeHidden3: true,
                        MouthHidden1: true,
                        MouthHidden2: true,
                        MouthHidden3: true
                    }
                }
            }
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

export async function getSimpleUserData(
    telegramId: string
): Promise<Prisma.UserGetPayload<{ include: { combat: true } }> | null> {
    return await prisma.user.findUnique({
        where: { telegramId },
        include: {
            combat: true,
        },
    });
}

export async function getBaseUserData(
    telegramId: string
): Promise<User | null> {
    return await prisma.user.findUnique({
        where: { telegramId }
    });
}

export async function updateUserPartial(
    telegramId: string,
    data: Prisma.UserUpdateInput
): Promise<User> {
    try {
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data,
        });

        return updatedUser;
    } catch (err) {
        throw new Error(`Failed to update user ${telegramId}: ${err}`);
    }
}

export type UserDataEquipped = Prisma.UserGetPayload<{
    include: {
        combat: true;
        hat: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        armour: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        weapon: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        shield: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        cape: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        necklace: {
            select: {
                equipment: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
        equippedSlime: {
            include: {
                BodyDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PatternDominant:
                {
                    include: {
                        statEffect: true;
                    }
                };
                PrimaryColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                AccentDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                DetailDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeShapeDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                MouthDominant: {
                    include: {
                        statEffect: true;
                    }
                };
            };
        };
    };
}>;

export async function getUserEquippedData(
    telegramId: string
): Promise<UserDataEquipped | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                combat: true,
                hat: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                armour: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                weapon: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                shield: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                cape: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                necklace: {
                    select: {
                        equipment: {
                            include: {
                                statEffect: true
                            }
                        }
                    }
                },
                equippedSlime: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } }
                    }
                }
            }
        });

        if (!user) {
            logger.warn(`No equipped user found with telegramId: ${telegramId}`);
            return null;
        }

        return user;
    } catch (error) {
        logger.error(`Failed to get equipped user data for ${telegramId}: ${error}`);
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

// Function to update a user's gold balance (prevents negative values)
export async function incrementUserGoldBalance(telegramId: string, increment: number): Promise<number> {
    try {
        // Fetch the user's current balance
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: { goldBalance: true }
        });

        if (!user) {
            throw new Error(`User with Telegram ID ${telegramId} not found.`);
        }

        const newBalance = user.goldBalance + increment;

        // Ensure balance does not go negative
        if (newBalance < 0) {
            throw new Error(`Insufficient gold balance (Balance: ${user.goldBalance} < ${increment})`);
        }

        // Update the user's balance
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                goldBalance: newBalance
            }
        });

        logger.info(`User gold balance updated successfully: new balance is ${updatedUser.goldBalance}`);
        return updatedUser.goldBalance;
    } catch (error) {
        logger.error(`Error updating user's gold balance: ${error}`);
        throw error;
    }
}

interface IncrementExpAndHpExpResponse {
    simpleUser: Partial<FullUserData> | null

    levelUp: boolean;
    level: number;
    exp: number;
    expToNextLevel: number;
    outstandingSkillPoints: number;

    hpLevelUp: boolean;
    hpLevel: number;
    hpExp: number;
    expToNextHpLevel: number;
}

export async function incrementExpAndHpExpAndCheckLevelUp(
    telegramId: string,
    expToAdd: number
): Promise<IncrementExpAndHpExpResponse> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: { combat: true }
        });

        if (!user) throw new Error("User not found.");
        if (!user.combat) throw new Error("User combat data not found.");

        // Level Logic
        let newExp = user.exp + expToAdd;
        let currLevel = user.level;
        let outstandingSkillPoints = user.outstandingSkillPoints;
        let expToNextLevel = user.expToNextLevel;
        let levelUp = false;

        while (newExp >= calculateExpForNextLevel(currLevel + 1)) {
            newExp -= calculateExpForNextLevel(currLevel + 1);
            currLevel++;
            outstandingSkillPoints += ABILITY_POINTS_PER_LEVEL;
            levelUp = true;
        }

        expToNextLevel = calculateExpForNextLevel(currLevel + 1); // only update once at end

        // HP Exp Logic
        let newHpExp = user.expHp + calculateHpExpGained(expToAdd);
        let currHpLevel = user.hpLevel;
        let expToNextHpLevel = user.expToNextHpLevel;
        let hpLevelUp = false;

        while (newHpExp >= calculateExpForNextLevel(currHpLevel + 1)) {
            newHpExp -= calculateExpForNextLevel(currHpLevel + 1);
            currHpLevel++;
            hpLevelUp = true;
        }

        expToNextHpLevel = calculateExpForNextLevel(currHpLevel + 1); // update after loop

        // Update database
        await prisma.user.update({
            where: { telegramId },
            data: {
                level: currLevel,
                exp: newExp,
                expToNextLevel,
                outstandingSkillPoints,
                hpLevel: currHpLevel,
                expHp: newHpExp,
                expToNextHpLevel,
            }
        });

        let hpLevelUpdatedUser;
        if (hpLevelUp) {
            hpLevelUpdatedUser = await recalculateAndUpdateUserBaseStats(telegramId);
        }

        logger.info(
            `User ${telegramId} → LVL ${currLevel}, EXP ${newExp}/${expToNextLevel} | HP LVL ${currHpLevel}, HP EXP ${newHpExp}/${expToNextHpLevel}`
        );

        return {
            simpleUser: (hpLevelUp && hpLevelUpdatedUser) ? hpLevelUpdatedUser : null,
            levelUp,
            level: currLevel,
            exp: newExp,
            expToNextLevel,
            outstandingSkillPoints,
            hpLevelUp,
            hpLevel: currHpLevel,
            hpExp: newHpExp,
            expToNextHpLevel
        };
    } catch (error) {
        logger.error(`Error in incrementExpAndHpExpAndCheckLevelUp: ${error}`);
        throw error;
    }
}

export interface SkillUpgradeInput {
    str?: number;
    def?: number;
    dex?: number;
    luk?: number;
    magic?: number;
    hpLevel?: number;
};

export interface SkillUpgradeInput {
    str?: number;
    def?: number;
    dex?: number;
    luk?: number;
    magic?: number;
    hpLevel?: number;
}

export async function applySkillUpgradesOnly(
    userId: string,
    upgrades: SkillUpgradeInput,
) {
    const entries = Object.entries(upgrades).filter(([_, v]) => v !== undefined);

    if (entries.length === 0) {
        throw new Error(`No skill upgrades provided for user ${userId}`);
    }

    let totalPointsNeeded = 0;
    const updateData: Record<string, { increment: number }> = {};

    const validKeys = ["str", "def", "dex", "luk", "magic", "hpLevel"] as const;

    let isHpUpgrade = false;
    let hpLevelToAdd = 0;

    for (const [key, value] of entries) {
        if (!validKeys.includes(key as any)) {
            throw new Error(`Invalid skill key: "${key}"`);
        }

        if (typeof value !== "number" || value <= 0 || !Number.isInteger(value)) {
            throw new Error(
                `Invalid skill upgrade value for "${key}": must be a positive integer`
            );
        }

        updateData[key] = { increment: value };
        totalPointsNeeded += value;

        if (key === "hpLevel") {
            isHpUpgrade = true;
            hpLevelToAdd = value;
        }
    }

    const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        select: {
            outstandingSkillPoints: true,
            hpLevel: true,
        },
    });

    if (!user) {
        throw new Error(`User not found: ${userId}`);
    }

    if (user.outstandingSkillPoints < totalPointsNeeded) {
        throw new Error(
            `User ${userId} has ${user.outstandingSkillPoints} skill points, but tried to use ${totalPointsNeeded}`
        );
    }

    const additionalHpFields = isHpUpgrade
        ? {
            expHp: 0,
            expToNextHpLevel: calculateExpForNextLevel(user.hpLevel + hpLevelToAdd),
        }
        : {};

    await prisma.user.update({
        where: { telegramId: userId },
        data: {
            ...updateData,
            ...additionalHpFields,
            outstandingSkillPoints: { decrement: totalPointsNeeded },
        },
    });

    logger.info(
        `✅ Applied raw skill upgrades to user ${userId} — used ${totalPointsNeeded} points`
    );

    return { totalPointsUsed: totalPointsNeeded };
}

/* USER SPECIFIC EQUIPMENT FUNCTIONS */

const EQUIPPED_SELECT = {
    id: true,
    equipmentId: true,
    equipment: true,
    quantity: true,
    order: true,
    createdAt: true,
} as const;

export type EquippedInventory = Prisma.InventoryGetPayload<{
    include: { equipment: true };
}>;

function buildUserIncludeObject<T extends EquipmentType>(type: T) {
    return {
        [type]: {
            select: EQUIPPED_SELECT,
        },
    } as const;
}

export async function getEquippedByEquipmentType(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<EquippedInventory | null> {
    try {
        const include = buildUserIncludeObject(equipmentType);

        const user = await prisma.user.findUnique({
            where: { telegramId },
            include,
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        const equipped = user[equipmentType];
        if (equipped && "equipment" in equipped) {
            return equipped as unknown as EquippedInventory;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching equipped item for user ${telegramId}:`, error);
        throw error;
    }
}

// Function to equip equipment
export async function equipEquipmentForUser(
    telegramId: string,
    equipmentInventory: Prisma.InventoryGetPayload<{ include: { equipment: true } }>
): Promise<UserDataEquipped> {
    try {
        if (!equipmentInventory.equipment) throw new Error(`Equip equipment failed. Input inventory element is not an equipment.`)

        const equipmentType = equipmentInventory.equipment.type;
        const equipField = `${equipmentType}InventoryId`; // Dynamically construct the inventory ID field name

        // Equip the new equipment
        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                [equipField]: equipmentInventory.id,
            },
            include: {
                [equipmentType]: { include: { equipment: true } }, // Include the updated relation details
            },
        });

        if (equipmentInventory.equipment.requiredLvl > updatedUser.level) throw new Error(`User does not meet level requirements`);

        logger.info(
            `User ${telegramId} equipped ${equipmentInventory.equipment.name} of type ${equipmentType}.`
        );

        return await recalculateAndUpdateUserStats(telegramId);

    } catch (error) {
        logger.error(
            `Failed to equip equipment ${JSON.stringify(equipmentInventory, null, 2)} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

// Function to unequip equipment by type for the user
export async function unequipEquipmentForUser(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<UserDataEquipped | undefined> {
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
            return;
        }

        // Perform the unequip operation
        await prisma.user.update({
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

        return await recalculateAndUpdateUserStats(telegramId);
    } catch (error) {
        logger.error(
            `Failed to unequip equipment of type ${equipmentType} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

/* USER SPECIFIC FARMING FUNCTIONS */

export async function getUserFarmingLevel(telegramId: string): Promise<number> {
    try {
        // Fetch the user farming level
        const user = await prisma.user.findUnique({
            where: { telegramId: telegramId },
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

export async function addFarmingExp(userId: string, expToAdd: number) {
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

export async function getUserCraftingLevel(telegramId: string): Promise<number> {
    try {
        // Fetch the user farming level
        const user = await prisma.user.findUnique({
            where: { telegramId: telegramId },
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

export async function addCraftingExp(userId: string, expToAdd: number) {
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

export async function recalculateAndUpdateUserStats(
    telegramId: string
): Promise<UserDataEquipped> {
    const user = await getUserEquippedData(telegramId);

    if (!user || !user.combat) throw new Error(`User or combat not found for ${telegramId}`);

    logger.info(`combat before recalculate: ${JSON.stringify(user.combat, null, 2)}`);

    const userCombat: Combat = {
        ...user.combat,
        hp: user.maxHp,
        maxHp: user.maxHp,
        atkSpd: user.atkSpd,
        acc: user.acc,
        eva: user.eva,
        maxMeleeDmg: user.maxMeleeDmg,
        maxRangedDmg: user.maxRangedDmg,
        maxMagicDmg: user.maxMagicDmg,
        critChance: user.critChance,
        critMultiplier: user.critMultiplier,
        dmgReduction: user.dmgReduction,
        magicDmgReduction: user.magicDmgReduction,
        hpRegenRate: user.hpRegenRate,
        hpRegenAmount: user.hpRegenAmount,

        // Leave existing multipliers and reinforcements as-is or reset if needed
        meleeFactor: 0,
        rangeFactor: 0,
        magicFactor: 0,
        reinforceAir: 0,
        reinforceWater: 0,
        reinforceEarth: 0,
        reinforceFire: 0,
    };

    const statEffects: StatEffect[] = [];

    const equippedItems = [
        user.hat,
        user.armour,
        user.weapon,
        user.shield,
        user.cape,
        user.necklace,
    ];

    let updatedAttackType = false;

    for (const item of equippedItems) {
        const effect = item?.equipment?.statEffect;
        if (effect) {
            statEffects.push(effect);
        } else if (item?.equipment) {
            logger.error(`Equipment "${item.equipment.name}" (ID: ${item.equipment.id}) has no statEffect.`);
        }

        if (item?.equipment?.attackType && !updatedAttackType) {
            userCombat.attackType = item.equipment.attackType;
            updatedAttackType = true;
        }
    }

    if (!updatedAttackType) {
        userCombat.attackType = 'Melee';
    }

    // Add only Dominant traits
    if (user.equippedSlime) {
        const {
            BodyDominant,
            PatternDominant,
            PrimaryColourDominant,
            AccentDominant,
            DetailDominant,
            EyeColourDominant,
            EyeShapeDominant,
            MouthDominant,
        } = user.equippedSlime;

        const dominantTraits = [
            BodyDominant,
            PatternDominant,
            PrimaryColourDominant,
            AccentDominant,
            DetailDominant,
            EyeColourDominant,
            EyeShapeDominant,
            MouthDominant,
        ];

        for (const trait of dominantTraits) {
            if (trait?.statEffect) statEffects.push(trait.statEffect);
        }
    }

    const delta = calculateNetStatDelta(user, statEffects);
    applyDelta(user, userCombat, delta);

    const cp = calculateCombatPower(userCombat);
    userCombat.cp = cp;

    await prisma.$transaction([
        prisma.user.update({
            where: { telegramId },
            data: {
                doubleResourceOdds: user.doubleResourceOdds,
                skillIntervalReductionMultiplier: user.skillIntervalReductionMultiplier,
            },
        }),
        prisma.combat.update({
            where: { id: userCombat.id },
            data: userCombat,
        }),
    ]);

    logger.info(`Stats updated for user ${telegramId}`);

    logger.info(`combat after recalculate: ${JSON.stringify(userCombat, null, 2)}`);

    return {
        ...user,
        combat: userCombat,
    };

    // === Local Helpers ===

    function calculateNetStatDelta(user: User, effects: StatEffect[]) {
        const base = {
            maxHp: user.maxHp, atkSpd: user.atkSpd, acc: user.acc, eva: user.eva,
            maxMeleeDmg: user.maxMeleeDmg, maxRangedDmg: user.maxRangedDmg, maxMagicDmg: user.maxMagicDmg,
            critChance: user.critChance, critMultiplier: user.critMultiplier,
            dmgReduction: user.dmgReduction, magicDmgReduction: user.magicDmgReduction,
            hpRegenRate: user.hpRegenRate, hpRegenAmount: user.hpRegenAmount,
        };

        const result = {
            maxHp: 0, atkSpd: 0, acc: 0, eva: 0, maxMeleeDmg: 0, maxRangedDmg: 0, maxMagicDmg: 0,
            critChance: 0, critMultiplier: 0, dmgReduction: 0, magicDmgReduction: 0,
            hpRegenRate: 0, hpRegenAmount: 0, meleeFactor: 0, rangeFactor: 0, magicFactor: 0,
            reinforceAir: 0, reinforceWater: 0, reinforceEarth: 0, reinforceFire: 0,
            doubleResourceOdds: 0, skillIntervalReductionMultiplier: 0,
        };

        const additive = {} as Record<keyof typeof base, number>;
        const multiplicative = {} as Record<keyof typeof base, number[]>;

        // Init base keys
        for (const key of Object.keys(base) as (keyof typeof base)[]) {
            additive[key] = 0;
            multiplicative[key] = [];
        }

        const apply = (mod: number | null | undefined, effect: 'add' | 'mul' | null | undefined, key: keyof typeof base) => {
            if (mod == null || effect == null) return;
            if (effect === 'add') additive[key] += mod;
            else multiplicative[key].push(mod); // expects full multiplier value like 0.9 or 1.1
        };

        for (const e of effects) {
            apply(e.maxHpMod, e.maxHpEffect, 'maxHp');
            apply(e.atkSpdMod, e.atkSpdEffect, 'atkSpd');
            apply(e.accMod, e.accEffect, 'acc');
            apply(e.evaMod, e.evaEffect, 'eva');
            apply(e.maxMeleeDmgMod, e.maxMeleeDmgEffect, 'maxMeleeDmg');
            apply(e.maxRangedDmgMod, e.maxRangedDmgEffect, 'maxRangedDmg');
            apply(e.maxMagicDmgMod, e.maxMagicDmgEffect, 'maxMagicDmg');
            apply(e.critChanceMod, e.critChanceEffect, 'critChance');
            apply(e.critMultiplierMod, e.critMultiplierEffect, 'critMultiplier');
            apply(e.dmgReductionMod, e.dmgReductionEffect, 'dmgReduction');
            apply(e.magicDmgReductionMod, e.magicDmgReductionEffect, 'magicDmgReduction');
            apply(e.hpRegenRateMod, e.hpRegenRateEffect, 'hpRegenRate');
            apply(e.hpRegenAmountMod, e.hpRegenAmountEffect, 'hpRegenAmount');

            // Simple additive values
            result.meleeFactor += e.meleeFactor ?? 0;
            result.rangeFactor += e.rangeFactor ?? 0;
            result.magicFactor += e.magicFactor ?? 0;
            result.reinforceAir += e.reinforceAir ?? 0;
            result.reinforceWater += e.reinforceWater ?? 0;
            result.reinforceEarth += e.reinforceEarth ?? 0;
            result.reinforceFire += e.reinforceFire ?? 0;

            result.doubleResourceOdds += e.doubleResourceOddsMod ?? 0;
            result.skillIntervalReductionMultiplier += e.skillIntervalReductionMultiplierMod ?? 0;
        }

        // Apply all stats with additive then multiplicative chaining
        for (const key of Object.keys(base) as (keyof typeof base)[]) {
            const baseVal = base[key];
            const add = additive[key];
            const mulChain = multiplicative[key].reduce((acc, val) => acc * val, 1);
            result[key] = (baseVal + add) * mulChain - baseVal;
        }

        return result;
    }

    function applyDelta(user: User, combat: Combat, delta: ReturnType<typeof calculateNetStatDelta>) {
        user.doubleResourceOdds += delta.doubleResourceOdds;
        user.skillIntervalReductionMultiplier += delta.skillIntervalReductionMultiplier;

        combat.maxHp = Math.round(combat.maxHp + delta.maxHp);
        combat.atkSpd = Math.round(combat.atkSpd + delta.atkSpd);
        combat.acc = Math.round(combat.acc + delta.acc);
        combat.eva = Math.round(combat.eva + delta.eva);
        combat.maxMeleeDmg = Math.round(combat.maxMeleeDmg + delta.maxMeleeDmg);
        combat.maxRangedDmg = Math.round(combat.maxRangedDmg + delta.maxRangedDmg);
        combat.maxMagicDmg = Math.round(combat.maxMagicDmg + delta.maxMagicDmg);
        combat.critChance += delta.critChance;
        const bonusCrit = Math.max(combat.critMultiplier - 1, 0.29);
        combat.critMultiplier = 1 + bonusCrit * (1 + delta.critMultiplier);
        combat.dmgReduction = Math.round(combat.dmgReduction + delta.dmgReduction);
        combat.magicDmgReduction = Math.round(combat.magicDmgReduction + delta.magicDmgReduction);
        combat.hpRegenRate += delta.hpRegenRate;
        combat.hpRegenAmount = Math.round(combat.hpRegenAmount + delta.hpRegenAmount);
        combat.meleeFactor = Math.round(combat.meleeFactor + delta.meleeFactor);
        combat.rangeFactor = Math.round(combat.rangeFactor + delta.rangeFactor);
        combat.magicFactor = Math.round(combat.magicFactor + delta.magicFactor);
        combat.reinforceAir = Math.round(combat.reinforceAir + delta.reinforceAir);
        combat.reinforceWater = Math.round(combat.reinforceWater + delta.reinforceWater);
        combat.reinforceEarth = Math.round(combat.reinforceEarth + delta.reinforceEarth);
        combat.reinforceFire = Math.round(combat.reinforceFire + delta.reinforceFire);
    }
}

export async function recalculateAndUpdateUserBaseStats(
    telegramId: string
): Promise<Partial<FullUserData>> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId }
        });

        if (!user) throw new Error(`User not found for ${telegramId}`);

        const { str, def, dex, luk, magic, hpLevel } = user;

        const newBaseStats = {
            maxHp: getBaseMaxHpFromHpLvl(hpLevel),
            atkSpd: getBaseAtkSpdFromDex(dex),
            acc: getBaseAccFromDex(dex),
            eva: getBaseEvaFromDex(dex),
            maxMeleeDmg: getBaseMaxDmg(str),
            maxRangedDmg: getBaseMaxDmg(dex),
            maxMagicDmg: getBaseMaxDmg(magic),
            critChance: getBaseCritChanceFromLuk(luk),
            critMultiplier: getBaseCritMulFromLuk(luk),
            dmgReduction: getBaseDmgReductionFromDef(def),
            magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(def, magic),
            hpRegenRate: getBaseHpRegenRateFromHpLvl(hpLevel),
            hpRegenAmount: getBaseHpRegenAmtFromHpLvl(hpLevel, str)
        };

        await prisma.user.update({
            where: { telegramId },
            data: newBaseStats
        });

        const userDataEquipped = await recalculateAndUpdateUserStats(telegramId);

        logger.info(`✅ Recalculated base stats for user ${telegramId}`);

        return {
            ...newBaseStats,
            outstandingSkillPoints: user.outstandingSkillPoints,
            hpLevel: user.hpLevel,
            expToNextHpLevel: user.expToNextHpLevel,
            expHp: user.expHp,
            str: user.str,
            def: user.def,
            dex: user.dex,
            luk: user.luk,
            magic: user.magic,
            combat: userDataEquipped.combat
        };
    } catch (err) {
        logger.error(`❌ Failed to recalculate base stats for ${telegramId}: ${err}`);
        throw err;
    }
}

// inventory
export async function getEquipmentOrItemFromInventory(
    telegramId: string,
    inventoryId: number
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }> | undefined> {
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

        return equipmentInventory;
    } catch (err) {
        console.error(`Error fetching equipment or item from user ${telegramId}'s inventory: ${err}`);
        throw err; // Re-throw the error for further handling
    }
}

