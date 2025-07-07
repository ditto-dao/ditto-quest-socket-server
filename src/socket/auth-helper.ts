import { Socket } from 'socket.io';
import { requireUserSessionManager, requireUserMemoryManager } from '../managers/global-managers/global-managers';
import { UserSessionState } from '../managers/memory/user-session-manager';
import { logger } from '../utils/logger';

export function isUserLoggedIn(userId: string): boolean {
    try {
        const sessionManager = requireUserSessionManager();
        const userMemoryManager = requireUserMemoryManager();

        return sessionManager.getSessionState(userId) === UserSessionState.LOGGED_IN
            && userMemoryManager.hasUser(userId);
    } catch (error) {
        logger.error(`Error checking if user ${userId} is logged in: ${error}`);
        return false; // ← Assume not logged in if managers unavailable
    }
}

export function requireLoggedInUser(userId: string, socket: Socket): boolean {
    try {
        if (!isUserLoggedIn(userId)) {
            logger.warn(`Received event from logged out user ${userId}. Emitting error message.`);
            socket.emit('error', {
                userId: userId,
                msg: 'You have been logged out. Please refresh'
            });
            return false;
        }
        return true;
    } catch (error) {
        logger.error(`Error validating user ${userId}: ${error}`);
        socket.emit('error', {
            userId: userId,
            msg: 'Server error. Please refresh'
        });
        return false;
    }
}