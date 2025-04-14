import { logger } from "../../utils/logger";

const BASE_EXP_PER_S = 1.77; // Initial XP per second
const EXP_INCREASE_RATE = 1.1; // 10% increase every 10 levels

function calculateExpForNextLevel(nextLevel: number, a: number, b: number, c: number, d: number): number {
    return Math.floor(a * Math.pow(nextLevel, b) + c * Math.pow(nextLevel, d));
}

function expRequiredToReachLevel(level: number, a: number, b: number, c: number, d: number): number {
    let exp = 0;
    for (let i = 1; i <= level; i++) {
        exp += (calculateExpForNextLevel(i, a, b, c, d));
    }
    return exp;
}

// Calculates the effective XP per second based on level progression
function getExpPerSecond(level: number): number {
    const increaseFactor = Math.floor(level / 10); // Increments every 10 levels
    return BASE_EXP_PER_S * Math.pow(EXP_INCREASE_RATE, increaseFactor);
}

// Time calculation now uses the dynamic XP/s based on the level
function timeTakenToGainExpInS(exp: number, level: number): number {
    return exp / getExpPerSecond(level);
}

export function formatTime(seconds: number): string {
    const days = Math.floor(seconds / 86400); // 1 day = 86400 seconds
    seconds %= 86400;
    
    const hours = Math.floor(seconds / 3600); // 1 hour = 3600 seconds
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    let result = [];
    if (days > 0) result.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) result.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes > 0) result.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (seconds > 0 || result.length === 0) result.push(`${seconds} s`);

    return result.join(", ");
}

function logFindings(a: number, b: number, c: number, d: number): void {
    let totalExp = 0;
    let totalTimeInS = 0;
    
    for (let i = 1; i <= 1; i += 10) {
        const expRequiredForCurrentLevel = expRequiredToReachLevel(i, a, b, c, d);
        const expRequiredForPreviousLevel = expRequiredToReachLevel(i - 10, a, b, c, d);
        
        const expRequiredForIncrement = expRequiredForCurrentLevel - expRequiredForPreviousLevel;
        const timeRequiredForIncrement = formatTime(timeTakenToGainExpInS(expRequiredForIncrement, i));

        totalExp += expRequiredForIncrement;
        totalTimeInS = timeTakenToGainExpInS(totalExp, i);
        const totalTimeFormatted = formatTime(totalTimeInS);

        logger.info(`Level: ${i}, Exp Required: ${expRequiredForCurrentLevel}, Time Required Level ${i - 10} - Level ${i}: ${timeRequiredForIncrement}, Total Time Required: ${totalTimeFormatted}`);
    }
}

// XP Progression Parameters
const a = 450;  
const b = 1.15;  
const c = 120;   
const d = 1.87; 

logFindings(a, b, c, d);