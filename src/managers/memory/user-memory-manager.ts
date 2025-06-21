import { prismaDeleteInventoryFromDB, prismaFetchUserInventory, prismaInsertInventoryToDB, prismaUpdateInventoryQuantitiesInDB } from "../../sql-services/equipment-inventory-service";
import { prismaDeleteSlimesFromDB, prismaFetchSlimesForUser, prismaInsertSlimesToDB, SlimeWithTraits } from "../../sql-services/slime";
import { FullUserData, prismaSaveUser } from "../../sql-services/user-service";
import { logger } from "../../utils/logger";
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
	pendingInventoryUpdates = new Map<string, Set<number>>(); // userId -> Set<inventoryId>
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
			this.pendingBurnInventoryIds.has(userId) ||
			this.pendingInventoryUpdates.has(userId);
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
	 * Update inventory item quantity in memory AND track for DB persistence
	 */
	updateInventoryQuantity(userId: string, inventoryId: number, newQuantity: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.inventory) {
			logger.error(`❌ User ${userId} not found or has no inventory for quantity update`);
			return false;
		}

		const inventoryItem = user.inventory.find(inv => inv.id === inventoryId);
		if (!inventoryItem) {
			logger.error(`❌ Inventory item with ID ${inventoryId} not found for user ${userId}`);
			logger.debug(`Available inventory IDs: ${user.inventory.map(inv => inv.id).join(', ')}`);
			return false;
		}

		const oldQuantity = inventoryItem.quantity;
		inventoryItem.quantity = newQuantity;

		// 🔥 NEW: Track this quantity update for DB persistence
		if (!this.pendingInventoryUpdates.has(userId)) {
			this.pendingInventoryUpdates.set(userId, new Set());
		}
		this.pendingInventoryUpdates.get(userId)!.add(inventoryId);

		this.markDirty(userId);
		this.updateActivity(userId);

		logger.info(`📦 Updated inventory ID ${inventoryId} quantity for user ${userId}: ${oldQuantity} -> ${newQuantity} (equipmentId: ${inventoryItem.equipmentId}, itemId: ${inventoryItem.itemId}) [TRACKED FOR DB UPDATE]`);
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
	 * Prefers real DB items over temporary items when multiple exist
	 */
	findInventoryByEquipmentId(userId: string, equipmentId: number): UserInventoryItem | null {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return null;

		// Find all matching equipment items
		const matchingItems = user.inventory.filter(inv => inv.equipmentId === equipmentId && inv.itemId === null);

		if (matchingItems.length === 0) return null;
		if (matchingItems.length === 1) return matchingItems[0];

		// If multiple items exist, prefer real DB items (positive IDs) over temp items (negative IDs)
		const realItems = matchingItems.filter(item => item.id > 0);
		if (realItems.length > 0) {
			// Return the real item with highest quantity (most likely to be the stacked one)
			return realItems.reduce((max, current) => current.quantity > max.quantity ? current : max);
		}

		// If only temp items exist, return the one with highest quantity
		return matchingItems.reduce((max, current) => current.quantity > max.quantity ? current : max);
	}

	/**
	* Find inventory items by item ID
	* Prefers real DB items over temporary items when multiple exist
	*/
	findInventoryByItemId(userId: string, itemId: number): UserInventoryItem | null {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return null;

		// Find all matching item items
		const matchingItems = user.inventory.filter(inv => inv.itemId === itemId && inv.equipmentId === null);

		if (matchingItems.length === 0) return null;
		if (matchingItems.length === 1) return matchingItems[0];

		// If multiple items exist, prefer real DB items (positive IDs) over temp items (negative IDs)
		const realItems = matchingItems.filter(item => item.id > 0);
		if (realItems.length > 0) {
			// Return the real item with highest quantity (most likely to be the stacked one)
			return realItems.reduce((max, current) => current.quantity > max.quantity ? current : max);
		}

		// If only temp items exist, return the one with highest quantity
		return matchingItems.reduce((max, current) => current.quantity > max.quantity ? current : max);
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

	async flushUserInventory(userId: string): Promise<void> {
		const createInventory = this.pendingCreateInventory.get(userId) || [];
		const burnInventoryIds = this.pendingBurnInventoryIds.get(userId) || [];
		const updateInventoryIds = this.pendingInventoryUpdates.get(userId) || new Set();

		if (createInventory.length === 0 && burnInventoryIds.length === 0 && updateInventoryIds.size === 0) {
			logger.debug(`📦 No pending inventory changes for user ${userId}`);
			return;
		}

		logger.info(`📦 Flushing inventory for user ${userId}: ${createInventory.length} creates, ${burnInventoryIds.length} deletes, ${updateInventoryIds.size} updates`);

		try {
			// 1. Insert new inventory items first
			if (createInventory.length > 0) {
				await prismaInsertInventoryToDB(userId, createInventory);
				logger.debug(`💾 Inserted ${createInventory.length} inventory items for ${userId}`);
			}

			// 2. Get fresh inventory from DB for accurate ID mapping
			const freshInventory = await prismaFetchUserInventory(userId);
			const remap = new Map<number, number>();

			// 3. Handle creates - map temp IDs to real IDs
			if (createInventory.length > 0) {
				for (const createdItem of createInventory) {
					if (createdItem.id < 0) { // temp ID
						const realItem = freshInventory.find(inv =>
							inv.equipmentId === createdItem.equipmentId &&
							inv.itemId === createdItem.itemId &&
							inv.quantity === createdItem.quantity
						);
						if (realItem) {
							remap.set(createdItem.id, realItem.id);
							logger.debug(`🔗 Mapped temp ID ${createdItem.id} -> real ID ${realItem.id}`);
						}
					}
				}
			}

			// 4. Update existing inventory item quantities (using real IDs)
			if (updateInventoryIds.size > 0) {
				const user = this.users.get(userId);
				if (user && user.inventory) {
					// Filter items that need quantity updates and map temp IDs to real IDs
					const itemsToUpdate = user.inventory
						.filter(inv => updateInventoryIds.has(inv.id))
						.map(inv => {
							// If this is a temp ID, get the real ID from mapping
							if (inv.id < 0 && remap.has(inv.id)) {
								return { ...inv, id: remap.get(inv.id)! };
							}
							return inv;
						})
						.filter(inv => inv.id > 0); // Only update items with real IDs

					if (itemsToUpdate.length > 0) {
						await prismaUpdateInventoryQuantitiesInDB(userId, itemsToUpdate);
						logger.debug(`🔄 Updated ${itemsToUpdate.length} inventory quantities for ${userId}`);
					}
				}
			}

			// 5. Delete inventory items using remapped IDs
			const realBurnIds = burnInventoryIds.map(fakeId => {
				if (fakeId < 0) {
					const realId = remap.get(fakeId);
					if (!realId) {
						logger.warn(`⚠️ Could not remap temp ID ${fakeId} for deletion - skipping`);
						return null;
					}
					return realId;
				}
				return fakeId; // Already a real ID
			}).filter(id => id !== null) as number[];

			if (realBurnIds.length > 0) {
				await prismaDeleteInventoryFromDB(userId, realBurnIds);
				logger.debug(`🗑️ Deleted ${realBurnIds.length} inventory items for ${userId}`);
			}

			// 6. Update memory with fresh inventory data from DB
			const user = this.users.get(userId);
			if (user) {
				user.inventory = freshInventory;

				if (remap.size > 0) {
					this.inventoryIdRemap.set(userId, remap);
					logger.info(`📦 Updated memory inventory for user ${userId} with ${freshInventory.length} items and ${remap.size} ID remappings`);
				} else {
					logger.debug(`📦 Updated memory inventory for user ${userId} with ${freshInventory.length} items (no remapping needed)`);
				}
			} else {
				logger.warn(`⚠️ User ${userId} not found in memory during inventory flush - cannot update memory`);
			}

			// Store ID remapping for future reference
			if (remap.size > 0) {
				this.inventoryIdRemap.set(userId, remap);
			}

			// Clear pending operations
			this.pendingCreateInventory.delete(userId);
			this.pendingBurnInventoryIds.delete(userId);
			this.pendingInventoryUpdates.delete(userId);

			// Mark clean if no other pending changes
			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

			logger.info(`✅ Successfully flushed inventory for user ${userId} with ${remap.size} ID remappings`);

		} catch (err) {
			logger.error(`❌ Inventory flush failed for user ${userId}: ${err}`);
			throw err;
		}
	}

	/**
	 * Flush ALL data for a specific user
	 */
	async flushAllUserUpdates(userId: string): Promise<boolean> {
		try {
			logger.info(`🔍 DEBUG: Before flush - dirty: ${this.isDirty(userId)}, pending: ${this.hasPendingChanges(userId)}`);

			const user = this.getUser(userId);
			if (!user) {
				throw new Error(`User ${userId} not found in memory for flush`);
			}

			// Start transaction-like flush
			await Promise.all([
				this.flushUserSlimes(userId),
				this.flushUserInventory(userId)
			]);

			logger.info(`🔍 DEBUG: After inventory/slimes flush - dirty: ${this.isDirty(userId)}, pending: ${this.hasPendingChanges(userId)}`);

			// Save user core data
			await prismaSaveUser(user);

			await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay to ensure DB commit

			this.markClean(userId);

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
	 * Ensures inventory is properly persisted before cleanup
	 */
	async logoutUser(userId: string, removeFromMemory: boolean = false): Promise<boolean> {
		try {
			logger.info(`👋 User ${userId} logging out`);

			// CRITICAL: Check if user has pending inventory changes BEFORE flushing
			const hasPendingInventory = this.pendingCreateInventory.has(userId) ||
				this.pendingBurnInventoryIds.has(userId) ||
				this.pendingInventoryUpdates.has(userId);

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

				await new Promise(resolve => setTimeout(resolve, 150)); // Extra delay for memory updates

				const snapshotRedisManager = requireSnapshotRedisManager();

				// Get current memory data and verify it's been updated
				const currentMemoryUser = this.getUser(userId);
				if (currentMemoryUser) {
					const inventoryCount = currentMemoryUser.inventory?.length || 0;
					const equipmentCount = currentMemoryUser.inventory?.filter(inv => inv.equipmentId === 1).reduce((sum, item) => sum + item.quantity, 0) || 0;
					logger.info(`📊 Pre-snapshot verification: User ${userId} has ${inventoryCount} inventory items, ${equipmentCount} Rustfang swords`);

					// Store snapshot using current memory data (most updated)
					await snapshotRedisManager.storeSnapshot(userId, currentMemoryUser);
					logger.info(`📸 ✅ Immediately regenerated fresh snapshot for user ${userId} after logout (from MEMORY)`);
				} else {
					logger.error(`❌ User not found in memory for snapshot regeneration after flush`);

					const { getUserData } = await import('../../operations/user-operations');
					const freshDbUser = await getUserData(userId);
					if (freshDbUser) {
						this.setUser(userId, freshDbUser);
						await snapshotRedisManager.storeSnapshot(userId, freshDbUser);
						logger.info(`📸 ✅ Regenerated snapshot from DB fallback for user ${userId}`);
					}
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

			// Clean up pending operation tracking ONLY after successful flush AND snapshot
			this.pendingCreateSlimes.delete(userId);
			this.pendingBurnSlimeIds.delete(userId);
			this.pendingCreateInventory.delete(userId);
			this.pendingBurnInventoryIds.delete(userId);
			this.pendingInventoryUpdates.delete(userId);
			this.inventoryIdRemap.delete(userId);

			if (removeFromMemory) {
				// Final safety check before removing from memory
				if (this.isDirty(userId)) {
					logger.warn(`⚠️ User ${userId} still marked as dirty after flush - keeping in memory`);
					return false;
				}

				// ✅ NOW it's safe to remove from memory - snapshot already generated
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