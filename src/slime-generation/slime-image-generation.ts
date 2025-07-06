import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { logger } from "../utils/logger";
import { getColourHexByRarity, getHighestDominantTraitRarity, hexToRgba, toCamelCase } from "../utils/helpers";
import { Readable } from "stream";
import { s3 } from "../utils/s3";
import { AWS_S3_REGION, S3_UPLOAD_CACHE_CONTROL, SLIMES_TARGET_FOLDER } from "../utils/config";
import { SlimeWithTraits } from "../sql-services/slime";

const BUCKET = "kibble";

/**
 * Pre-generate the S3 URI for a slime before upload
 */
export function generateSlimeImageUri(slimeId: number): string {
    const finalKey = `${SLIMES_TARGET_FOLDER}/${slimeId}.png`;
    return `https://${BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${finalKey}`;
}

/**
 * Upload image buffer to S3 with pre-determined URI
 */
async function uploadImageBufferToS3(slimeId: number, imageBuffer: Buffer, expectedUri: string): Promise<void> {
    const finalKey = `${SLIMES_TARGET_FOLDER}/${slimeId}.png`;
    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET,
                Key: finalKey,
                Body: imageBuffer,
                ContentType: "image/png",
                CacheControl: S3_UPLOAD_CACHE_CONTROL,
            })
        );

        logger.info(`✅ Uploaded slime ${slimeId} image to S3: ${expectedUri}`);
    } catch (error) {
        logger.error(`❌ Error uploading slime ${slimeId} to S3: ${error}`);
        throw error;
    }
}

/**
 * Generate slime image buffers synchronously (for immediate use)
 * Returns both the final image and no-background version
 */
export async function generateSlimeImageBuffers(slime: SlimeWithTraits): Promise<{
    imageWithBg: Buffer;
    imageNoBg: Buffer;
}> {
    try {
        const body = toCamelCase(slime.BodyDominant.name);
        const primaryColour = toCamelCase(slime.PrimaryColourDominant.name);
        const pattern = toCamelCase(slime.PatternDominant.name);
        const accent = toCamelCase(slime.AccentDominant.name);
        const detail = toCamelCase(slime.DetailDominant.name);
        const eyeShape = toCamelCase(slime.EyeShapeDominant.name);
        const eyeColour = toCamelCase(slime.EyeColourDominant.name);
        const mouth = toCamelCase(slime.MouthDominant.name);

        const imageBuffers: Buffer[] = [];
        const bgColourHex = getColourHexByRarity(getHighestDominantTraitRarity(slime));
        const backgroundColor = hexToRgba(bgColourHex);

        // Fetch all image components
        const shadowBuffer = await getShadow(`kitty`);
        if (shadowBuffer) imageBuffers.push(shadowBuffer);

        const bodyBuffer = await getBodyWithPrimaryColour(body, primaryColour);
        if (bodyBuffer) imageBuffers.push(bodyBuffer);

        const patternBuffer = await getPatternAndAccent(body, pattern, accent);
        if (patternBuffer) imageBuffers.push(patternBuffer);

        const detailBuffer = await getDetail(body, pattern, detail);
        if (detailBuffer) imageBuffers.push(detailBuffer);

        const eyesBuffer = await getEyes(eyeShape, eyeColour);
        if (eyesBuffer) imageBuffers.push(eyesBuffer);

        const mouthBuffer = await getMouth(mouth);
        if (mouthBuffer) imageBuffers.push(mouthBuffer);

        // Generate both versions
        const imageWithBg = await stackImages(imageBuffers, backgroundColor);
        const imageNoBg = await stackImages(imageBuffers); // No background

        return {
            imageWithBg,
            imageNoBg
        };
    } catch (error) {
        logger.error(`Error generating slime image buffers for ID ${slime.id}: ${error}`);
        throw error;
    }
}

/**
 * Upload slime image to S3 asynchronously (non-blocking)
 */
export function uploadSlimeImageAsync(slime: SlimeWithTraits, imageBuffer: Buffer, preGeneratedUri: string): void {
    // Fire and forget - don't await this
    uploadImageBufferToS3(slime.id, imageBuffer, preGeneratedUri)
        .then(() => {
            logger.info(`🎨 S3 upload completed for slime ${slime.id}`);
        })
        .catch((error) => {
            logger.error(`❌ S3 upload failed for slime ${slime.id}: ${error}`);
            // Could implement retry logic here
        });
}

// Keep the original function for backward compatibility but mark as deprecated
export async function processAndUploadSlimeImage(slime: SlimeWithTraits, preGeneratedUri?: string): Promise<{
    uri: string;
    imageNoBg: Buffer;
}> {
    const { imageWithBg, imageNoBg } = await generateSlimeImageBuffers(slime);
    const uri = preGeneratedUri || generateSlimeImageUri(slime.id);

    // Upload synchronously (blocking)
    await uploadImageBufferToS3(slime.id, imageWithBg, uri);

    return {
        uri,
        imageNoBg
    };
}

// Function to fetch an image from S3
async function fetchImageFromS3(bucket: string, key: string): Promise<Buffer | null> {
    try {
        const data = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const streamToBuffer = (stream: Readable) =>
            new Promise<Buffer>((resolve, reject) => {
                const chunks: any[] = [];
                stream.on("data", (chunk) => chunks.push(chunk));
                stream.on("end", () => resolve(Buffer.concat(chunks)));
                stream.on("error", reject);
            });

        return data.Body ? await streamToBuffer(data.Body as Readable) : null;
    } catch (error: any) {
        if (error.name === "NoSuchKey") {
            console.trace(`Image not found: ${key}`);
            return null; // Return null if the image is not found
        }
        console.error(`Unexpected error fetching image from S3: ${key}: ${error}`);
        throw error; // Re-throw unexpected errors
    }
}

// Modified upload function that accepts pre-determined URI
async function uploadImageToS3WithUri(bucket: string, key: string, imageBuffer: Buffer, expectedUri: string): Promise<string> {
    const finalKey = `${SLIMES_TARGET_FOLDER}/${key}`;
    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: finalKey,
                Body: imageBuffer,
                ContentType: "image/png",
                CacheControl: S3_UPLOAD_CACHE_CONTROL,
            })
        );

        // Verify the generated URI matches expected
        const actualUri = `https://${bucket}.s3.${AWS_S3_REGION}.amazonaws.com/${finalKey}`;
        if (actualUri !== expectedUri) {
            logger.error(`❌ URI mismatch! Expected: ${expectedUri}, Actual: ${actualUri}`);
            throw new Error(`S3 URI generation mismatch`);
        }

        logger.info(`Uploaded image to S3: ${actualUri}`);
        return actualUri;
    } catch (error) {
        logger.error(`Error uploading image to S3: ${error}`);
        throw error;
    }
}

interface RGBAColor {
    r: number;
    g: number;
    b: number;
    alpha: number;
}

// Function to stack images
async function stackImages(
    imageBuffers: Buffer[],
    backgroundColor?: RGBAColor
): Promise<Buffer> {
    const compositeImages = imageBuffers.map((buffer) => ({
        input: buffer,
        top: 0,
        left: 0,
    }));

    return sharp({
        create: {
            width: 1000,
            height: 1000,
            channels: 4,
            background: backgroundColor
                ? backgroundColor
                : { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
        },
    })
        .composite(compositeImages)
        .png()
        .toBuffer();
}

async function getShadow(shadowType: 'kitty'): Promise<Buffer | null> {
    const key = `ditto-quest/layers/shadow/${shadowType}.png`;
    return fetchImageFromS3(BUCKET, key);
}

async function getBodyWithPrimaryColour(body: string, primaryColour: string): Promise<Buffer | null> {
    const key = `ditto-quest/layers/body/${body}/primaryColour/${primaryColour}.png`;
    return fetchImageFromS3(BUCKET, key);
}

async function getPatternAndAccent(body: string, pattern: string, accent: string): Promise<Buffer | null> {
    const key = `ditto-quest/layers/body/${body}/accent/${pattern}/${accent}.png`;
    return fetchImageFromS3(BUCKET, key);
}

async function getDetail(body: string, pattern: string, detail: string): Promise<Buffer | null> {
    const key = `ditto-quest/layers/body/${body}/detail/${pattern}/${detail}.png`;
    return fetchImageFromS3(BUCKET, key);
}

async function getEyes(shape: string, colour: string): Promise<Buffer | null> {
    const key = `ditto-quest/layers/eyeColour/${colour}/${shape}.png`;
    return fetchImageFromS3(BUCKET, key);
}

async function getMouth(mouth: string): Promise<Buffer | null> {
    const key = `ditto-quest/layers/mouth/${mouth}.png`;
    return fetchImageFromS3(BUCKET, key);
}
