export interface GachaOddsDominantTraits {
    chanceS: number;
    minS: number | null;
    maxS: number | null;
    chanceA: number;
    minA: number | null;
    maxA: number | null;
    chanceB: number;
    minB: number | null;
    maxB: number | null;
    chanceC: number;
    minC: number | null;
    maxC: number | null;
    chanceD: number;
    minD: number | null;
    maxD: number | null;
}

export const DOMINANT_TRAITS_GACHA_SPECS: Record<string, GachaOddsDominantTraits> = {
    SS: {
        chanceS: 0.30,
        minS: 3,
        maxS: 4,
        chanceA: 0.30,
        minA: 0,
        maxA: 0,
        chanceB: 0.20,
        minB: null,
        maxB: null,
        chanceC: 0.1,
        minC: null,
        maxC: null,
        chanceD: 0.1,
        minD: null,
        maxD: null,
    },
    S: {
        chanceS: 0.2,
        minS: 1,
        maxS: 2,
        chanceA: 0.30,
        minA: null,
        maxA: null,
        chanceB: 0.30,
        minB: null,
        maxB: null,
        chanceC: 0.1,
        minC: null,
        maxC: null,
        chanceD: 0.1,
        minD: null,
        maxD: null,
    },
    A: {
        chanceS: 0,
        minS: null,
        maxS: null,
        chanceA: 0.30,
        minA: 1,
        maxA: 4,
        chanceB: 0.20,
        minB: null,
        maxB: null,
        chanceC: 0.30,
        minC: null,
        maxC: null,
        chanceD: 0.20,
        minD: null,
        maxD: null,
    },
    B: {
        chanceS: 0,
        minS: null,
        maxS: null,
        chanceA: 0,
        minA: null,
        maxA: null,
        chanceB: 0.4,
        minB: 2,
        maxB: 5,
        chanceC: 0.3,
        minC: null,
        maxC: null,
        chanceD: 0.3,
        minD: null,
        maxD: null,
    },
    C: {
        chanceS: 0,
        minS: null,
        maxS: null,
        chanceA: 0,
        minA: null,
        maxA: null,
        chanceB: 0,
        minB: null,
        maxB: null,
        chanceC: 0.50,
        minC: 2,
        maxC: 6,
        chanceD: 0.50,
        minD: null,
        maxD: null,
    },
    D: {
        chanceS: 0,
        minS: null,
        maxS: null,
        chanceA: 0,
        minA: null,
        maxA: null,
        chanceB: 0,
        minB: null,
        maxB: null,
        chanceC: 0,
        minC: null,
        maxC: null,
        chanceD: 1,
        minD: 8,
        maxD: 8,
    },
};

export interface GachaOddsHiddenTraits {
    chanceS: number;
    chanceA: number;
    chanceB: number;
    chanceC: number;
    chanceD: number;
}

export const HIDDEN_TRAITS_GACHA_SPECS: Record<string, GachaOddsHiddenTraits> = {
    SS: {
        chanceS: 0.20,
        chanceA: 0.30,
        chanceB: 0.25,
        chanceC: 0.15,
        chanceD: 0.10,
    },
    S: {
        chanceS: 0.15,
        chanceA: 0.30,
        chanceB: 0.30,
        chanceC: 0.15,
        chanceD: 0.10,
    },
    A: {
        chanceS: 0.05,
        chanceA: 0.30,
        chanceB: 0.30,
        chanceC: 0.20,
        chanceD: 0.15,
    },
    B: {
        chanceS: 0.02,
        chanceA: 0.15,
        chanceB: 0.40,
        chanceC: 0.30,
        chanceD: 0.13,
    },
    C: {
        chanceS: 0,
        chanceA: 0.05,
        chanceB: 0.20,
        chanceC: 0.50,
        chanceD: 0.25,
    },
    D: {
        chanceS: 0,
        chanceA: 0,
        chanceB: 0.05,
        chanceC: 0.20,
        chanceD: 0.75,
    },
};

export const GACHA_PULL_RARITIES = ['D', 'C', 'B', 'A', 'S', 'SS']
