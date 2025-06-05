import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { GET_NEXT_MISSION, LEDGER_UPDATE_BALANCE_EVENT, MISSION_UPDATE } from "../events"
import { emitMissionUpdate, generateNewMission, getUserMissionByUserId, isMissionComplete } from "../../sql-services/missions"
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { DEVELOPMENT_FUNDS_KEY } from "../../utils/config"

export async function setupMissionSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    dittoLedgerSocket: DittoLedgerSocket
): Promise<void> {

    socket.on(GET_NEXT_MISSION, async (userId: string) => {
        try {
            logger.info(`Received GET_NEXT_MISSION event from user ${userId}`);
            const currMision = await getUserMissionByUserId(userId);

            if (currMision) {
                const isCompleted = isMissionComplete(currMision);
                if (isCompleted && currMision.rewardDitto) creditDittoFromDevFunds(dittoLedgerSocket, userId, BigInt(currMision.rewardDitto.toString()));
            }

            const nextMission = await generateNewMission(userId, currMision);

            if (nextMission && nextMission.round < 6) {
                await emitMissionUpdate(socket, userId);
            } else {
                socket.emit(MISSION_UPDATE, {
                    userId: userId,
                    payload: null
                });
            }

        } catch (error) {
            logger.error(`Error processing mint-gen-0-slime: ${error}`);
            socket.emit('error', {
                userId: userId,
                msg: 'Failed to get next mission'
            })
        }
    })
}

function creditDittoFromDevFunds(dittoLedgerSocket: DittoLedgerSocket, targetUserId: string, amountWei: bigint) {
    const updates = [
        {
            userId: DEVELOPMENT_FUNDS_KEY,
            liveBalanceChange: (-amountWei).toString(),
            accumulatedBalanceChange: "0",
            notes: "Deducted for mission rewards",
        },
        {
            userId: targetUserId,
            liveBalanceChange: amountWei.toString(),
            accumulatedBalanceChange: "0",
            notes: `Mission rewards`,
        }
    ];

    dittoLedgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, {
        sender: DEVELOPMENT_FUNDS_KEY,
        updates,
    });

}