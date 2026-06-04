export type GiftContent = 'spirit' | 'fire' | 'moon' | 'sun' | 'plus';

export interface Tile {
  id: string;
  color: string;       
  spiritType: string;  
  icons: ('spirit' | 'fire' | 'moon' | 'sun')[]; 
  hasGift: boolean;    
  crystallizedBy: string | null;
}

export interface Player {
  id: string;
  name: string;
  collectedTiles: Tile[];
  collectedGiftsCount: number; // Widoczne dla wszystkich
  secretGifts: GiftContent[];  // Widoczne TYLKO dla tego gracza
  crystals: number;
  frozenCrystals: number;
}

export interface GameState {
  forest: (Tile | null)[][];
  players: Player[];
  currentPlayerIndex: number;
  isFirstRound: boolean;
  turnPhase: 'TAKE_TILES' | 'PLACE_CRYSTAL';
  selectedTilesByCurrentPlayer: { row: number; col: number }[];
}