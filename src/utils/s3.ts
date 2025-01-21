import { S3Client } from "@aws-sdk/client-s3";
import { AWS_ACCESS_KEY_ID, AWS_S3_REGION, AWS_SECRET_ACCESS_KEY } from "../utils/config";

// Configure AWS S3
export const s3 = new S3Client({
    region: AWS_S3_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});
