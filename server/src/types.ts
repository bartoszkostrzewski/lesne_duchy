export const ALL_SPIRIT_TYPES = [
  'Zielony', 'Szary', 'Czerwony', 'Niebieski', 'Brązowy', 
  'Jasnozielony', 'Żółty', 'Fioletowy', 'Jasnofioletowy'
] as const;

export type SpiritIconType = typeof ALL_SPIRIT_TYPES[number];
export type TileIconType = string; 
export type GiftType = string;

export interface Tile {
  id: string;
  color: string;       
  spiritType: SpiritIconType; 
  icons: TileIconType[]; 
  hasGift: boolean;  
  crystallizedBy: string | null; 
}

export interface SecretGift {
  id: string;
  type: GiftType; 
}

export interface Player {
  id: string;
  name: string;
  collectedTiles: Tile[];
  collectedGiftsCount: number; 
  secretGifts: SecretGift[]; 
  crystals: number;       
  frozenCrystals: number; 
  crystalVisual: string;  
}

export interface PlayerScore {
  playerId: string;
  playerName: string;
  colorPoints: Record<string, number>;
  naturePoints: { fire: number; sun: number; moon: number };
  penalties: number;
  totalScore: number;
}

export interface GameState {
  forest: (Tile | null)[][];
  players: Player[];
  giftsPool: SecretGift[]; 
  currentPlayerIndex: number;
  isFirstRound: boolean;
  turnPhase: 'TAKE_TILES' | 'PLACE_CRYSTAL';
  selectedTilesByCurrentPlayer: { row: number; col: number }[];
}