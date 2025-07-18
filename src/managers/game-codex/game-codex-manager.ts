import { Item, SlimeTrait, CraftingRecipe, StatEffect, ShopItem, Prisma } from "@prisma/client";
import { logger } from "../../utils/logger";
import { prisma } from "../../sql-services/client";
import { FullMonster, DomainWithMonsters, DungeonWithMonsters } from "../../sql-services/combat-service";

// Define the full crafting recipe type with nested items
export type FullCraftingRecipe = CraftingRecipe & {
    equipment: {
        name: string;
    };
    CraftingRecipeItems: {
        id: number;
        recipeId: number;
        itemId: number;
        quantity: number;
        item: {
            name: string;
            imgsrc: string;
        };
    }[];
};

/**
 * Game Codex Manager - In-Memory Cache for All Static Game Data
 * 
 * This manager loads all static game data into memory Maps on server startup
 * for O(1) lookup performance, eliminating database queries during gameplay.
 */
export class GameCodexManager {
    // Static game data maps for O(1) lookup
    private static items: Map<number, Item & { statEffect: StatEffect | null }> = new Map();
    private static equipment: Map<number, Prisma.EquipmentGetPayload<{
        include: { statEffect: true, CraftingRecipe: true }
    }>> = new Map();
    private static monsters: Map<number, FullMonster> = new Map();
    private static domains: Map<number, DomainWithMonsters> = new Map();
    private static dungeons: Map<number, DungeonWithMonsters> = new Map();
    private static slimeTraits: Map<number, SlimeTrait & { statEffect: StatEffect | null }> = new Map();
    // Updated to store the full crafting recipe with nested items
    private static craftingRecipes: Map<number, FullCraftingRecipe> = new Map();
    // Shop items for O(1) access
    private static shopItems: Map<number, ShopItem> = new Map();

    // Initialization status
    private static isInitialized = false;

    /**
     * Initialize all game codex data - MUST be called on server startup
     */
    static async initialize(): Promise<void> {
        if (this.isInitialized) {
            logger.warn('GameCodexManager already initialized, skipping...');
            return;
        }

        logger.info('🚀 Starting Game Codex initialization...');
        const startTime = Date.now();

        try {
            // Load all static data in parallel for faster startup
            await Promise.all([
                this.loadItems(),
                this.loadEquipment(),
                this.loadMonsters(),
                this.loadDomains(),
                this.loadDungeons(),
                this.loadSlimeTraits(),
                this.loadCraftingRecipes(),
                this.loadShopItems()
            ]);

            this.isInitialized = true;
            const loadTime = Date.now() - startTime;

            logger.info(`✅ Game Codex initialized successfully in ${loadTime}ms`);
            this.logMemoryUsage();

        } catch (error) {
            logger.error(`❌ Failed to initialize Game Codex: ${error}`);
            throw new Error(`Game Codex initialization failed: ${error}`);
        }
    }

    /**
     * Load all items with stat effects
     */
    private static async loadItems(): Promise<void> {
        const items = await prisma.item.findMany({
            include: {
                statEffect: true
            }
        });

        for (const item of items) {
            this.items.set(item.id, item);
        }

        logger.info(`📦 Loaded ${items.length} items into memory`);
    }

    /**
     * Load all equipment with stat effects and crafting recipes
     */
    private static async loadEquipment(): Promise<void> {
        const equipment = await prisma.equipment.findMany({
            include: {
                statEffect: true,
                CraftingRecipe: true
            }
        });

        for (const eq of equipment) {
            // Store the equipment as-is with the array structure that Prisma returns
            this.equipment.set(eq.id, eq);
        }

        logger.info(`⚔️ Loaded ${equipment.length} equipment into memory`);
    }

    /**
     * Load all monsters with full combat data and drops
     */
    private static async loadMonsters(): Promise<void> {
        const monsters = await prisma.monster.findMany({
            include: {
                combat: true,
                statEffects: true,
                drops: {
                    include: {
                        item: true,
                        equipment: true
                    }
                }
            }
        });

        for (const monster of monsters) {
            this.monsters.set(monster.id, monster as FullMonster);
        }

        logger.info(`👹 Loaded ${monsters.length} monsters into memory`);
    }

    /**
     * Load all domains with nested monster data
     */
    private static async loadDomains(): Promise<void> {
        const domains = await prisma.domain.findMany({
            include: {
                monsters: {
                    include: {
                        monster: {
                            include: {
                                combat: true,
                                statEffects: true,
                                drops: {
                                    include: {
                                        item: true,
                                        equipment: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        for (const domain of domains) {
            this.domains.set(domain.id, domain as DomainWithMonsters);
        }

        logger.info(`🏰 Loaded ${domains.length} domains into memory`);
    }

    /**
     * Load all dungeons with nested monster sequence data
     */
    private static async loadDungeons(): Promise<void> {
        const dungeons = await prisma.dungeon.findMany({
            include: {
                monsterSequence: {
                    include: {
                        monster: {
                            include: {
                                combat: true,
                                statEffects: true,
                                drops: {
                                    include: {
                                        item: true,
                                        equipment: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        for (const dungeon of dungeons) {
            this.dungeons.set(dungeon.id, dungeon as DungeonWithMonsters);
        }

        logger.info(`🏛️ Loaded ${dungeons.length} dungeons into memory`);
    }

    /**
     * Load all slime traits with stat effects
     */
    private static async loadSlimeTraits(): Promise<void> {
        const slimeTraits = await prisma.slimeTrait.findMany({
            include: {
                statEffect: true
            }
        });

        for (const trait of slimeTraits) {
            this.slimeTraits.set(trait.id, trait);
        }

        logger.info(`🦄 Loaded ${slimeTraits.length} slime traits into memory`);
    }

    /**
     * Load all crafting recipes with full nested data
     */
    private static async loadCraftingRecipes(): Promise<void> {
        const recipes = await prisma.craftingRecipe.findMany({
            include: {
                equipment: {
                    select: { name: true }
                },
                CraftingRecipeItems: {
                    include: {
                        item: {
                            select: { name: true, imgsrc: true }
                        }
                    }
                }
            }
        });

        for (const recipe of recipes) {
            this.craftingRecipes.set(recipe.equipmentId, recipe);
        }

        logger.info(`🔨 Loaded ${recipes.length} crafting recipes into memory`);
    }

    /**
     * Load all active shop items
     */
    private static async loadShopItems(): Promise<void> {
        const shopItems = await prisma.shopItem.findMany({
            where: { isActive: true }
        });

        for (const shopItem of shopItems) {
            this.shopItems.set(shopItem.id, shopItem);
        }

        logger.info(`🏪 Loaded ${shopItems.length} shop items into memory`);
    }

    /**
     * Log current memory usage
     */
    private static logMemoryUsage(): void {
        const itemsSize = this.items.size;
        const equipmentSize = this.equipment.size;
        const monstersSize = this.monsters.size;
        const domainsSize = this.domains.size;
        const dungeonsSize = this.dungeons.size;
        const slimeTraitsSize = this.slimeTraits.size;
        const recipesSize = this.craftingRecipes.size;
        const shopItemsSize = this.shopItems.size;

        logger.info(`📊 Game Codex Memory Usage:`);
        logger.info(`   Items: ${itemsSize} entries`);
        logger.info(`   Equipment: ${equipmentSize} entries`);
        logger.info(`   Monsters: ${monstersSize} entries`);
        logger.info(`   Domains: ${domainsSize} entries`);
        logger.info(`   Dungeons: ${dungeonsSize} entries`);
        logger.info(`   Slime Traits: ${slimeTraitsSize} entries`);
        logger.info(`   Crafting Recipes: ${recipesSize} entries`);
        logger.info(`   Shop Items: ${shopItemsSize} entries`);
    }

    // ========== PUBLIC GETTERS (O(1) lookups) ==========

    /**
     * Get item by ID from memory cache
     */
    static getItem(itemId: number): (Item & { statEffect: StatEffect | null }) | null {
        this.ensureInitialized();
        return this.items.get(itemId) || null;
    }

    /**
     * Get all items from memory cache
     */
    static getAllItems(): (Item & { statEffect: StatEffect | null })[] {
        this.ensureInitialized();
        return Array.from(this.items.values());
    }

    /**
     * Get equipment by ID from memory cache
     */
    static getEquipment(equipmentId: number): Prisma.EquipmentGetPayload<{
        include: { statEffect: true, CraftingRecipe: true }
    }> | null {
        this.ensureInitialized();
        return this.equipment.get(equipmentId) || null;
    }

    /**
     * Get all equipment from memory cache
     */
    static getAllEquipment(): Prisma.EquipmentGetPayload<{
        include: { statEffect: true, CraftingRecipe: true }
    }>[] {
        this.ensureInitialized();
        return Array.from(this.equipment.values());
    }

    /**
     * Get monster by ID from memory cache
     */
    static getMonster(monsterId: number): FullMonster | null {
        this.ensureInitialized();
        return this.monsters.get(monsterId) || null;
    }

    /**
     * Get all monsters from memory cache
     */
    static getAllMonsters(): FullMonster[] {
        this.ensureInitialized();
        return Array.from(this.monsters.values());
    }

    /**
     * Get domain by ID from memory cache
     */
    static getDomain(domainId: number): DomainWithMonsters | null {
        this.ensureInitialized();
        return this.domains.get(domainId) || null;
    }

    /**
     * Get all domains from memory cache
     */
    static getAllDomains(): DomainWithMonsters[] {
        this.ensureInitialized();
        return Array.from(this.domains.values());
    }

    /**
     * Get dungeon by ID from memory cache
     */
    static getDungeon(dungeonId: number): DungeonWithMonsters | null {
        this.ensureInitialized();
        return this.dungeons.get(dungeonId) || null;
    }

    /**
     * Get all dungeons from memory cache
     */
    static getAllDungeons(): DungeonWithMonsters[] {
        this.ensureInitialized();
        return Array.from(this.dungeons.values());
    }

    /**
     * Get slime trait by ID from memory cache
     */
    static getSlimeTrait(traitId: number): (SlimeTrait & { statEffect: StatEffect | null }) | null {
        this.ensureInitialized();
        return this.slimeTraits.get(traitId) || null;
    }

    /**
     * Get all slime traits from memory cache
     */
    static getAllSlimeTraits(): (SlimeTrait & { statEffect: StatEffect | null })[] {
        this.ensureInitialized();
        return Array.from(this.slimeTraits.values());
    }

    /**
     * Get crafting recipe by equipment ID from memory cache
     * Now returns the full recipe with nested CraftingRecipeItems
     */
    static getCraftingRecipe(equipmentId: number): FullCraftingRecipe | null {
        this.ensureInitialized();
        return this.craftingRecipes.get(equipmentId) || null;
    }

    /**
     * Get all crafting recipes from memory cache
     * Now returns the full recipes with nested CraftingRecipeItems
     */
    static getAllCraftingRecipes(): FullCraftingRecipe[] {
        this.ensureInitialized();
        return Array.from(this.craftingRecipes.values());
    }

    /**
     * Get shop item by ID from memory cache
     */
    static getShopItem(shopItemId: number): ShopItem | null {
        this.ensureInitialized();
        return this.shopItems.get(shopItemId) || null;
    }

    /**
     * Get all shop items from memory cache
     */
    static getAllShopItems(): ShopItem[] {
        this.ensureInitialized();
        return Array.from(this.shopItems.values());
    }

    /**
     * Get shop items by type from memory cache
     */
    static getShopItemsByType(type: string): ShopItem[] {
        this.ensureInitialized();
        return Array.from(this.shopItems.values()).filter(item => item.type === type);
    }

    // ========== UTILITY METHODS ==========

    /**
     * Check if Game Codex is initialized
     */
    static isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Force reload all data (for development/testing)
     */
    static async reload(): Promise<void> {
        logger.info('🔄 Reloading Game Codex...');
        this.isInitialized = false;
        this.clearAllMaps();
        await this.initialize();
    }

    /**
     * Clear all memory maps
     */
    private static clearAllMaps(): void {
        this.items.clear();
        this.equipment.clear();
        this.monsters.clear();
        this.domains.clear();
        this.dungeons.clear();
        this.slimeTraits.clear();
        this.craftingRecipes.clear();
        this.shopItems.clear();
    }

    /**
     * Ensure Game Codex is initialized before any operations
     */
    private static ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('GameCodexManager not initialized. Call GameCodexManager.initialize() first.');
        }
    }

    /**
     * Get memory statistics for monitoring
     */
    static getStats(): {
        initialized: boolean;
        counts: {
            items: number;
            equipment: number;
            monsters: number;
            domains: number;
            dungeons: number;
            slimeTraits: number;
            craftingRecipes: number;
            shopItems: number;
        };
    } {
        return {
            initialized: this.isInitialized,
            counts: {
                items: this.items.size,
                equipment: this.equipment.size,
                monsters: this.monsters.size,
                domains: this.domains.size,
                dungeons: this.dungeons.size,
                slimeTraits: this.slimeTraits.size,
                craftingRecipes: this.craftingRecipes.size,
                shopItems: this.shopItems.size
            }
        };
    }
}