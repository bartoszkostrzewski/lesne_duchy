export const ALL_SPIRIT_TYPES = [
  'Zielony', 'Szary', 'Czerwony', 'Niebieski', 'Brązowy', 
  'Jasnozielony', 'Żółty', 'Fioletowy', 'Jasnofioletowy'
] as const;

// Typ reprezentujący jedną z 9 odmian ducha
export type SpiritIconType = typeof ALL_SPIRIT_TYPES[number];

// Wszystkie możliwe ikony na kafelkach (9 duchów + 3 żywioły)
export type TileIconType = SpiritIconType | 'fire' | 'sun' | 'moon';

// Wszystkie możliwe typy żetonów (9 duchów + 3 żywioły + plus)
export type GiftType = SpiritIconType | 'fire' | 'sun' | 'moon' | 'plus';

export interface Tile {
  id: string;
  color: string;       // Kolor tła kafelka w CSS
  spiritType: SpiritIconType; // Główny rodzaj kafelka
  icons: TileIconType[]; // Lista ikon na kafelku (np. ['Niebieski', 'sun'])
  hasGift: boolean;  
  crystallizedBy: string | null; 
}

export interface SecretGift {
  id: string;
  type: GiftType; // Typ żetonu jest teraz bezpośrednio nazwą koloru lub żywiołu
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

/**
 * Generowanie puli 13 unikalnych żetonów darów (9 kolorowych duchów, 3 żywioły, 1 plus)
 */
export function generateGiftsPool(): SecretGift[] {
  const pool: SecretGift[] = [];
  
  // 1. 9 żetonów ducha - typem jest bezpośrednio nazwa rodzaju/koloru
  ALL_SPIRIT_TYPES.forEach((color, index) => {
    pool.push({ id: `gift_spirit_${index}`, type: color });
  });

  // 2. 3 żetony żywiołów
  pool.push({ id: 'gift_fire', type: 'fire' });
  pool.push({ id: 'gift_sun', type: 'sun' });
  pool.push({ id: 'gift_moon', type: 'moon' });

  // 3. 1 żeton plusa
  pool.push({ id: 'gift_plus', type: 'plus' });

  return pool.sort(() => Math.random() - 0.5);
}

/**
 * Walidacja pobierania kafelków – suma ikon duchów (dowolnego z 9 rodzajów) <= 2
 */
export function validateSelectedTiles(tiles: Tile[], isFirstRound: boolean = false): { valid: boolean; error?: string } {
  if (tiles.length === 0) return { valid: false, error: "Musisz wybrać przynajmniej jeden kafelek!" };
  if (tiles.length > 2) return { valid: false, error: "Możez dobrać maksymalnie 2 kafelki!" };
  if (isFirstRound && tiles.length > 1) return { valid: false, error: "W pierwszej rundzie możesz wziąć max. 1 kafelek!" };

  // Zliczamy ikony, które należą do grupy 9 rodzajów duchów
  const totalSpirits = tiles.reduce((sum, tile) => {
    return sum + tile.icons.filter(icon => ALL_SPIRIT_TYPES.includes(icon as any)).length;
  }, 0);

  if (totalSpirits > 2) {
    return { valid: false, error: "Łączna liczba ikon DUCHÓW na wybranych kafelkach nie może przekraczać 2!" };
  }

  if (tiles.length === 2) {
    if (tiles[0].spiritType !== tiles[1].spiritType) {
      return { valid: false, error: "Wybrane dwa kafelki muszą być tego samego rodzaju/koloru!" };
    }
  }

  return { valid: true };
}

/**
 * Obsługa zbierania kafelków i żetonu PLUS
 */
export function handleTileCollection(player: Player, tilesToTake: Tile[], allPlayers: Player[]): void {
  for (const tile of tilesToTake) {
    if (tile.crystallizedBy && tile.crystallizedBy !== player.id) {
      const opponent = allPlayers.find(p => p.id === tile.crystallizedBy);
      const plusGiftIndex = player.secretGifts.findIndex(g => g.type === 'plus');

      if (plusGiftIndex !== -1) {
        player.secretGifts.splice(plusGiftIndex, 1);
        player.collectedGiftsCount = player.secretGifts.length;
        if (opponent) opponent.frozenCrystals += 1;
      } else {
        if (opponent) opponent.frozenCrystals += 1;
        player.frozenCrystals += 1; 
      }
    } else if (tile.crystallizedBy && tile.crystallizedBy === player.id) {
      player.crystals += 1;
    }
  }
}

/**
 * Nowy, uproszczony algorytm punktacji końcowej
 */
export function calculateFinalScores(players: Player[]): PlayerScore[] {
  const scores: PlayerScore[] = players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    colorPoints: ALL_SPIRIT_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {} as Record<string, number>),
    naturePoints: { fire: 0, sun: 0, moon: 0 },
    penalties: 0,
    totalScore: 0
  }));

  // 1. DUCHY (9 Odmian)
  ALL_SPIRIT_TYPES.forEach(color => {
    let maxSymbolsFound = 0;
    const playerTotalSymbols: Record<string, number> = {};

    players.forEach(player => {
      let spiritCount = 0;

      // Zliczamy ikony specyficzne dla tego koloru (np. ikona 'Niebieski' na dowolnym kafelku)
      player.collectedTiles.forEach(tile => {
        spiritCount += tile.icons.filter(icon => icon === color).length;
      });

      // Sprawdzamy czy gracz ma żeton, którego TYP jest bezpośrednio nazwą tego koloru
      const hasMatchingGift = player.secretGifts.some(gift => gift.type === color);
      if (hasMatchingGift) {
        spiritCount += 1;
      }

      playerTotalSymbols[player.id] = spiritCount;
      if (spiritCount > maxSymbolsFound) maxSymbolsFound = spiritCount;
    });

    players.forEach(player => {
      const playerScore = scores.find(s => s.playerId === player.id)!;
      const currentSymbols = playerTotalSymbols[player.id];

      if (currentSymbols === maxSymbolsFound && maxSymbolsFound > 0) {
        playerScore.colorPoints[color] = currentSymbols; 
      } else {
        playerScore.colorPoints[color] = 0;
      }

      // Kara -3: Sprawdzamy fizyczne kafelki o tym typie
      const hasPhysicalTiles = player.collectedTiles.some(t => t.spiritType === color);
      if (!hasPhysicalTiles) {
        playerScore.penalties -= 3;
      }
    });
  });

  // 2. ŻYWIOŁY NATURY
  const natureTypes: ('fire' | 'sun' | 'moon')[] = ['fire', 'sun', 'moon'];
  natureTypes.forEach(type => {
    let maxNatureFound = 0;
    const playerTotalNature: Record<string, number> = {};

    players.forEach(player => {
      let natureCount = 0;
      player.collectedTiles.forEach(tile => {
        natureCount += tile.icons.filter(icon => icon === type).length;
      });

      const hasNatureGift = player.secretGifts.some(gift => gift.type === type);
      if (hasNatureGift) natureCount += 1;

      playerTotalNature[player.id] = natureCount;
      if (natureCount > maxNatureFound) maxNatureFound = natureCount;
    });

    players.forEach(player => {
      const playerScore = scores.find(s => s.playerId === player.id)!;
      const currentNature = playerTotalNature[player.id];

      if (currentNature === maxNatureFound && maxNatureFound > 0) {
        playerScore.naturePoints[type] = currentNature;
      } else {
        playerScore.naturePoints[type] = 0;
      }
    });
  });

  // 3. SUMA
  scores.forEach(score => {
    const sumColors = Object.values(score.colorPoints).reduce((a, b) => a + b, 0);
    const sumNature = score.naturePoints.fire + score.naturePoints.sun + score.naturePoints.moon;
    score.totalScore = sumColors + sumNature + score.penalties;
  });

  return scores;
}