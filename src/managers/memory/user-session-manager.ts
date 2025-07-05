import AsyncLock from "async-lock";
import { logger } from "../../utils/logger";

/**
 * UserSessionManager - Centralized session state management with proper locking
 * 
 * This manager ensures that login and logout operations for the same user
 * are properly synchronized to prevent race conditions during page refresh
 * or concurrent session management.
 */
export class UserSessionManager {
    // Shared locks per user - used by both login and logout operations
    private userSessionLocks: Map<string, AsyncLock> = new Map();
    
    // Track session states to prevent invalid transitions
    private userSessionStates: Map<string, UserSessionState> = new Map();
    
    // Track ongoing operations to provide better logging and debugging
    private ongoingOperations: Map<string, string> = new Map();

    constructor() {
        logger.info("✅ UserSessionManager initialized with shared session locks");
    }

    /**
     * Get or create a shared lock for a specific user
     * This lock is used by BOTH login and logout operations
     */
    private getUserSessionLock(userId: string): AsyncLock {
        if (!this.userSessionLocks.has(userId)) {
            this.userSessionLocks.set(userId, new AsyncLock());
        }
        return this.userSessionLocks.get(userId)!;
    }

    /**
     * Get current session state for user
     */
    getSessionState(userId: string): UserSessionState {
        return this.userSessionStates.get(userId) || UserSessionState.LOGGED_OUT;
    }

    /**
     * Set session state for user
     */
    private setSessionState(userId: string, state: UserSessionState): void {
        this.userSessionStates.set(userId, state);
        logger.debug(`🔄 User ${userId} session state: ${state}`);
    }

    /**
     * Check if user has any ongoing session operation
     */
    hasOngoingOperation(userId: string): boolean {
        return this.ongoingOperations.has(userId);
    }

    /**
     * Get current ongoing operation for user
     */
    getOngoingOperation(userId: string): string | null {
        return this.ongoingOperations.get(userId) || null;
    }

    /**
     * COORDINATED LOGIN - Uses shared user lock to prevent race conditions
     */
    async coordinatedLogin(
        userId: string,
        loginOperation: () => Promise<boolean>
    ): Promise<boolean> {
        const sessionLock = this.getUserSessionLock(userId);

        return await sessionLock.acquire('session_operation', async () => {
            try {
                // Check current state
                const currentState = this.getSessionState(userId);
                const ongoingOp = this.getOngoingOperation(userId);

                logger.info(`🚪 Starting coordinated login for user ${userId}`);
                logger.info(`   Current state: ${currentState}`);
                logger.info(`   Ongoing operation: ${ongoingOp || 'none'}`);

                // Prevent login during logout
                if (currentState === UserSessionState.LOGGING_OUT) {
                    logger.warn(`⚠️ Login blocked - user ${userId} is currently logging out`);
                    return false;
                }

                // Prevent duplicate login
                if (currentState === UserSessionState.LOGGING_IN) {
                    logger.warn(`⚠️ Login blocked - user ${userId} is already logging in`);
                    return false;
                }

                // Prevent login if already logged in
                if (currentState === UserSessionState.LOGGED_IN) {
                    logger.warn(`⚠️ Login blocked - user ${userId} is already logged in`);
                    return false;
                }

                // Mark as logging in
                this.setSessionState(userId, UserSessionState.LOGGING_IN);
                this.ongoingOperations.set(userId, 'login');

                logger.info(`🔐 Acquired session lock for login: ${userId}`);

                // Execute the actual login operation
                const success = await loginOperation();

                if (success) {
                    this.setSessionState(userId, UserSessionState.LOGGED_IN);
                    logger.info(`✅ User ${userId} successfully logged in`);
                } else {
                    this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                    logger.warn(`❌ Login failed for user ${userId}`);
                }

                return success;

            } catch (error) {
                logger.error(`❌ Coordinated login failed for user ${userId}: ${error}`);
                this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                return false;
            } finally {
                this.ongoingOperations.delete(userId);
                logger.info(`🔓 Released session lock after login attempt: ${userId}`);
            }
        });
    }

    /**
     * COORDINATED LOGOUT - Uses shared user lock to prevent race conditions
     */
    async coordinatedLogout(
        userId: string,
        logoutOperation: () => Promise<boolean>,
        forceLogout: boolean = false
    ): Promise<boolean> {
        const sessionLock = this.getUserSessionLock(userId);

        return await sessionLock.acquire('session_operation', async () => {
            try {
                // Check current state
                const currentState = this.getSessionState(userId);
                const ongoingOp = this.getOngoingOperation(userId);

                logger.info(`🚪 Starting coordinated logout for user ${userId}`);
                logger.info(`   Current state: ${currentState}`);
                logger.info(`   Ongoing operation: ${ongoingOp || 'none'}`);
                logger.info(`   Force logout: ${forceLogout}`);

                // Allow force logout to proceed regardless of state
                if (!forceLogout) {
                    // Prevent logout during login
                    if (currentState === UserSessionState.LOGGING_IN) {
                        logger.warn(`⚠️ Logout blocked - user ${userId} is currently logging in`);
                        return false;
                    }

                    // Prevent duplicate logout
                    if (currentState === UserSessionState.LOGGING_OUT) {
                        logger.warn(`⚠️ Logout blocked - user ${userId} is already logging out`);
                        return false;
                    }

                    // Nothing to logout if already logged out
                    if (currentState === UserSessionState.LOGGED_OUT) {
                        logger.info(`ℹ️ User ${userId} is already logged out`);
                        return true;
                    }
                }

                // Mark as logging out
                this.setSessionState(userId, UserSessionState.LOGGING_OUT);
                this.ongoingOperations.set(userId, forceLogout ? 'force_logout' : 'logout');

                logger.info(`🔐 Acquired session lock for logout: ${userId}`);

                // Execute the actual logout operation
                const success = await logoutOperation();

                if (success) {
                    this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                    logger.info(`✅ User ${userId} successfully logged out`);
                } else {
                    // On logout failure, keep as logged in unless forced
                    if (!forceLogout) {
                        this.setSessionState(userId, UserSessionState.LOGGED_IN);
                    } else {
                        this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                    }
                    logger.warn(`❌ Logout ${forceLogout ? 'forced' : 'failed'} for user ${userId}`);
                }

                return success;

            } catch (error) {
                logger.error(`❌ Coordinated logout failed for user ${userId}: ${error}`);
                
                if (forceLogout) {
                    this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                    logger.info(`🔨 Force logout completed despite error for user ${userId}`);
                    return true; // Force logout always "succeeds"
                } else {
                    this.setSessionState(userId, UserSessionState.LOGGED_IN);
                    return false;
                }
            } finally {
                this.ongoingOperations.delete(userId);
                logger.info(`🔓 Released session lock after logout attempt: ${userId}`);
            }
        });
    }

    /**
     * SESSION REPLACEMENT - Handles the common case where a new login needs to replace an existing session
     * This is what should be called during page refresh scenarios
     */
    async coordinatedSessionReplacement(
        userId: string,
        logoutOperation: () => Promise<boolean>,
        loginOperation: () => Promise<boolean>
    ): Promise<boolean> {
        const sessionLock = this.getUserSessionLock(userId);

        return await sessionLock.acquire('session_operation', async () => {
            try {
                const currentState = this.getSessionState(userId);
                logger.info(`🔄 Starting session replacement for user ${userId} (current state: ${currentState})`);

                this.ongoingOperations.set(userId, 'session_replacement');

                // Step 1: Force logout existing session if needed
                if (currentState === UserSessionState.LOGGED_IN || currentState === UserSessionState.LOGGING_OUT) {
                    logger.info(`🚪 Forcing logout of existing session for user ${userId}`);
                    
                    this.setSessionState(userId, UserSessionState.LOGGING_OUT);
                    
                    try {
                        await logoutOperation();
                        logger.info(`✅ Successfully logged out existing session for user ${userId}`);
                    } catch (logoutError) {
                        logger.warn(`⚠️ Logout failed during session replacement for user ${userId}: ${logoutError}`);
                        // Continue with login anyway for session replacement
                    }
                }

                // Step 2: Proceed with new login
                logger.info(`🚪 Starting new login after session cleanup for user ${userId}`);
                
                this.setSessionState(userId, UserSessionState.LOGGING_IN);
                
                const loginSuccess = await loginOperation();

                if (loginSuccess) {
                    this.setSessionState(userId, UserSessionState.LOGGED_IN);
                    logger.info(`✅ Session replacement completed successfully for user ${userId}`);
                } else {
                    this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                    logger.error(`❌ Session replacement failed - new login failed for user ${userId}`);
                }

                return loginSuccess;

            } catch (error) {
                logger.error(`❌ Session replacement failed for user ${userId}: ${error}`);
                this.setSessionState(userId, UserSessionState.LOGGED_OUT);
                return false;
            } finally {
                this.ongoingOperations.delete(userId);
                logger.info(`🔓 Released session lock after session replacement: ${userId}`);
            }
        });
    }

    /**
     * Clean up session data for user (call when user is definitely gone)
     */
    cleanupUserSession(userId: string): void {
        this.userSessionStates.delete(userId);
        this.ongoingOperations.delete(userId);
        this.userSessionLocks.delete(userId);
        logger.debug(`🧹 Cleaned up session data for user ${userId}`);
    }

    /**
     * Get debug info for all active sessions
     */
    getSessionDebugInfo(): SessionDebugInfo[] {
        const sessions: SessionDebugInfo[] = [];
        
        for (const [userId, state] of this.userSessionStates.entries()) {
            sessions.push({
                userId,
                state,
                ongoingOperation: this.ongoingOperations.get(userId) || null,
                hasLock: this.userSessionLocks.has(userId)
            });
        }
        
        return sessions;
    }

    /**
     * Emergency cleanup - force logout all users (use with extreme caution)
     */
    async emergencyCleanupAllSessions(
        logoutOperation: (userId: string) => Promise<boolean>
    ): Promise<void> {
        logger.warn(`🚨 Emergency cleanup of all user sessions initiated`);
        
        const userIds = Array.from(this.userSessionStates.keys());
        
        for (const userId of userIds) {
            try {
                await this.coordinatedLogout(userId, () => logoutOperation(userId), true);
                this.cleanupUserSession(userId);
            } catch (error) {
                logger.error(`❌ Emergency cleanup failed for user ${userId}: ${error}`);
            }
        }
        
        logger.warn(`🚨 Emergency cleanup completed for ${userIds.length} users`);
    }
}

/**
 * Session states enum
 */
export enum UserSessionState {
    LOGGED_OUT = 'LOGGED_OUT',
    LOGGING_IN = 'LOGGING_IN',
    LOGGED_IN = 'LOGGED_IN',
    LOGGING_OUT = 'LOGGING_OUT'
}

/**
 * Debug info interface
 */
export interface SessionDebugInfo {
    userId: string;
    state: UserSessionState;
    ongoingOperation: string | null;
    hasLock: boolean;
}