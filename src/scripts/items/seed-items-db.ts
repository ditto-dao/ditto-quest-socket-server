import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedItems() {
  const itemsPath = path.join(__dirname, '../../encyclopedia/items.json');
  const itemsData = fs.readFileSync(itemsPath, 'utf-8');
  const items = JSON.parse(itemsData);

  let insertedCount = 0;

  try {
    for (const item of items) {
      const { id, ...itemFields } = item;

      const existing = await prisma.item.findUnique({
        where: { id },
      });

      if (existing) {
        await prisma.item.update({
          where: { id },
          data: itemFields,
        });
      } else {
        await prisma.item.create({
          data: {
            id,
            ...itemFields,
          },
        });
      }

      insertedCount++;
    }

    logger.info(`Inserted or updated ${insertedCount} items.`);
    const count = await prisma.item.count();
    logger.info(`Total number of items in database: ${count}.`);
  } catch (error) {
    logger.error('Error seeding items:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedItems();