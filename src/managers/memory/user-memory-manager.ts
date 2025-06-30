import AsyncLock from "async-lock";
import { prismaDeleteInventoryFromDB, prismaFetchUserInventory, prismaInsertInventoryToDB, prismaUpdateInventoryQuantitiesInDB } from "../../sql-services/equipment-inventory-service";
import { prismaDeleteSlimesFromDB, prismaFetchSlimesForUser, prismaInsertSlimesToDB, SlimeWithTraits } from "../../sql-services/slime";
import { FullUserData, prismaSaveUser } from "../../sql-services/user-service";
import { logger } from "../../utils/logger";
import { requireSnapshotRedisManager } from "../global-managers/global-managers";
import { MAX_INITIAL_SLIME_INVENTORY_SLOTS } from "../../utils/config";
import { LEDGER_REMOVE_USER_SOCKET_EVENT } from "../../socket/events";
import { SocketManager } from "../../socket/socket-manager";
import { IdleManager } from "../idle-managers/idle-manager";
import { ActivityLogMemoryManager } from "./activity-log-memory-manager";
import { Socket as DittoLedgerSocket } from "socket.io-client";

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
	pendingInventoryDeletes: Map<string, number[]> = new Map();
	inventoryIdRemap: Map<string, Map<number, number>> = new Map();

	private userOperationLocks: Map<string, AsyncLock> = new Map();

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
	 * Get or create a lock for a specific user
	 */
	private getUserLock(userId: string): AsyncLock {
		if (!this.userOperationLocks.has(userId)) {
			this.userOperationLocks.set(userId, new AsyncLock());
		}
		return this.userOperationLocks.get(userId)!;
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
		this.userOperationLocks.delete(userId);
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
	 * Auto-logout inactive users with proper cleanup
	 */
	async autoLogoutInactiveUsers(
		maxInactiveMs: number = 1800000, // 30 minutes default
		socketManager?: SocketManager,
		dittoLedgerSocket?: DittoLedgerSocket,
		idleManager?: IdleManager,
		activityLogMemoryManager?: ActivityLogMemoryManager
	): Promise<number> {
		const now = Date.now();
		const cutoffTime = now - maxInactiveMs;
		let loggedOut = 0;

		logger.info(`🔍 Checking for inactive users (cutoff: ${new Date(cutoffTime).toISOString()})`);

		for (const [userId, lastActive] of this.lastActivity.entries()) {
			if (lastActive < cutoffTime) {
				try {
					// DOUBLE-CHECK: User might have become active during iteration
					const currentActivity = this.lastActivity.get(userId);
					if (!currentActivity || currentActivity >= cutoffTime) {
						logger.info(`⏰ User ${userId} became active during auto-logout check - skipping`);
						continue;
					}

					logger.info(`⏰ Auto-logging out inactive user ${userId}`);
					// STEP 1: Save idle activities first
					if (idleManager) {
						await idleManager.saveAllIdleActivitiesOnLogout(userId);
					}

					// STEP 2: Flush activity logs
					if (activityLogMemoryManager && activityLogMemoryManager.hasUser(userId)) {
						await activityLogMemoryManager.flushUser(userId);
						logger.debug(`✅ Flushed activity logs for auto-logout user ${userId}`);
					}

					// STEP 3: Full logout (flush + snapshot + memory removal)
					const logoutSuccess = await this.logoutUser(userId, true);

					if (!logoutSuccess) {
						logger.warn(`⚠️ Auto-logout partially failed for user ${userId} - keeping in memory`);
						continue; // Skip socket cleanup if logout failed
					}

					// FINAL CHECK: Don't clear socket cache if user reconnected
					const finalActivity = this.lastActivity.get(userId);
					if (finalActivity && finalActivity < cutoffTime) {
						if (socketManager) {
							socketManager.removeSocketIdCacheForUser(userId);
						}
						if (dittoLedgerSocket) {
							dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());
						}
					} else {
						logger.info(`⚠️ User ${userId} reconnected during auto-logout - keeping socket cache`);
					}

					loggedOut++;
					logger.info(`✅ Auto-logged out inactive user ${userId}`);

				} catch (error) {
					logger.error(`❌ Failed to auto-logout user ${userId}: ${error}`);

					// Emergency cleanup - at least try to remove from socket cache
					if (socketManager) {
						socketManager.removeSocketIdCacheForUser(userId);
					}
				}
			}
		}

		if (loggedOut > 0) {
			logger.info(`🧹 Auto-logged out ${loggedOut} inactive users`);
		} else {
			logger.debug(`✅ No inactive users found for auto-logout`);
		}

		return loggedOut;
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
	 * NOW WITH PROPER LOCKING to prevent race conditions
	 */
	async updateUserField<K extends keyof FullUserData>(
		userId: string,
		field: K,
		value: FullUserData[K] | null
	): Promise<boolean> {
		const userLock = this.getUserLock(userId);

		return await userLock.acquire('user_field_update', async () => {
			const user = this.users.get(userId);
			if (!user) {
				return false;
			}

			user[field] = value as FullUserData[K];

			this.markDirty(userId);
			this.updateActivity(userId);

			return true;
		});
	}

	/**
	 * Update nested combat fields
	 * NOW WITH PROPER LOCKING to prevent race conditions
	 */
	async updateUserCombatField<K extends keyof FullUserData['combat']>(
		userId: string,
		field: K,
		value: FullUserData['combat'][K]
	): Promise<boolean> {
		const userLock = this.getUserLock(userId);

		return await userLock.acquire('user_field_update', async () => {
			const user = this.users.get(userId);
			if (!user || !user.combat) {
				return false;
			}

			user.combat[field] = value;
			this.markDirty(userId);
			this.updateActivity(userId);

			return true;
		});
	}

	/**
	 * Check if user has any pending changes
	 */
	hasPendingChanges(userId: string): boolean {
		return this.pendingCreateSlimes.has(userId) ||
			this.pendingBurnSlimeIds.has(userId) ||
			this.pendingCreateInventory.has(userId) ||
			this.pendingInventoryUpdates.has(userId) ||
			this.pendingInventoryDeletes.has(userId);
	}

	/**
	 * Protected slime operations with validation
	 */
	appendSlime(userId: string, slime: SlimeWithTraits): boolean {
		const user = this.users.get(userId);
		if (!user) {
			logger.error(`❌ Cannot append slime: User ${userId} not found in memory`);
			return false;
		}

		if (!user.slimes) user.slimes = [];

		// Validation: Check for duplicate IDs
		const existingSlime = user.slimes.find(s => s.id === slime.id);
		if (existingSlime) {
			logger.error(`❌ SLIME CORRUPTION: Attempting to add duplicate slime ID ${slime.id} for user ${userId}`);
			logger.error(`   Existing slime: ${existingSlime.id}, New slime: ${slime.id}`);
			throw new Error(`Duplicate slime ID ${slime.id} detected`);
		}

		const beforeCount = user.slimes.length;
		user.slimes.push(slime);
		const afterCount = user.slimes.length;

		// Validation: Ensure the slime was actually added
		if (afterCount !== beforeCount + 1) {
			logger.error(`❌ SLIME CORRUPTION: Slime count mismatch after append for user ${userId}`);
			logger.error(`   Expected: ${beforeCount + 1}, Actual: ${afterCount}`);
			throw new Error(`Slime array corruption detected during append`);
		}

		// Queue for DB insert
		if (!this.pendingCreateSlimes.has(userId)) this.pendingCreateSlimes.set(userId, []);
		this.pendingCreateSlimes.get(userId)!.push(slime);

		this.markDirty(userId);
		this.updateActivity(userId);

		logger.info(`✅ Successfully appended slime ID ${slime.id} to user ${userId} (${afterCount}/${user.maxSlimeInventorySlots ?? MAX_INITIAL_SLIME_INVENTORY_SLOTS} slots)`);
		return true;
	}

	/**
	 * Protected slime removal with validation
	 */
	removeSlime(userId: string, slimeId: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.slimes) {
			logger.error(`❌ Cannot remove slime: User ${userId} not found or has no slimes`);
			return false;
		}

		const beforeCount = user.slimes.length;
		const slimeToRemove = user.slimes.find(s => s.id === slimeId);

		if (!slimeToRemove) {
			logger.error(`❌ SLIME CORRUPTION: Attempting to remove non-existent slime ID ${slimeId} for user ${userId}`);
			logger.error(`   Available slime IDs: ${user.slimes.map(s => s.id).join(', ')}`);
			return false;
		}

		user.slimes = user.slimes.filter(s => s.id !== slimeId);
		const afterCount = user.slimes.length;

		// Validation: Ensure exactly one slime was removed
		if (afterCount !== beforeCount - 1) {
			logger.error(`❌ SLIME CORRUPTION: Unexpected count change during removal for user ${userId}`);
			logger.error(`   Expected: ${beforeCount - 1}, Actual: ${afterCount}`);
			throw new Error(`Slime array corruption detected during removal`);
		}

		// Queue for DB deletion
		if (!this.pendingBurnSlimeIds.has(userId)) this.pendingBurnSlimeIds.set(userId, []);
		this.pendingBurnSlimeIds.get(userId)!.push(slimeId);

		this.markDirty(userId);
		this.updateActivity(userId);

		logger.info(`✅ Successfully removed slime ID ${slimeId} from user ${userId} (${afterCount}/${user.maxSlimeInventorySlots ?? MAX_INITIAL_SLIME_INVENTORY_SLOTS} slots)`);
		return true;
	}

	/**
	 * Validate slime array integrity
	 */
	validateSlimeIntegrity(userId: string): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		if (!user.slimes) {
			logger.warn(`⚠️ User ${userId} has null/undefined slimes array`);
			return false;
		}

		// Check for duplicate IDs
		const slimeIds = user.slimes.map(s => s.id);
		const uniqueIds = new Set(slimeIds);

		if (slimeIds.length !== uniqueIds.size) {
			logger.error(`❌ SLIME CORRUPTION: Duplicate slime IDs detected for user ${userId}`);
			logger.error(`   Total slimes: ${slimeIds.length}, Unique IDs: ${uniqueIds.size}`);
			logger.error(`   IDs: ${slimeIds.join(', ')}`);
			return false;
		}

		// Check for null/undefined slimes
		const invalidSlimes = user.slimes.filter(s => !s || !s.id);
		if (invalidSlimes.length > 0) {
			logger.error(`❌ SLIME CORRUPTION: Invalid slime objects detected for user ${userId}`);
			logger.error(`   Invalid count: ${invalidSlimes.length}`);
			return false;
		}

		return true;
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
	 * Checks for existing items of same type and consolidates
	 */
	appendInventory(userId: string, inventoryItem: UserInventoryItem): boolean {
		const user = this.users.get(userId);
		if (!user) return false;

		if (!user.inventory) user.inventory = [];

		// SAFER CONSOLIDATION: Only consolidate with REAL IDs, avoid temp ID conflicts
		let existingItem: UserInventoryItem | null = null;

		if (inventoryItem.equipmentId) {
			existingItem = user.inventory.find(inv =>
				inv.id > 0 && // ONLY REAL IDs for consolidation
				inv.equipmentId === inventoryItem.equipmentId &&
				inv.itemId === null &&
				inv.quantity > 0
			) || null;
		} else if (inventoryItem.itemId) {
			existingItem = user.inventory.find(inv =>
				inv.id > 0 && // ONLY REAL IDs for consolidation
				inv.itemId === inventoryItem.itemId &&
				inv.equipmentId === null &&
				inv.quantity > 0
			) || null;
		}

		if (existingItem) {
			// CONSOLIDATE with existing REAL item
			const oldQuantity = existingItem.quantity;
			const newQuantity = oldQuantity + inventoryItem.quantity;
			existingItem.quantity = newQuantity;

			// Track for database update
			if (!this.pendingInventoryUpdates.has(userId)) {
				this.pendingInventoryUpdates.set(userId, new Set());
			}
			this.pendingInventoryUpdates.get(userId)!.add(existingItem.id);

			this.markDirty(userId);
			this.updateActivity(userId);

			logger.info(`📦 Consolidated with real ID ${existingItem.id}: ${oldQuantity} + ${inventoryItem.quantity} = ${newQuantity} for user ${userId}`);
			return true;
		} else {
			// CREATE NEW entry (no existing item to consolidate with)
			user.inventory.push(inventoryItem);

			if (!this.pendingCreateInventory.has(userId)) {
				this.pendingCreateInventory.set(userId, []);
			}
			this.pendingCreateInventory.get(userId)!.push(inventoryItem);

			this.markDirty(userId);
			this.updateActivity(userId);

			logger.info(`📦 Created new inventory entry with ID ${inventoryItem.id} for user ${userId}`);
			return true;
		}
	}

	/**
	 * Smart removal that handles temp vs real IDs
	 */
	removeInventory(userId: string, inventoryId: number): boolean {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return false;

		const itemIndex = user.inventory.findIndex(inv => inv.id === inventoryId);
		if (itemIndex === -1) {
			logger.error(`❌ Inventory item ${inventoryId} not found for user ${userId}`);
			return false;
		}

		user.inventory.splice(itemIndex, 1);

		if (inventoryId < 0) {
			// TEMP ID: Remove from pending creates, don't queue for delete
			const pendingCreates = this.pendingCreateInventory.get(userId) || [];
			const createIndex = pendingCreates.findIndex(item => item.id === inventoryId);
			if (createIndex !== -1) {
				pendingCreates.splice(createIndex, 1);
				logger.info(`🗑️ Cancelled pending create for temp ID ${inventoryId} for user ${userId}`);

				// Clean up if no more pending creates
				if (pendingCreates.length === 0) {
					this.pendingCreateInventory.delete(userId);
				}
			}

			// Also remove from pending updates if it exists
			const pendingUpdates = this.pendingInventoryUpdates.get(userId);
			if (pendingUpdates && pendingUpdates.has(inventoryId)) {
				pendingUpdates.delete(inventoryId);
				logger.info(`🗑️ Cancelled pending update for temp ID ${inventoryId} for user ${userId}`);

				// Clean up if no more pending updates
				if (pendingUpdates.size === 0) {
					this.pendingInventoryUpdates.delete(userId);
				}
			}
		} else {
			// REAL ID: Queue for database deletion
			if (!this.pendingInventoryDeletes.has(userId)) {
				this.pendingInventoryDeletes.set(userId, []);
			}
			this.pendingInventoryDeletes.get(userId)!.push(inventoryId);
			logger.info(`🗑️ Queued real ID ${inventoryId} for deletion for user ${userId}`);

			// CRITICAL: Remove from pending updates if it exists
			const pendingUpdates = this.pendingInventoryUpdates.get(userId);
			if (pendingUpdates && pendingUpdates.has(inventoryId)) {
				pendingUpdates.delete(inventoryId);
				logger.info(`🗑️ Cancelled conflicting update for deleted ID ${inventoryId} for user ${userId}`);
			}
		}

		this.markDirty(userId);
		this.updateActivity(userId);

		logger.info(`🗑️ Removed inventory ID ${inventoryId} from user ${userId} memory`);
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

		if (newQuantity <= 0) {
			// ✅ REMOVE completely (handles temp vs real ID properly)
			return this.removeInventory(userId, inventoryId);
		} else {
			// ✅ UPDATE quantity
			inventoryItem.quantity = newQuantity;

			if (inventoryId < 0) {
				// TEMP ID: Update the pending create entry
				const pendingCreates = this.pendingCreateInventory.get(userId) || [];
				const createItem = pendingCreates.find(item => item.id === inventoryId);
				if (createItem) {
					createItem.quantity = newQuantity;
					logger.info(`📦 Updated pending create temp ID ${inventoryId} quantity: ${oldQuantity} -> ${newQuantity} for user ${userId}`);
				}
			} else {
				// REAL ID: Track for database update
				if (!this.pendingInventoryUpdates.has(userId)) {
					this.pendingInventoryUpdates.set(userId, new Set());
				}
				this.pendingInventoryUpdates.get(userId)!.add(inventoryId);
				logger.info(`📦 Queued real ID ${inventoryId} for update: ${oldQuantity} -> ${newQuantity} for user ${userId}`);
			}

			this.markDirty(userId);
			this.updateActivity(userId);
			return true;
		}
	}

	/**
	 * Find inventory items by equipment ID
	 * Prefers real DB items over temporary items when multiple exist
	 */
	findInventoryByEquipmentId(userId: string, equipmentId: number): UserInventoryItem | null {
		const user = this.users.get(userId);
		if (!user || !user.inventory) return null;

		// Find all matching equipment items
		const matchingItems = user.inventory.filter(inv => inv.equipmentId === equipmentId && inv.itemId === null && inv.quantity > 0);

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
		const matchingItems = user.inventory.filter(inv => inv.itemId === itemId && inv.equipmentId === null && inv.quantity > 0);

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
			// Sync to DB
			if (createSlimes.length > 0) {
				await prismaInsertSlimesToDB(userId, createSlimes);
				logger.debug(`💾 Inserted ${createSlimes.length} slimes for ${userId}`);
			}
			if (burnSlimeIds.length > 0) {
				await prismaDeleteSlimesFromDB(userId, burnSlimeIds);
				logger.debug(`🗑️ Deleted ${burnSlimeIds.length} slimes for ${userId}`);
			}

			// Clean up - DON'T reload from DB
			this.pendingCreateSlimes.delete(userId);
			this.pendingBurnSlimeIds.delete(userId);

			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

			const user = this.users.get(userId);
			if (user) {
				logger.info(`✅ Slime flush completed - memory count: ${user.slimes.length} slimes`);
			}
		} catch (err) {
			logger.error(`❌ Slime flush failed for user ${userId}: ${err}`);
			throw err;
		}
	}

	/**
	 * Enhanced flush function with better error handling
	 * Process deletes before creates to prevent delete-after-insert bug
	 */
	async flushUserInventory(userId: string): Promise<void> {
		const createInventory = this.pendingCreateInventory.get(userId) || [];
		const updateInventoryIds = this.pendingInventoryUpdates.get(userId) || new Set();
		const deleteInventoryIds = this.pendingInventoryDeletes.get(userId) || [];

		if (createInventory.length === 0 && updateInventoryIds.size === 0 && deleteInventoryIds.length === 0) {
			logger.debug(`📦 No pending inventory changes for user ${userId}`);
			return;
		}

		logger.info(`📦 Flushing inventory for user ${userId}: ${createInventory.length} creates, ${updateInventoryIds.size} updates, ${deleteInventoryIds.length} deletes`);

		try {
			// STEP 1: Process deletes FIRST (only real IDs)
			if (deleteInventoryIds.length > 0) {
				// FILTER: Only delete real IDs (positive), skip any temp IDs that might have leaked in
				const realDeleteIds = deleteInventoryIds.filter(id => id > 0);
				if (realDeleteIds.length > 0) {
					await prismaDeleteInventoryFromDB(userId, realDeleteIds);
					logger.info(`🗑️ Deleted ${realDeleteIds.length} real inventory items`);
				}
				if (realDeleteIds.length !== deleteInventoryIds.length) {
					logger.warn(`⚠️ Filtered out ${deleteInventoryIds.length - realDeleteIds.length} temp IDs from delete queue`);
				}
			}

			// STEP 2: Handle creates (only items that still exist in memory)
			if (createInventory.length > 0) {
				const user = this.users.get(userId);
				if (user && user.inventory) {
					// FILTER: Only create items that still exist in memory
					const validCreates = createInventory.filter(createItem =>
						user.inventory.some(memItem => memItem.id === createItem.id)
					);

					if (validCreates.length > 0) {
						await prismaInsertInventoryToDB(userId, validCreates);
						logger.info(`💾 Inserted ${validCreates.length} valid inventory items`);
					}

					if (validCreates.length !== createInventory.length) {
						logger.info(`🧹 Skipped ${createInventory.length - validCreates.length} cancelled creates`);
					}
				} else {
					logger.warn(`⚠️ User ${userId} not found in memory during create flush`);
				}
			}

			// STEP 3: Handle updates (only real IDs)
			if (updateInventoryIds.size > 0) {
				const user = this.users.get(userId);
				if (user && user.inventory) {
					const itemsToUpdate: UserInventoryItem[] = [];

					for (const updateId of updateInventoryIds) {
						if (updateId > 0) { // ONLY REAL IDs
							const memoryItem = user.inventory.find(inv => inv.id === updateId);
							if (memoryItem && memoryItem.quantity > 0) {
								itemsToUpdate.push(memoryItem);
								logger.info(`🔄 Will UPDATE real ID ${updateId} to qty ${memoryItem.quantity}`);
							}
						} else {
							logger.warn(`⚠️ Skipping temp ID ${updateId} in update queue`);
						}
					}

					if (itemsToUpdate.length > 0) {
						await prismaUpdateInventoryQuantitiesInDB(userId, itemsToUpdate);
						logger.info(`🔄 Updated ${itemsToUpdate.length} inventory quantities`);
					}
				}
			}

			// STEP 4: Reload fresh data and remap temp IDs
			const finalInventory = await prismaFetchUserInventory(userId);
			const user = this.users.get(userId);
			if (user && user.inventory) {
				const remap = new Map<number, number>();

				// MAP temp IDs to real IDs based on type matching
				const tempItems = user.inventory.filter(item => item.id < 0);
				for (const tempItem of tempItems) {
					const matchingRealItems = finalInventory.filter(realItem =>
						realItem.equipmentId === tempItem.equipmentId &&
						realItem.itemId === tempItem.itemId &&
						realItem.quantity === tempItem.quantity
					);

					if (matchingRealItems.length > 0) {
						// Use the newest matching item (highest ID)
						const bestMatch = matchingRealItems.reduce((newest, current) =>
							current.id > newest.id ? current : newest
						);
						remap.set(tempItem.id, bestMatch.id);
						logger.debug(`🔗 Mapped temp ID ${tempItem.id} -> real ID ${bestMatch.id}`);
					}
				}

				// UPDATE memory with real IDs and fresh data
				user.inventory = finalInventory.sort((a, b) => a.order - b.order);

				// Apply ID remapping to any systems that might reference temp IDs
				if (remap.size > 0) {
					this.inventoryIdRemap.set(userId, remap);
				}

				logger.info(`📦 Updated memory with ${finalInventory.length} inventory items, mapped ${remap.size} temp IDs`);
			}

			// STEP 5: Clean up ALL pending operations
			this.pendingCreateInventory.delete(userId);
			this.pendingInventoryUpdates.delete(userId);
			this.pendingInventoryDeletes.delete(userId);

			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

			logger.info(`✅ Smart flush completed with temp ID handling`);

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
			this.pendingCreateInventory.has(userId) || this.pendingInventoryUpdates.has(userId)
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
	 * FIXED: Always generate snapshot from memory, keep user in memory if DB save fails
	 */
	async logoutUser(userId: string, removeFromMemory: boolean = false): Promise<boolean> {
		try {
			logger.info(`👋 User ${userId} logging out`);

			// CRITICAL: Get current memory user BEFORE any operations
			const currentMemoryUser = this.getUser(userId);
			if (!currentMemoryUser) {
				logger.error(`❌ User ${userId} not found in memory for logout`);
				return false;
			}

			// CRITICAL: Check if user has pending inventory changes BEFORE flushing
			const hasPendingInventory = this.pendingCreateInventory.has(userId) ||
				this.pendingInventoryUpdates.has(userId);

			if (hasPendingInventory) {
				logger.info(`📦 User ${userId} has pending inventory changes - forcing flush before logout`);
			}

			// STEP 1: ALWAYS generate snapshot from current memory FIRST
			// This ensures we never lose data even if database save fails
			const snapshotRedisManager = requireSnapshotRedisManager();

			try {
				await snapshotRedisManager.storeSnapshot(userId, currentMemoryUser);
				logger.info(`📸 ✅ Generated snapshot from MEMORY for user ${userId} (BEFORE DB flush)`);
			} catch (snapshotError) {
				logger.error(`❌ CRITICAL: Failed to generate snapshot from memory for ${userId}: ${snapshotError}`);
				// This is critical - if we can't snapshot, don't proceed with logout
				return false;
			}

			// STEP 2: Attempt to flush to database
			let databaseSaveSuccessful = false;
			try {
				await this.flushAllUserUpdates(userId);

				// VERIFY the flush actually completed for inventory
				if (hasPendingInventory) {
					const stillHasPending = this.pendingCreateInventory.has(userId) || this.pendingInventoryUpdates.has(userId);
					if (stillHasPending) {
						throw new Error(`Inventory flush incomplete - still has pending operations`);
					}
					logger.info(`✅ Verified inventory flush completed for user ${userId}`);
				}

				await new Promise(resolve => setTimeout(resolve, 150)); // Extra delay for memory updates

				databaseSaveSuccessful = true;
				logger.info(`✅ Successfully saved user ${userId} to database`);

				// STEP 3: Generate FRESH snapshot from updated memory after successful DB save
				const updatedMemoryUser = this.getUser(userId);
				if (updatedMemoryUser) {
					await snapshotRedisManager.storeSnapshot(userId, updatedMemoryUser);
					logger.info(`📸 ✅ Updated snapshot from memory after successful DB save for user ${userId}`);
				}

			} catch (flushError) {
				logger.error(`❌ CRITICAL: Failed to flush user data during logout for ${userId}: ${flushError}`);
				databaseSaveSuccessful = false;

				// DATABASE SAVE FAILED - but we already have snapshot from memory!
				// Keep user in memory and mark as dirty for retry
				if (removeFromMemory) {
					logger.warn(`⚠️ Database save failed - keeping user ${userId} in memory for retry`);
					this.markDirty(userId); // Ensure they get retried later
					return false; // Don't remove from memory
				}
			}

			// STEP 4: Handle memory cleanup based on success
			if (removeFromMemory) {
				if (databaseSaveSuccessful) {
					// Database save succeeded - safe to remove from memory
					this.pendingCreateSlimes.delete(userId);
					this.pendingBurnSlimeIds.delete(userId);
					this.pendingCreateInventory.delete(userId);
					this.pendingInventoryUpdates.delete(userId);
					this.pendingInventoryDeletes.delete(userId);
					this.inventoryIdRemap.delete(userId);

					// Final safety check before removing from memory
					if (this.isDirty(userId)) {
						logger.warn(`⚠️ User ${userId} still marked as dirty after flush - keeping in memory`);
						return false;
					}

					this.removeUser(userId);
					logger.info(`🗑️ Removed user ${userId} from memory after successful logout`);
				} else {
					// Database save failed - keep in memory for retry
					logger.warn(`⚠️ Keeping user ${userId} in memory - database save failed but snapshot exists`);
					this.markDirty(userId);
					return false;
				}
			} else {
				// Not removing from memory anyway
				if (databaseSaveSuccessful) {
					this.markClean(userId);
				} else {
					this.markDirty(userId); // Keep dirty for retry
				}
			}

			return databaseSaveSuccessful;

		} catch (error) {
			logger.error(`❌ Failed to handle logout for user ${userId}: ${error}`);

			// Emergency: Try to at least generate snapshot from memory if we still have the user
			try {
				const emergencyUser = this.getUser(userId);
				if (emergencyUser) {
					const snapshotRedisManager = requireSnapshotRedisManager();
					await snapshotRedisManager.storeSnapshot(userId, emergencyUser);
					logger.info(`🚨 Generated emergency snapshot from memory for ${userId}`);

					// Keep in memory and mark dirty for retry
					this.markDirty(userId);
					return false;
				}
			} catch (emergencyErr) {
				logger.error(`💥 Emergency snapshot failed for user ${userId}: ${emergencyErr}`);
			}

			return false;
		}
	}

	/**
	 * Retry mechanism for failed database saves
	 * Call this periodically (e.g., every 30 seconds)
	 */
	async retryFailedSaves(): Promise<void> {
		const dirtyUsers = this.getDirtyUsers();
		if (dirtyUsers.length === 0) return;

		logger.info(`🔄 Retrying database saves for ${dirtyUsers.length} dirty users`);

		for (const userId of dirtyUsers) {
			try {
				await this.flushAllUserUpdates(userId);
				this.markClean(userId);
				logger.info(`✅ Retry successful for user ${userId}`);
			} catch (error) {
				logger.warn(`⚠️ Retry failed for user ${userId}: ${error}`);
				// Keep dirty for next retry
			}
		}
	}
}