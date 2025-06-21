import { logger } from '../utils/logger';
import { calculateExpForNextLevel } from '../utils/helpers';
import { prisma } from './client';
import { Combat, EquipmentType, Prisma, StatEffect, User } from '@prisma/client';
import { MAX_INITIAL_INVENTORY_SLOTS, MAX_INITIAL_SLIME_INVENTORY_SLOTS } from '../utils/config';
import { getBaseMaxHpFromHpLvl, getBaseMaxDmg, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseMagicDmgReductionFromDefAndMagic, getBaseAtkSpdFromLuk, getBaseDmgReductionFromDefAndStr, getBaseHpRegenRateFromHpLvlAndDef, getBaseHpRegenAmtFromHpLvlAndDef, getBaseAccFromLuk, getBaseEvaFromDex, calculateCombatPower } from '../managers/idle-managers/combat/combat-helpers';
import { applyDelta, calculateNetStatDelta } from '../operations/user-operations';

// Interface for user input
interface CreateUserInput {
    telegramId: string;
    username?: string;
}

export type FullUserData = Prisma.UserGetPayload<{
    include: {
        combat: true;
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
                owner: {
                    select: { telegramId: true }
                },
                BodyDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                BodyHidden1: { include: { statEffect: true } };
                BodyHidden2: { include: { statEffect: true } };
                BodyHidden3: { include: { statEffect: true } };
                PatternDominant:
                {
                    include: {
                        statEffect: true;
                    }
                };
                PatternHidden1: { include: { statEffect: true } };
                PatternHidden2: { include: { statEffect: true } };
                PatternHidden3: { include: { statEffect: true } };
                PrimaryColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PrimaryColourHidden1: { include: { statEffect: true } };
                PrimaryColourHidden2: { include: { statEffect: true } };
                PrimaryColourHidden3: { include: { statEffect: true } };
                AccentDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                AccentHidden1: { include: { statEffect: true } };
                AccentHidden2: { include: { statEffect: true } };
                AccentHidden3: { include: { statEffect: true } };
                DetailDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                DetailHidden1: { include: { statEffect: true } };
                DetailHidden2: { include: { statEffect: true } };
                DetailHidden3: { include: { statEffect: true } };
                EyeColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeColourHidden1: { include: { statEffect: true } };
                EyeColourHidden2: { include: { statEffect: true } };
                EyeColourHidden3: { include: { statEffect: true } };
                EyeShapeDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeShapeHidden1: { include: { statEffect: true } };
                EyeShapeHidden2: { include: { statEffect: true } };
                EyeShapeHidden3: { include: { statEffect: true } };
                MouthDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                MouthHidden1: { include: { statEffect: true } };
                MouthHidden2: { include: { statEffect: true } };
                MouthHidden3: { include: { statEffect: true } };
            };
        };
        slimes: {
            include: {
                owner: {
                    select: { telegramId: true }
                },
                BodyDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                BodyHidden1: { include: { statEffect: true } };
                BodyHidden2: { include: { statEffect: true } };
                BodyHidden3: { include: { statEffect: true } };
                PatternDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PatternHidden1: { include: { statEffect: true } };
                PatternHidden2: { include: { statEffect: true } };
                PatternHidden3: { include: { statEffect: true } };
                PrimaryColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                PrimaryColourHidden1: { include: { statEffect: true } };
                PrimaryColourHidden2: { include: { statEffect: true } };
                PrimaryColourHidden3: { include: { statEffect: true } };
                AccentDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                AccentHidden1: { include: { statEffect: true } };
                AccentHidden2: { include: { statEffect: true } };
                AccentHidden3: { include: { statEffect: true } };
                DetailDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                DetailHidden1: { include: { statEffect: true } };
                DetailHidden2: { include: { statEffect: true } };
                DetailHidden3: { include: { statEffect: true } };
                EyeColourDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeColourHidden1: { include: { statEffect: true } };
                EyeColourHidden2: { include: { statEffect: true } };
                EyeColourHidden3: { include: { statEffect: true } };
                EyeShapeDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                EyeShapeHidden1: { include: { statEffect: true } };
                EyeShapeHidden2: { include: { statEffect: true } };
                EyeShapeHidden3: { include: { statEffect: true } };
                MouthDominant: {
                    include: {
                        statEffect: true;
                    }
                };
                MouthHidden1: { include: { statEffect: true } };
                MouthHidden2: { include: { statEffect: true } };
                MouthHidden3: { include: { statEffect: true } };
            };
        };
    };
}>;

// Function to create a user
export async function prismaCreateUser(input: CreateUserInput): Promise<FullUserData> {
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
                        owner: {
                            select: { telegramId: true }
                        },
                        BodyDominant: { include: { statEffect: true } },
                        BodyHidden1: { include: { statEffect: true } },
                        BodyHidden2: { include: { statEffect: true } },
                        BodyHidden3: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PatternHidden1: { include: { statEffect: true } },
                        PatternHidden2: { include: { statEffect: true } },
                        PatternHidden3: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        PrimaryColourHidden1: { include: { statEffect: true } },
                        PrimaryColourHidden2: { include: { statEffect: true } },
                        PrimaryColourHidden3: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        AccentHidden1: { include: { statEffect: true } },
                        AccentHidden2: { include: { statEffect: true } },
                        AccentHidden3: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        DetailHidden1: { include: { statEffect: true } },
                        DetailHidden2: { include: { statEffect: true } },
                        DetailHidden3: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeColourHidden1: { include: { statEffect: true } },
                        EyeColourHidden2: { include: { statEffect: true } },
                        EyeColourHidden3: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        EyeShapeHidden1: { include: { statEffect: true } },
                        EyeShapeHidden2: { include: { statEffect: true } },
                        EyeShapeHidden3: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },
                        MouthHidden1: { include: { statEffect: true } },
                        MouthHidden2: { include: { statEffect: true } },
                        MouthHidden3: { include: { statEffect: true } },
                    },
                },
                slimes: {
                    include: {
                        owner: {
                            select: { telegramId: true }
                        },
                        BodyDominant: { include: { statEffect: true } },
                        BodyHidden1: { include: { statEffect: true } },
                        BodyHidden2: { include: { statEffect: true } },
                        BodyHidden3: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PatternHidden1: { include: { statEffect: true } },
                        PatternHidden2: { include: { statEffect: true } },
                        PatternHidden3: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        PrimaryColourHidden1: { include: { statEffect: true } },
                        PrimaryColourHidden2: { include: { statEffect: true } },
                        PrimaryColourHidden3: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        AccentHidden1: { include: { statEffect: true } },
                        AccentHidden2: { include: { statEffect: true } },
                        AccentHidden3: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        DetailHidden1: { include: { statEffect: true } },
                        DetailHidden2: { include: { statEffect: true } },
                        DetailHidden3: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeColourHidden1: { include: { statEffect: true } },
                        EyeColourHidden2: { include: { statEffect: true } },
                        EyeColourHidden3: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        EyeShapeHidden1: { include: { statEffect: true } },
                        EyeShapeHidden2: { include: { statEffect: true } },
                        EyeShapeHidden3: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },
                        MouthHidden1: { include: { statEffect: true } },
                        MouthHidden2: { include: { statEffect: true } },
                        MouthHidden3: { include: { statEffect: true } },
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
export async function prismaUserExists(telegramId: string): Promise<boolean> {
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

export async function prismaFetchUserData(telegramId: string): Promise<FullUserData | null> {
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
                        owner: {
                            select: { telegramId: true }
                        },
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },

                        // Hidden traits: keep them without statEffects
                        BodyHidden1: { include: { statEffect: true } },
                        BodyHidden2: { include: { statEffect: true } },
                        BodyHidden3: { include: { statEffect: true } },
                        PatternHidden1: { include: { statEffect: true } },
                        PatternHidden2: { include: { statEffect: true } },
                        PatternHidden3: { include: { statEffect: true } },
                        PrimaryColourHidden1: { include: { statEffect: true } },
                        PrimaryColourHidden2: { include: { statEffect: true } },
                        PrimaryColourHidden3: { include: { statEffect: true } },
                        AccentHidden1: { include: { statEffect: true } },
                        AccentHidden2: { include: { statEffect: true } },
                        AccentHidden3: { include: { statEffect: true } },
                        DetailHidden1: { include: { statEffect: true } },
                        DetailHidden2: { include: { statEffect: true } },
                        DetailHidden3: { include: { statEffect: true } },
                        EyeColourHidden1: { include: { statEffect: true } },
                        EyeColourHidden2: { include: { statEffect: true } },
                        EyeColourHidden3: { include: { statEffect: true } },
                        EyeShapeHidden1: { include: { statEffect: true } },
                        EyeShapeHidden2: { include: { statEffect: true } },
                        EyeShapeHidden3: { include: { statEffect: true } },
                        MouthHidden1: { include: { statEffect: true } },
                        MouthHidden2: { include: { statEffect: true } },
                        MouthHidden3: { include: { statEffect: true } }
                    }
                },
                slimes: {
                    include: {
                        owner: {
                            select: { telegramId: true }
                        },
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },

                        // Hidden traits excluded from statEffect
                        BodyHidden1: { include: { statEffect: true } },
                        BodyHidden2: { include: { statEffect: true } },
                        BodyHidden3: { include: { statEffect: true } },
                        PatternHidden1: { include: { statEffect: true } },
                        PatternHidden2: { include: { statEffect: true } },
                        PatternHidden3: { include: { statEffect: true } },
                        PrimaryColourHidden1: { include: { statEffect: true } },
                        PrimaryColourHidden2: { include: { statEffect: true } },
                        PrimaryColourHidden3: { include: { statEffect: true } },
                        AccentHidden1: { include: { statEffect: true } },
                        AccentHidden2: { include: { statEffect: true } },
                        AccentHidden3: { include: { statEffect: true } },
                        DetailHidden1: { include: { statEffect: true } },
                        DetailHidden2: { include: { statEffect: true } },
                        DetailHidden3: { include: { statEffect: true } },
                        EyeColourHidden1: { include: { statEffect: true } },
                        EyeColourHidden2: { include: { statEffect: true } },
                        EyeColourHidden3: { include: { statEffect: true } },
                        EyeShapeHidden1: { include: { statEffect: true } },
                        EyeShapeHidden2: { include: { statEffect: true } },
                        EyeShapeHidden3: { include: { statEffect: true } },
                        MouthHidden1: { include: { statEffect: true } },
                        MouthHidden2: { include: { statEffect: true } },
                        MouthHidden3: { include: { statEffect: true } }
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

export async function prismaFetchSimpleUserData(
    telegramId: string
): Promise<Prisma.UserGetPayload<{ include: { combat: true } }> | null> {
    return await prisma.user.findUnique({
        where: { telegramId },
        include: {
            combat: true,
        },
    });
}

export async function prismaFetchBaseUserData(
    telegramId: string
): Promise<User | null> {
    return await prisma.user.findUnique({
        where: { telegramId }
    });
}

export async function prismaUpdateUserPartial(
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

export async function prismaFetchUserEquippedData(
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

export async function prismaFetchNextInventoryOrder(telegramId: string): Promise<number> {
    const maxOrder = await prisma.inventory.aggregate({
        where: { userId: telegramId },
        _max: { order: true },
    });
    return (maxOrder._max.order ?? -1) + 1; // Start from 0 if no records exist
}

// Function to update a user's gold balance (prevents negative values)
export async function prismaIncrementUserGoldBalance(telegramId: string, increment: number): Promise<number> {
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

export async function prismaFetchEquippedByEquipmentType(
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
export async function prismaEquipEquipmentForUser(
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

        if (equipmentInventory.equipment.requiredLvlCombat > updatedUser.level) throw new Error(`User does not meet level requirements`);

        logger.info(
            `User ${telegramId} equipped ${equipmentInventory.equipment.name} of type ${equipmentType}.`
        );

        const result = await prismaRecalculateAndUpdateUserStats(telegramId);

        return result;

    } catch (error) {
        logger.error(
            `Failed to equip equipment ${JSON.stringify(equipmentInventory, null, 2)} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

// Function to unequip equipment by type for the user
export async function prismaUnequipEquipmentForUser(
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

        const result = await prismaRecalculateAndUpdateUserStats(telegramId);

        return result;
    } catch (error) {
        logger.error(
            `Failed to unequip equipment of type ${equipmentType} for user ${telegramId}: ${error}`
        );
        throw error;
    }
}

/* USER SPECIFIC FARMING FUNCTIONS */

export async function prismaFetchUserFarmingLevel(telegramId: string): Promise<{
    farmingLevel: number;
    farmingExp: number;
    expToNextFarmingLevel: number;
}> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                farmingLevel: true,
                farmingExp: true,
                expToNextFarmingLevel: true
            }
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        return {
            farmingLevel: user.farmingLevel,
            farmingExp: user.farmingExp,
            expToNextFarmingLevel: user.expToNextFarmingLevel
        };
    } catch (error) {
        logger.error(`❌ Failed to fetch farming level for user ${telegramId}:`, error);
        throw error;
    }
}

export async function prismaAddFarmingExp(userId: string, expToAdd: number) {
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
export async function prismaFetchUserCraftingLevel(telegramId: string): Promise<{
    craftingLevel: number;
    craftingExp: number;
    expToNextCraftingLevel: number;
}> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                craftingLevel: true,
                craftingExp: true,
                expToNextCraftingLevel: true
            }
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        return {
            craftingLevel: user.craftingLevel,
            craftingExp: user.craftingExp,
            expToNextCraftingLevel: user.expToNextCraftingLevel
        };
    } catch (error) {
        logger.error(`❌ Failed to fetch crafting level for user ${telegramId}:`, error);
        throw error;
    }
}

export async function prismaAddCraftingExp(userId: string, expToAdd: number) {
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

export async function prismaRecalculateAndUpdateUserStats(
    telegramId: string
): Promise<UserDataEquipped> {
    const user = await prismaFetchUserEquippedData(telegramId);

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
}


// Type for the specific return object you want
export type UserStatsWithCombat = {
    // Base stats (from newBaseStats)
    maxHp: number;
    atkSpd: number;
    acc: number;
    eva: number;
    maxMeleeDmg: number;
    maxRangedDmg: number;
    maxMagicDmg: number;
    critChance: number;
    critMultiplier: number;
    dmgReduction: number;
    magicDmgReduction: number;
    hpRegenRate: number;
    hpRegenAmount: number;

    // User fields
    outstandingSkillPoints: number;
    hpLevel: number;
    expToNextHpLevel: number;
    expHp: number;
    str: number;
    def: number;
    dex: number;
    luk: number;
    magic: number;

    doubleResourceOdds: number;
    skillIntervalReductionMultiplier: number;

    // Combat relation
    combat: Prisma.CombatGetPayload<{}> | null;
};

export async function prismaRecalculateAndUpdateUserBaseStats(
    telegramId: string
): Promise<UserStatsWithCombat> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId }
        });

        if (!user) throw new Error(`User not found for ${telegramId}`);

        const { str, def, dex, luk, magic, hpLevel } = user;

        const newBaseStats = {
            maxHp: getBaseMaxHpFromHpLvl(hpLevel),
            atkSpd: getBaseAtkSpdFromLuk(luk),
            acc: getBaseAccFromLuk(luk),
            eva: getBaseEvaFromDex(dex),
            maxMeleeDmg: getBaseMaxDmg(str),
            maxRangedDmg: getBaseMaxDmg(dex),
            maxMagicDmg: getBaseMaxDmg(magic),
            critChance: getBaseCritChanceFromLuk(luk),
            critMultiplier: getBaseCritMulFromLuk(luk),
            dmgReduction: getBaseDmgReductionFromDefAndStr(def, str),
            magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(def, magic),
            hpRegenRate: getBaseHpRegenRateFromHpLvlAndDef(hpLevel, def),
            hpRegenAmount: getBaseHpRegenAmtFromHpLvlAndDef(hpLevel, def),
            doubleResourceOdds: user.doubleResourceOdds,
            skillIntervalReductionMultiplier: user.skillIntervalReductionMultiplier,
        };

        await prisma.user.update({
            where: { telegramId },
            data: newBaseStats
        });

        const userDataEquipped = await prismaRecalculateAndUpdateUserStats(telegramId);

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
export async function fetchEquipmentOrItemFromInventory(
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

export async function prismaFetchUserInventorySlotInfo(telegramId: string): Promise<{
    usedSlots: number;
    maxSlots: number;
}> {
    const user = await prisma.user.findUnique({
        where: { telegramId },
        select: {
            maxInventorySlots: true,
        },
    });

    if (!user) {
        throw new Error(`User ${telegramId} not found`);
    }

    const usedSlots = await prisma.inventory.count({
        where: { userId: telegramId },
    });

    logger.info(JSON.stringify({
        usedSlots,
        maxSlots: user.maxInventorySlots,
        fallbackUsed: user.maxInventorySlots ?? MAX_INITIAL_INVENTORY_SLOTS
    }, null, 2));

    return {
        usedSlots,
        maxSlots: user.maxInventorySlots ?? MAX_INITIAL_INVENTORY_SLOTS // fallback default if ever unset
    };
}

export async function prismaFetchUserSlimeInventoryInfo(telegramId: string): Promise<{
    usedSlots: number;
    maxSlots: number;
}> {
    const user = await prisma.user.findUnique({
        where: { telegramId },
        select: {
            maxSlimeInventorySlots: true,
        },
    });

    if (!user) {
        throw new Error(`User ${telegramId} not found`);
    }

    const usedSlots = await prisma.slime.count({
        where: { ownerId: telegramId },
    });

    return {
        usedSlots,
        maxSlots: user.maxSlimeInventorySlots ?? MAX_INITIAL_SLIME_INVENTORY_SLOTS,
    };
}

export async function prismaCanUserMintSlime(telegramId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { maxSlimeInventorySlots: true },
    });

    if (!user) {
        throw new Error(`User ${telegramId} not found`);
    }

    const usedSlots = await prisma.slime.count({
        where: { ownerId: telegramId },
    });

    const maxSlots = user.maxSlimeInventorySlots ?? MAX_INITIAL_SLIME_INVENTORY_SLOTS;

    return usedSlots < maxSlots;
}

export async function prismaFetchUserLevel(telegramId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { level: true },
    });

    if (!user) {
        throw new Error(`User with telegramId ${telegramId} not found`);
    }

    return user.level;
}

export async function prismaBatchSaveUsers(users: FullUserData[]): Promise<{
    successful: string[],
    failed: string[]
}> {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const userData of users) {
        try {
            const updateData: Prisma.UserUpdateInput = {
                // Core fields
                level: userData.level,
                exp: userData.exp,
                expToNextLevel: userData.expToNextLevel,
                outstandingSkillPoints: userData.outstandingSkillPoints,
                hpLevel: userData.hpLevel,
                expHp: userData.expHp,
                expToNextHpLevel: userData.expToNextHpLevel,
                str: userData.str,
                def: userData.def,
                dex: userData.dex,
                luk: userData.luk,
                magic: userData.magic,
                maxHp: userData.maxHp,
                atkSpd: userData.atkSpd,
                acc: userData.acc,
                eva: userData.eva,
                maxMeleeDmg: userData.maxMeleeDmg,
                maxRangedDmg: userData.maxRangedDmg,
                maxMagicDmg: userData.maxMagicDmg,
                critChance: userData.critChance,
                critMultiplier: userData.critMultiplier,
                dmgReduction: userData.dmgReduction,
                magicDmgReduction: userData.magicDmgReduction,
                hpRegenRate: userData.hpRegenRate,
                hpRegenAmount: userData.hpRegenAmount,
                goldBalance: userData.goldBalance,
                farmingLevel: userData.farmingLevel,
                farmingExp: userData.farmingExp,
                expToNextFarmingLevel: userData.expToNextFarmingLevel,
                craftingLevel: userData.craftingLevel,
                craftingExp: userData.craftingExp,
                expToNextCraftingLevel: userData.expToNextCraftingLevel,
                maxInventorySlots: userData.maxInventorySlots,
                maxSlimeInventorySlots: userData.maxSlimeInventorySlots,
                doubleResourceOdds: userData.doubleResourceOdds,
                skillIntervalReductionMultiplier: userData.skillIntervalReductionMultiplier,
            };

            // ✅ CORRECT: Handle equipped slime as a relation
            if (userData.equippedSlimeId !== undefined) {
                updateData.equippedSlime = userData.equippedSlimeId === null
                    ? { disconnect: true }  // Unequip slime
                    : { connect: { id: userData.equippedSlimeId } };  // Equip slime
            }

            // Handle combat update
            if (userData.combat) {
                updateData.combat = {
                    update: {
                        hp: userData.combat.hp,
                        maxHp: userData.combat.maxHp,
                        atkSpd: userData.combat.atkSpd,
                        acc: userData.combat.acc,
                        eva: userData.combat.eva,
                        maxMeleeDmg: userData.combat.maxMeleeDmg,
                        maxRangedDmg: userData.combat.maxRangedDmg,
                        maxMagicDmg: userData.combat.maxMagicDmg,
                        critChance: userData.combat.critChance,
                        critMultiplier: userData.combat.critMultiplier,
                        dmgReduction: userData.combat.dmgReduction,
                        magicDmgReduction: userData.combat.magicDmgReduction,
                        hpRegenRate: userData.combat.hpRegenRate,
                        hpRegenAmount: userData.combat.hpRegenAmount,
                        attackType: userData.combat.attackType,
                        meleeFactor: userData.combat.meleeFactor,
                        rangeFactor: userData.combat.rangeFactor,
                        magicFactor: userData.combat.magicFactor,
                        reinforceAir: userData.combat.reinforceAir,
                        reinforceWater: userData.combat.reinforceWater,
                        reinforceEarth: userData.combat.reinforceEarth,
                        reinforceFire: userData.combat.reinforceFire,
                        cp: userData.combat.cp,
                    }
                };
            }

            // Handle equipment relations
            const equipFields = [
                ["hatInventoryId", "hat"],
                ["armourInventoryId", "armour"],
                ["weaponInventoryId", "weapon"],
                ["shieldInventoryId", "shield"],
                ["capeInventoryId", "cape"],
                ["necklaceInventoryId", "necklace"],
            ] as const;

            for (const [idField, relationField] of equipFields) {
                const equipId = userData[idField];
                if (equipId !== undefined) {
                    (updateData as any)[relationField] = equipId === null
                        ? { disconnect: true }
                        : { connect: { id: equipId } };
                }
            }

            await prisma.user.update({
                where: { telegramId: userData.telegramId },
                data: updateData
            });

            successful.push(userData.telegramId);
            logger.debug(`✅ Saved user ${userData.telegramId} to database (equipped slime: ${userData.equippedSlimeId})`);
        } catch (error) {
            logger.error(`❌ Failed to save user ${userData.telegramId} to database:`, error);
            failed.push(userData.telegramId);
        }
    }

    logger.info(`💾 Batch save complete: ${successful.length} successful, ${failed.length} failed`);

    return { successful, failed };
}

/**
 * Force save a single user to database
 */
export async function prismaSaveUser(userData: FullUserData): Promise<boolean> {
    try {
        const result = await prismaBatchSaveUsers([userData]);
        return result.successful.length === 1;
    } catch (error) {
        logger.error(`Failed to save user ${userData.telegramId}:`, error);
        return false;
    }
}