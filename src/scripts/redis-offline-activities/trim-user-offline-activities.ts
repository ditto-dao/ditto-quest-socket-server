import { createClient } from "redis";
import { deleteAllIdleActivityQueueElementsForAllUsers, trimIdleActivitiesForAllUsers } from "../../redis/idle-activity-redis";
import { logger } from "../../utils/logger";

async function main() {
  const redisClient = createClient({ url: "redis://localhost:6379" });

  redisClient.on("error", (err) =>
    logger.error(`Redis Client Error: ${err}`)
  );

  try {
    await redisClient.connect();
    logger.info("Connected to Redis");

    await trimIdleActivitiesForAllUsers(redisClient);
    await deleteAllIdleActivityQueueElementsForAllUsers(redisClient);
  } catch (err) {
    logger.error(`Error running trim script: ${err}`);
  } finally {
    await redisClient.disconnect();
    logger.info("Disconnected from Redis");
  }
}

main();