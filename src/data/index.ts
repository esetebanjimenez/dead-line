import { config } from './config';
import { units } from './units';
import { waves } from './waves';
import { validateData } from './validate';
import type { GameData } from './types';

export * from './types';
export { validateData };
export const gameData: GameData = { config, units, waves };
