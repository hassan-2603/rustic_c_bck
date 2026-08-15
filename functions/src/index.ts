import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

export const healthCheck = onRequest((request, response) => {
  // TypeScript now knows request/response are the correct types
  logger.info("Health check pinged");
  response.send({ status: "ok" });
});

