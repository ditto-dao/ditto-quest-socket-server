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
	pendingBurnInventoryIds: Map<string, number[]> = new Map();
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
	getUserLock(userId: string): AsyncLock {
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
					logger.info(`⏰ Auto-logging out inactive user ${userId} (last active: ${new Date(lastActive).toISOString()})`);

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

					// STEP 4: Clean up socket cache and notify ledger
					if (socketManager) {
						socketManager.removeSocketIdCacheForUser(userId);
					}

					if (dittoLedgerSocket) {
						dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());
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
			let remap = new Map<number, number>();

			// Step 1: Handle creates first to establish ID mappings
			if (createInventory.length > 0) {
				await prismaInsertInventoryToDB(userId, createInventory);
				logger.debug(`💾 Inserted ${createInventory.length} inventory items for ${userId}`);

				// Get fresh inventory to map temp IDs to real IDs
				const freshInventory = await prismaFetchUserInventory(userId);

				// Build ID mapping for newly created items
				for (const createdItem of createInventory) {
					if (createdItem.id < 0) { // temp ID
						// Find the NEWEST item (highest ID) that matches equipment/item type
						const matchingItems = freshInventory.filter(inv =>
							inv.equipmentId === createdItem.equipmentId &&
							inv.itemId === createdItem.itemId
						);

						if (matchingItems.length > 0) {
							// Get the item with the highest ID (most recently created)
							const realItem = matchingItems.reduce((newest, current) =>
								current.id > newest.id ? current : newest
							);

							remap.set(createdItem.id, realItem.id);
							logger.debug(`🔗 Mapped temp ID ${createdItem.id} -> real ID ${realItem.id} (newest of ${matchingItems.length} matching items)`);
						} else {
							logger.error(`❌ Could not find any matching items for temp ID ${createdItem.id}`);
							throw new Error(`Critical: Cannot map temp ID ${createdItem.id} - no matching items found`);
						}
					}
				}
			}

			// Step 2: Process updates (map temp IDs to real IDs)
			const mappedUpdateIds = new Set<number>();
			for (const tempId of updateInventoryIds) {
				if (tempId < 0) {
					if (remap.has(tempId)) {
						// This temp ID was just created in Step 1
						mappedUpdateIds.add(remap.get(tempId)!);
						logger.debug(`🔗 Mapped pending update: temp ID ${tempId} -> real ID ${remap.get(tempId)!}`);
					} else {
						// This is an existing temp ID that needs resolution
						const user = this.users.get(userId);
						if (user && user.inventory) {
							const memoryItem = user.inventory.find(inv => inv.id === tempId);
							if (memoryItem) {
								const currentInventory = await prismaFetchUserInventory(userId);
								const matchingRealItem = currentInventory.find(realItem =>
									realItem.equipmentId === memoryItem.equipmentId &&
									realItem.itemId === memoryItem.itemId
								);

								if (matchingRealItem) {
									remap.set(tempId, matchingRealItem.id);
									mappedUpdateIds.add(matchingRealItem.id);
									logger.info(`🔗 Resolved unmappable temp ID ${tempId} -> real ID ${matchingRealItem.id}`);
								} else {
									logger.error(`❌ Could not resolve temp ID ${tempId} - no matching real item found`);
									throw new Error(`Critical: Cannot resolve temp ID ${tempId} for quantity update`);
								}
							}
						}
					}
				} else {
					mappedUpdateIds.add(tempId); // Already a real ID
				}
			}

			// Step 3: Apply quantity updates
			if (mappedUpdateIds.size > 0) {
				const user = this.users.get(userId);
				if (user && user.inventory) {
					const itemsToUpdate = user.inventory
						.filter(inv => {
							return updateInventoryIds.has(inv.id) || mappedUpdateIds.has(inv.id);
						})
						.map(inv => {
							const realId = inv.id < 0 && remap.has(inv.id) ? remap.get(inv.id)! : inv.id;
							return { ...inv, id: realId };
						})
						.filter(inv => inv.id > 0);

					if (itemsToUpdate.length > 0) {
						await prismaUpdateInventoryQuantitiesInDB(userId, itemsToUpdate);
						logger.debug(`🔄 Updated ${itemsToUpdate.length} inventory quantities for ${userId}`);
					}
				}
			}

			// Step 4: Handle deletes - only skip if the exact same temp ID was created and deleted
			if (burnInventoryIds.length > 0) {
				const realBurnIds = burnInventoryIds
					.filter((fakeId) => {
						// 🔥 CORRECT FIX: Only skip deletion if the exact temp ID being deleted was also created in this flush
						if (fakeId < 0) {
							const wasJustCreated = createInventory.some(item => item.id === fakeId);
							if (wasJustCreated) {
								logger.warn(`⚠️ Skipping deletion of temp ID ${fakeId} because it was just created in this flush`);
								return false;
							}
						}
						return true;
					})
					.map(fakeId => {
						if (fakeId < 0) {
							const realId = remap.get(fakeId);
							if (!realId) {
								logger.error(`❌ Could not remap temp ID ${fakeId} for deletion`);
								throw new Error(`Critical: Cannot map temp ID ${fakeId} for deletion`);
							}
							return realId;
						}
						return fakeId; // Already a real ID
					});

				if (realBurnIds.length > 0) {
					await prismaDeleteInventoryFromDB(userId, realBurnIds);
					logger.debug(`🗑️ Deleted ${realBurnIds.length} inventory items for ${userId} (${burnInventoryIds.length - realBurnIds.length} skipped as same temp ID)`);
				} else if (burnInventoryIds.length > 0) {
					logger.debug(`🚫 All ${burnInventoryIds.length} delete operations skipped - same temp IDs were created and deleted`);
				}
			}

			// Step 5: Get the final state from database and update memory
			const finalInventory = await prismaFetchUserInventory(userId);
			const user = this.users.get(userId);
			if (user) {
				user.inventory = finalInventory;
				logger.debug(`📦 Updated memory with ${finalInventory.length} inventory items for user ${userId}`);
			}

			// Step 6: Store ID remapping and cleanup
			if (remap.size > 0) {
				this.inventoryIdRemap.set(userId, remap);
			}

			// Clear all pending operations
			this.pendingCreateInventory.delete(userId);
			this.pendingBurnInventoryIds.delete(userId);
			this.pendingInventoryUpdates.delete(userId);

			// Mark clean if no other pending changes
			if (!this.hasPendingChanges(userId)) {
				this.markClean(userId);
			}

			logger.info(`✅ Successfully flushed inventory for user ${userId} with ${remap.size} ID remappings - NO UPDATES SKIPPED`);

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
					const totalEquipmentCount = currentMemoryUser.inventory?.filter(inv => inv.equipmentId !== null).reduce((sum, item) => sum + item.quantity, 0) || 0;
					const totalItemCount = currentMemoryUser.inventory?.filter(inv => inv.itemId !== null).reduce((sum, item) => sum + item.quantity, 0) || 0;

					logger.info(`📊 Pre-snapshot verification: User ${userId} has ${inventoryCount} inventory slots, ${totalEquipmentCount} equipment items, ${totalItemCount} regular items`);

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