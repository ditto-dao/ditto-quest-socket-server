import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { logger } from "../utils/logger";
import { getColourHexByRarity, getHighestDominantTraitRarity, hexToRgba, toCamelCase } from "../utils/helpers";
import { Readable } from "stream";
import { s3 } from "../utils/s3";
import { AWS_S3_REGION, S3_UPLOAD_CACHE_CONTROL, SLIMES_TARGET_FOLDER } from "../utils/config";
import { SlimeWithTraits } from "../sql-services/slime";

const BUCKET = "kibble";

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

// Function to upload an image to S3
async function uploadImageToS3(bucket: string, key: string, imageBuffer: Buffer): Promise<string> {
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
        const uri = `https://${bucket}.s3.${AWS_S3_REGION}.amazonaws.com/${finalKey}`;
        logger.info(`Uploaded image to S3: ${uri}`);
        return uri;
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

interface ProcessSlimeImageResponse {
    uri: string,
    imageNoBg: Buffer
}

// Main function
export async function processAndUploadSlimeImage(slime: SlimeWithTraits): Promise<ProcessSlimeImageResponse> {
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

        const shadowBuffer = await getShadow(`kitty`);  // TODO: change after introducing more slime series
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

        const stackedImage = await stackImages(imageBuffers, backgroundColor);
        const stackedImageNoBg = await stackImages(imageBuffers);

        return {
            uri: await uploadImageToS3(BUCKET, `${slime.id}.png`, stackedImage),
            imageNoBg: stackedImageNoBg
        }
    } catch (error) {
        logger.error(`Error processing and uploading slime image: ${error}`);
        throw error;
    }
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
