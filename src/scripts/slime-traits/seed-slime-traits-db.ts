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
      // Insert all traits without pairId and mutationId
      const baseTraits = slimeTraits.map((trait: any) => {
        const { pairId, mutationId, ...rest } = trait;
        return rest;
      });
      await tx.slimeTrait.createMany({
        data: baseTraits,
        skipDuplicates: true,
      });

      logger.info('Updating pairId and mutationId in batch...');

      // Fetch all inserted traits to validate references
      const insertedTraits = await tx.slimeTrait.findMany();
      const insertedTraitsMap = new Map(insertedTraits.map((trait) => [trait.id, trait]));

      // Batch update pairId and mutationId
      const updateData = slimeTraits
        .filter((trait: any) => trait.pairId || trait.mutationId)
        .map((trait: any) => ({
          id: trait.id,
          pairId: trait.pairId && insertedTraitsMap.has(trait.pairId) ? trait.pairId : null,
          mutationId: trait.mutationId && insertedTraitsMap.has(trait.mutationId) ? trait.mutationId : null,
        }));

      // Perform batch updates
      await Promise.all(
        updateData.map(({ id, pairId, mutationId }: { id: number, pairId: number, mutationId: number }) =>
          tx.slimeTrait.update({
            where: { id },
            data: { pairId, mutationId },
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
