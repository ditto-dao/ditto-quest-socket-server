import { logger } from '../utils/logger';
import { prisma } from './client';
import { Combat, EquipmentType, Prisma, StatEffect, User } from '@prisma/client';
import { getBaseMaxHpFromHpLvl, getBaseMaxDmg, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseMagicDmgReductionFromDefAndMagic, getBaseAtkSpdFromLuk, getBaseDmgReductionFromDefAndStr, getBaseHpRegenRateFromHpLvlAndDef, getBaseHpRegenAmtFromHpLvlAndDef, getBaseAccFromLuk, getBaseEvaFromDex, calculateCombatPower } from '../managers/idle-managers/combat/combat-helpers';
import { applyDelta, calculateNetStatDelta } from '../operations/user-operations';
import { UserStatsWithCombat } from '../operations/combat-operations';
import { MAX_INITIAL_INVENTORY_SLOTS } from '../utils/config';

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

export async function prismaFetchNextInventoryOrder(telegramId: string): Promise<number> {
    const maxOrder = await prisma.inventory.aggregate({
        where: { userId: telegramId },
        _max: { order: true },
    });
    return (maxOrder._max.order ?? -1) + 1; // Start from 0 if no records exist
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

/**
 * Update username for a user in the database
 * @param telegramId - The user's telegram ID
 * @param newUsername - The new username to set
 * @returns Promise<boolean> - true if update was successful, false otherwise
 */
export async function prismaUpdateUsername(telegramId: string, newUsername: string | null): Promise<boolean> {
    try {
        const result = await prisma.user.update({
            where: { telegramId },
            data: { username: newUsername },
            select: { telegramId: true, username: true }
        });

        logger.info(`✅ Updated username for user ${telegramId}: "${result.username}"`);
        return true;
    } catch (error) {
        logger.error(`❌ Failed to update username for user ${telegramId}: ${error}`);
        return false;
    }
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
            logger.error(`❌ Failed to save user ${userData.telegramId} to database: ${error}`);
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
        logger.error(`Failed to save user ${userData.telegramId}: ${error}`);
        return false;
    }
}