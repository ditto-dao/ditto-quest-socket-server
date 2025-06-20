import { prismaDeleteSlimesFromDB, prismaFetchSlimesForUser, prismaInsertSlimesToDB, SlimeWithTraits } from "../../sql-services/slime";
import { FullUserData, prismaSaveUser } from "../../sql-services/user-service";
import { logger } from "../../utils/logger";
import { deleteInventoryFromDB, insertInventoryToDB, prismaFetchUserInventory } from "../../sql-services/equipment-inventory-service";
import { requireSnapshotRedisManager } from "../global-managers/global-managers";

export type UserInventoryItem = FullUserData['inventory'][0];

export type EquipmentWithStatEffect = UserInventoryItem;
export type EquipmentInventory = UserInventoryItem;

/**
 * UserMemoryManager - Manages in-memory user state for O(1) access
 * This is the fastest tier of the 3-tier architecture:
 * 1. Memory (this) - Ultra-fast O(1) access for active users
 * 2. Redis - Fast cache backup (only for login)
 * 3. Database - Source of truth
 */
export class UserMemoryManager {
	private users: Map<string, FullUserData>;
	private dirtyUsers: Set<string>;
	private lastActivity: Map<string, number>;
	private isInitialized: boolean = false;

	pendingCreateSlimes: Map<string, SlimeWithTraits[]> = new Map();
	pendingBurnSlimeIds: Map<string, number[]> = new Map();

	pendingCreateInventory: Map<string, UserInventoryItem[]> = new Map();
	pendingBurnInventoryIds: Map<string, number[]> = new Map();
	inventoryIdRemap: Map<string, Map<number, number>> = new Map();

	constructor() {
		this.users = new Map();
		this.dirtyUsers = new Set();
		this.lastActivity = new Map();
		this.isInitialized = true;
		logger.info("✅ UserMemoryManager initialized");
	}

	/**
	 * Check if manager is ready
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get user from memory - O(1) lookup
	 */
	getUser(userId: string): FullUserData | null {
		const user = this.users.get(userId);
		if (user) {
			this.updateActivity(userId);
			logger.debug(`👤 Retrieved user ${userId} from memory`);
		}
		return user || null;
	}

	/**
	 * Set user in memory
	 */
	setUser(userId: string, userData: FullUserData): void {
		this.users.set(userId, userData);
		this.updateActivity(userId);
		logger.debug(`💾 Stored user ${userId} in memory`);
	}

	/**
	 * Remove user from memory
	 */
	removeUser(userId: string): void {
		this.users.delete(userId);
		this.dirtyUsers.delete(userId);
		this.lastActivity.delete(userId);
		logger.debug(`🗑️ Removed user ${userId} from memory`);
	}

	/**
	 * Check if user exists in memory
	 */
	hasUser(userId: string): boolean {
		return this.users.has(userId);
	}

	/**
	 * Mark user as dirty (needs sync)
	 */
	markDirty(userId: string): void {
		this.dirtyUsers.add(userId);
		logger.debug(`🔄 Marked user ${userId} as dirty in memory`);
	}

	/**
	 * Mark user as clean (synced)
	 */
	markClean(userId: string): void {
		this.dirtyUsers.delete(userId);
		logger.debug(`✅ Marked user ${userId} as clean in memory`);
	}

	/**
	 * Check if user is dirty
	 */
	isDirty(userId: string): boolean {
		return this.dirtyUsers.has(userId);
	}

	/**
	 * Get all dirty users
	 */
	getDirtyUsers(): string[] {
		return Array.from(this.dirtyUsers);
	}

	/**
	 * Get all active users
	 */
	getActiveUsers(): string[] {
		return Array.from(this.users.keys());
	}

	/**
	 * Update user's last activity
	 */
	private updateActivity(userId: string): void {
		this.lastActivity.set(userId, Date.now());
	}

	/**
	 * Get user's last activity
	 */
	getLastActivity(userId: string): number | null {
		return this.lastActivity.get(userId) || null;
	}

	/**
	 * Clean up inactive users from memory
	 */
	cleanupInactiveUsers(maxInactiveMs: number = 3600000): number { // 1 hour default
		const now = Date.now();
		const cutoffTime = now - maxInactiveMs;
		let cleaned = 0;

		for (const [userId, lastActive] of this.lastActivity.entries()) {
			if (lastActive < cutoffTime) {
				// Don't remove if dirty - they need to be synced first
				if (!this.isDirty(userId)) {
					this.removeUser(userId);
					cleaned++;
					logger.debug(`🧹 Cleaned inactive user ${userId} from memory`);
				}
			}
		}

		if (cleaned > 0) {
			logger.info(`🧹 Cleaned ${cleaned} inactive users from memory`);
		}

		return cleaned;
	}

	/**
	 * Clear all users from memory (use with caution!)
	 */
	clear(): void {
		const hadDirty = this.dirtyUsers.size > 0;
		if (hadDirty) {
			logger.warn(`⚠️ Clearing UserMemoryManager with ${this.dirtyUsers.size} dirty users!`);
		}

		this.users.clear();
		this.dirtyUsers.clear();
		this.lastActivity.clear();

		logger.info("🗑️ UserMemoryManager cleared");
	}

	/**
	 * Get all users (for batch operations)
	 */
	getAllUsers(): Map<string, FullUserData> {
		return new Map(this.users);
	}

	/**
	 * Update specific user fields without replacing entire object
	 * Useful for atomic updates like gold, exp, etc.
	 */
	updateUserField<K extends keyof FullUserData>(
		userId: string,
		field: K,
		value: FullUserData[K]
	): boolean {
		const user = this.users.get(userId);
		if (!user) {
			return false;
		}

		user[field] = value;
		this.markDirty(userId);
		this.updateActivity(userId);

		return true;
	}

	/**
	 * Update nested combat fields
	 */
	updateUserCombatField<K extends keyof FullUserData['combat']>(
		userId: string,
		field: K,
		value: FullUserData['combat'][K]
	): boolean {
		const user = this.users.get(userId);
		if (!user || !user.combat) {
			return false;
		}

		user.combat[field] = value;
		this.markDirty(userId);
		this.updateActivity(userId);

		return true;
	}

	/**
	 * Check if user has any pending changes
	 */
	hasPendingChanges(userId: string): boolean {
		return this.pendingCreateSlimes.has(userId) ||
			this.pendingBurnSlimeIds.has(userId) ||
			this.pendingCreateInventory.has(userId) ||
			this.pendingBurnInventoryIds.has(userId);
	}

	/**
	 * Append a slime to user's memory (gacha, breed, etc)
	 */
	appendSlime(userId: string, slime: SlimeWithTraits): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		if (!user.slimes) user.slimes = [];

		user.slimes.push(slime);

		// Queue for DB insert
		if (!this.pendingCreateSlimes.has(userId)) this.pendingCreateSlimes.set(userId, []);
		this.pendingCreateSlimes.get(userId)!.push(slime);

		this.markDirty(userId);
		this.updateActivity(userId);
		logger.debug(`🧪 Appended slime ID ${slime.id} (pending) to user ${userId}`);
		return true;
	}

	/**
	 * Remove a slime from user's memory by ID (e.g. burn)
	 */
	removeSlime(userId: string, slimeId: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.slimes) return false;

		const before = user.slimes.length;
		user.slimes = user.slimes.filter(s => s.id !== slimeId);
		const after = user.slimes.length;

		if (after < before) {
			// Queue for DB deletion
			if (!this.pendingBurnSlimeIds.has(userId)) this.pendingBurnSlimeIds.set(userId, []);
			this.pendingBurnSlimeIds.get(userId)!.push(slimeId);

			this.markDirty(userId);
			this.updateActivity(userId);
			logger.debug(`🔥 Removed slime ID ${slimeId} (pending delete) from user ${userId}`);
			return true;
		}

		return false;
	}

	/**
	 * Replace user's slime list (e.g. after flush to DB and reload)
	 */
	updateSlimes(userId: string, slimes: SlimeWithTraits[]): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		user.slimes = slimes;
		this.updateActivity(userId);
		logger.debug(`🔁 Updated slimes for user ${userId}`);
		return true;
	}

	/**
	 * Add inventory item to user's memory (equipment minting, etc)
	 */
	appendInventory(userId: string, inventoryItem: UserInventoryItem): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		if (!user.inventory) user.inventory = [];

		user.inventory.push(inventoryItem);

		// Queue for DB insert
		if (!this.pendingCreateInventory.has(userId)) this.pendingCreateInventory.set(userId, []);
		this.pendingCreateInventory.get(userId)!.push(inventoryItem);

		this.markDirty(userId);
		this.updateActivity(userId);
		logger.debug(`📦 Appended inventory ID ${inventoryItem.id} (pending) to user ${userId}`);
		return true;
	}

	/**
	 * Update inventory item quantity in memory
	 */
	updateInventoryQuantity(userId: string, inventoryId: number, newQuantity: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return false;

		const inventoryItem = user.inventory.find(inv => inv.id === inventoryId);
		if (!inventoryItem) return false;

		inventoryItem.quantity = newQuantity;
		this.markDirty(userId);
		this.updateActivity(userId);
		logger.debug(`📦 Updated inventory ID ${inventoryId} quantity to ${newQuantity} for user ${userId}`);
		return true;
	}

	/**
	 * Remove inventory item from user's memory by ID
	 */
	removeInventory(userId: string, inventoryId: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return false;

		const before = user.inventory.length;
		user.inventory = user.inventory.filter(inv => inv.id !== inventoryId);
		const after = user.inventory.length;

		if (after < before) {
			// Queue for DB deletion
			if (!this.pendingBurnInventoryIds.has(userId)) this.pendingBurnInventoryIds.set(userId, []);
			this.pendingBurnInventoryIds.get(userId)!.push(inventoryId);

			this.markDirty(userId);
			this.updateActivity(userId);
			logger.debug(`🗑️ Removed inventory ID ${inventoryId} (pending delete) from user ${userId}`);
			return true;
		}

		return false;
	}

	/**
	 * Find inventory items by equipment ID
	 */
	findInventoryByEquipmentId(userId: string, equipmentId: number): UserInventoryItem | null {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return null;

		return user.inventory.find(inv => inv.equipmentId === equipmentId && inv.itemId === null) || null;
	}

	/**
	 * Find inventory items by item ID
	 */
	findInventoryByItemId(userId: string, itemId: number): UserInventoryItem | null {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return null;

		return user.inventory.find(inv => inv.itemId === itemId && inv.equipmentId === null) || null;
	}

	/**
	 * Replace user's inventory list (after flush to DB and reload)
	 */
	updateInventory(userId: string, inventory: UserInventoryItem[]): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		user.inventory = inventory;
		this.updateActivity(userId);
		logger.debug(`🔁 Updated inventory for user ${userId}`);
		return true;
	}

	/**
	 * Batch mark users as clean
	 */
	markUsersClean(userIds: string[]): void {
		for (const userId of userIds) {
			this.dirtyUsers.delete(userId);
		}
		logger.info(`✅ Marked ${userIds.length} users as clean in memory`);
	}

	/**
	 * Flush slimes for a specific user
	 */
	async flushUserSlimes(userId: string): Promise<void> {
		const createSlimes = this.pendingCreateSlimes.get(userId) || [];
		const burnSlimeIds = this.pendingBurnSlimeIds.get(userId) || [];

		if (createSlimes.length === 0 && burnSlimeIds.length === 0) return;

		try {
			// Insert slimes with their real IDs
			if (createSlimes.length > 0) {
				await prismaInsertSlimesToDB(userId, createSlimes);
				logger.debug(`💾 Inserted ${createSlimes.length} slimes for ${userId}`);
			}

			// Delete slimes (using real IDs, no remapping needed)
			if (burnSlimeIds.length > 0) {
				await prismaDeleteSlimesFromDB(userId, burnSlimeIds);
				logger.debug(`🗑️ Deleted ${burnSlimeIds.length} slimes for ${userId}`);
			}

			// Reload fresh slimes from DB
			const finalSlimes = await prismaFetchSlimesForUser(userId);
			this.updateSlimes(userId, finalSlimes);

			// Clear pending operations
			this.pendingCreateSlimes.delete(userId);
			this.pendingBurnSlimeIds.delete(userId);

			// Mark clean if no other pending changes
			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

		} catch (err) {
			logger.error(`❌ Slime flush failed for user ${userId}: ${err}`);
			throw err;
		}
	}

	/**
		* Enhanced flush method with better error handling and validation
		*/
	async flushUserInventory(userId: string): Promise<void> {
		const createInventory = this.pendingCreateInventory.get(userId) || [];
		const burnInventoryIds = this.pendingBurnInventoryIds.get(userId) || [];

		if (createInventory.length === 0 && burnInventoryIds.length === 0) {
			logger.debug(`📦 No pending inventory changes for user ${userId}`);
			return;
		}

		logger.info(`📦 Flushing inventory for user ${userId}: ${createInventory.length} creates, ${burnInventoryIds.length} deletes`);

		try {
			// Insert new inventory items
			if (createInventory.length > 0) {
				await insertInventoryToDB(userId, createInventory);
				logger.debug(`💾 Inserted ${createInventory.length} inventory items for ${userId}`);
			}

			// Get fresh inventory from DB for ID remapping
			const freshInventory = await prismaFetchUserInventory(userId);
			const remap = new Map<number, number>();

			// Map temporary IDs to real IDs
			for (const inventoryItem of freshInventory) {
				const matchingFake = createInventory.find(f =>
					((f.equipmentId === inventoryItem.equipmentId && f.equipmentId !== null) ||
						(f.itemId === inventoryItem.itemId && f.itemId !== null)) &&
					f.id < 0
				);
				if (matchingFake) {
					remap.set(matchingFake.id, inventoryItem.id);
					logger.debug(`🔗 Remapped temp ID ${matchingFake.id} to real ID ${inventoryItem.id}`);
				}
			}

			// Delete inventory items (using remapped IDs)
			const realBurnIds = burnInventoryIds.map(fakeId => remap.get(fakeId) || fakeId);
			if (realBurnIds.length > 0) {
				await deleteInventoryFromDB(userId, realBurnIds);
				logger.debug(`🗑️ Deleted ${realBurnIds.length} inventory items for ${userId}`);
			}

			// Update memory with fresh data
			const finalInventory = await prismaFetchUserInventory(userId);
			this.updateInventory(userId, finalInventory);

			// Store ID remapping for future reference
			if (remap.size > 0) {
				this.inventoryIdRemap.set(userId, remap);
			}

			// Clear pending operations
			this.pendingCreateInventory.delete(userId);
			this.pendingBurnInventoryIds.delete(userId);

			// Mark clean if no other pending changes
			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

			logger.info(`✅ Successfully flushed inventory for user ${userId}`);

		} catch (err) {
			logger.error(`❌ Inventory flush failed for user ${userId}: ${err}`);

			// CRITICAL: Don't clear pending operations if flush failed
			// This ensures we can retry the flush later
			throw err;
		}
	}

	/**
	 * Flush ALL data for a specific user
	 */
	async flushAllUserUpdates(userId: string): Promise<boolean> {
		try {
			await this.flushUserSlimes(userId);
			await this.flushUserInventory(userId);

			const user = this.getUser(userId);
			if (user) {
				await prismaSaveUser(user);

				const snapshotRedisManager = requireSnapshotRedisManager();
				await snapshotRedisManager.markSnapshotStale(userId, 'stale_immediate', 95);
			}

			return true;
		} catch (error) {
			logger.error(`❌ Failed to flush all updates for user ${userId}: ${error}`);
			return false;
		}
	}

	/**
	 * Batch flush - processes all dirty users
	 */
	async flushSlimeUpdates(): Promise<void> {
		const usersWithSlimeChanges = this.getDirtyUsers().filter(userId =>
			this.pendingCreateSlimes.has(userId) || this.pendingBurnSlimeIds.has(userId)
		);

		for (const userId of usersWithSlimeChanges) {
			try {
				await this.flushUserSlimes(userId);
			} catch (err) {
				logger.error(`❌ Failed to flush slimes for user ${userId}: ${err}`);
			}
		}
	}

	async flushInventoryUpdates(): Promise<void> {
		const usersWithInventoryChanges = this.getDirtyUsers().filter(userId =>
			this.pendingCreateInventory.has(userId) || this.pendingBurnInventoryIds.has(userId)
		);

		for (const userId of usersWithInventoryChanges) {
			try {
				await this.flushUserInventory(userId);
			} catch (err) {
				logger.error(`❌ Failed to flush inventory for user ${userId}: ${err}`);
			}
		}
	}

	/**
	 * Flush all dirty users (for scheduled background sync)
	 */
	async flushAllDirtyUsers(): Promise<void> {
		const dirtyUserIds = this.getDirtyUsers();
		logger.info(`🔄 Flushing ${dirtyUserIds.length} dirty users`);

		for (const userId of dirtyUserIds) {
			await this.flushAllUserUpdates(userId);
		}
	}
	/**
	 * Handle user logout - flush everything and optionally remove from memory
	 * FIXED VERSION - ensures inventory is properly persisted before cleanup
	 */
	async logoutUser(userId: string, removeFromMemory: boolean = false): Promise<boolean> {
		try {
			logger.info(`👋 User ${userId} logging out`);

			// CRITICAL: Check if user has pending inventory changes BEFORE flushing
			const hasPendingInventory = this.pendingCreateInventory.has(userId) || this.pendingBurnInventoryIds.has(userId);

			if (hasPendingInventory) {
				logger.info(`📦 User ${userId} has pending inventory changes - forcing flush before logout`);
			}

			// Flush all pending changes with explicit error handling
			try {
				await this.flushAllUserUpdates(userId);

				// VERIFY the flush actually completed for inventory
				if (hasPendingInventory) {
					const stillHasPending = this.pendingCreateInventory.has(userId) || this.pendingBurnInventoryIds.has(userId);
					if (stillHasPending) {
						throw new Error(`Inventory flush incomplete - still has pending operations`);
					}
					logger.info(`✅ Verified inventory flush completed for user ${userId}`);
				}
			} catch (flushError) {
				logger.error(`❌ CRITICAL: Failed to flush user data during logout for ${userId}: ${flushError}`);

				// Don't remove from memory if flush failed - keep dirty state
				if (removeFromMemory) {
					logger.warn(`⚠️ Keeping user ${userId} in memory due to flush failure`);
					return false;
				}
				throw flushError;
			}

			// Clean up pending operation tracking ONLY after successful flush
			this.pendingCreateSlimes.delete(userId);
			this.pendingBurnSlimeIds.delete(userId);
			this.pendingCreateInventory.delete(userId);
			this.pendingBurnInventoryIds.delete(userId);
			this.inventoryIdRemap.delete(userId);

			if (removeFromMemory) {
				// Final safety check before removing from memory
				if (this.isDirty(userId)) {
					logger.warn(`⚠️ User ${userId} still marked as dirty after flush - keeping in memory`);
					return false;
				}

				this.removeUser(userId);
				logger.info(`🗑️ Removed user ${userId} from memory after logout`);
			} else {
				this.markClean(userId);
			}

			return true;
		} catch (error) {
			logger.error(`❌ Failed to handle logout for user ${userId}: ${error}`);
			return false;
		}
	}
}