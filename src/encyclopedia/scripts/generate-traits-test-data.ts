import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

type Rarity = 'D' | 'C' | 'B' | 'A' | 'S';
type TraitType = 'Aura' | 'Body' | 'Core' | 'Headpiece' | 'Tail' | 'Arms' | 'Eyes' | 'Mouth';

interface Trait {
  id: number;
  type: TraitType;
  name: string;
  rarity: Rarity;
  pairId?: number;
  mutationId?: number;
  str: number;
  def: number;
  dex: number;
  magic: number;
  hp: number;
}

const rarities: Rarity[] = ['D', 'C', 'B', 'A', 'S'];
const traits: TraitType[] = ['Aura', 'Body', 'Core', 'Headpiece', 'Tail', 'Arms', 'Eyes', 'Mouth'];

// Define max stats based on rarity
const rarityMaxStats = {
  D: 0,
  C: 20,
  B: 50,
  A: 100,
  S: 200
};

// Define count of traits needed for each rarity
const rarityCounts = {
  D: 16,
  C: 8,
  B: 4,
  A: 2,
  S: 1
};

// Random stat generator within a given max
const generateRandomStat = (max: number) => Math.floor(Math.random() * (max + 1));

let traitId = 1;
const allTraits: Trait[] = [];

for (const traitType of traits) {
  let rarityIndex = 0;
  let mutationId = traitId + rarityCounts.D; // Initialize mutationId to start after D rank

  while (rarityIndex < rarities.length) {
    const rarity = rarities[rarityIndex];
    const maxStat = rarityMaxStats[rarity];
    const count = rarityCounts[rarity];

    for (let i = 0; i < count; i++) {
      const trait: Trait = {
        id: traitId,
        type: traitType,
        name: `Trait_${traitId}_${traitType}`,
        rarity,
        // Set pairId to the next trait for odd ids, and previous trait for even ids
        pairId: i % 2 === 0 ? traitId + 1 : traitId - 1,
        mutationId: rarityIndex < rarities.length - 1 ? mutationId + Math.floor(i / 2) : undefined,
        // Assign stats based on rarity
        str: generateRandomStat(maxStat),
        def: generateRandomStat(maxStat),
        dex: generateRandomStat(maxStat),
        magic: generateRandomStat(maxStat),
        hp: generateRandomStat(maxStat),
      };
      
      allTraits.push(trait);
      traitId++;
    }

    // Prepare mutation IDs for the next rarity level
    mutationId = traitId + count;
    rarityIndex++;
  }
}

// Ensure the directory exists
const filePath = path.resolve(__dirname, '../slime-traits.json');
fs.mkdirSync(path.dirname(filePath), { recursive: true });

// Write JSON to the file, overwriting if it exists
fs.writeFileSync(filePath, JSON.stringify(allTraits, null, 2), { flag: 'w' });

logger.info('slime-traits.json has been created successfully and overwritten if it existed.');
