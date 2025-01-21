import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedSlimeTraits() {
    const slimeTraitsPath = path.join(__dirname, '../../encyclopedia/slime-traits.json');
    const slimeTraitsData = fs.readFileSync(slimeTraitsPath, 'utf-8');
    const slimeTraits = JSON.parse(slimeTraitsData);

    try {
        await prisma.$transaction(async (tx) => {
            logger.info('Seeding base traits...');

            // Insert all traits without pair or mutation references
            const baseTraits = slimeTraits.map((trait: any) => {
                const { pair0Id, mutation0Id, pair1Id, mutation1Id, ...rest } = trait;
                return rest;
            });

            await tx.slimeTrait.createMany({
                data: baseTraits,
                skipDuplicates: true,
            });

            logger.info('Fetching inserted traits...');

            // Fetch all inserted traits to validate references
            const insertedTraits = await tx.slimeTrait.findMany();
            const insertedTraitsMap = new Map(insertedTraits.map((trait) => [trait.id, trait]));

            logger.info('Updating pair and mutation IDs in batch...');

            // Batch update pair and mutation IDs
            const updateData = slimeTraits.map((trait: any) => ({
                id: trait.id,
                pair0Id: trait.pair0Id && insertedTraitsMap.has(trait.pair0Id) ? trait.pair0Id : null,
                mutation0Id: trait.mutation0Id && insertedTraitsMap.has(trait.mutation0Id) ? trait.mutation0Id : null,
                pair1Id: trait.pair1Id && insertedTraitsMap.has(trait.pair1Id) ? trait.pair1Id : null,
                mutation1Id: trait.mutation1Id && insertedTraitsMap.has(trait.mutation1Id) ? trait.mutation1Id : null,
            }));

            // Perform batch updates
            await Promise.all(
                updateData.map(({ id, pair0Id, mutation0Id, pair1Id, mutation1Id }: { id: number, pair0Id: number | null, mutation0Id: number | null, pair1Id: number | null, mutation1Id: number | null }) =>
                    tx.slimeTrait.update({
                        where: { id },
                        data: { pair0Id, mutation0Id, pair1Id, mutation1Id },
                    })
                )
            );

            logger.info('Seeding and updates completed successfully.');
        });
    } catch (error) {
        logger.error(`Error seeding slime traits: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedSlimeTraits();
