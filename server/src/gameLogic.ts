import { Tile, SecretGift, Player, PlayerScore, ALL_SPIRIT_TYPES } from './types';

/**
 * Generowanie puli 13 unikalnych żetonów darów (9 kolorowych duchów, 3 żywioły, 1 plus)
 */
export function generateGiftsPool(): SecretGift[] {
  const pool: SecretGift[] = [];
  
  // 1. 9 żetonów ducha (małymi literami dla pełnej spójności tekstowej)
  ALL_SPIRIT_TYPES.forEach((color, index) => {
    pool.push({ id: `gift_spirit_${index}`, type: color.toLowerCase() });
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
 * Walidacja pobierania kafelków – suma wszystkich ikon duchów <= 2
 */
export function validateSelectedTiles(tiles: Tile[], isFirstRound: boolean = false): { valid: boolean; error?: string } {
  if (tiles.length === 0) return { valid: false, error: "Musisz wybrać przynajmniej jeden kafelek!" };
  if (tiles.length > 2) return { valid: false, error: "Możesz dobrać maksymalnie 2 kafelki!" };
  if (isFirstRound && tiles.length > 1) return { valid: false, error: "W pierwszej rundzie możesz wziąć max. 1 kafelek!" };

  // Zliczamy ikony należące do grupy 9 rodzajów duchów
  const totalSpirits = tiles.reduce((sum, tile) => {
    return sum + tile.icons.filter(icon => {
      const norm = icon.trim().toLowerCase();
      return ALL_SPIRIT_TYPES.map(t => t.toLowerCase()).includes(norm);
    }).length;
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
 * Obsługa zbierania kafelków, ściągania żetonów z planszy oraz tarczy ochronnej (PLUS)
 */
export function handleTileCollection(player: Player, tilesToTake: Tile[], allPlayers: Player[], giftsPool: SecretGift[]): void {
  for (const tile of tilesToTake) {
    
    // Podnoszenie żetonu z kafelka
    if (tile.hasGift && giftsPool && giftsPool.length > 0) {
      const drawnGift = giftsPool.pop();
      if (drawnGift) {
        player.secretGifts.push(drawnGift);
        player.collectedGiftsCount = player.secretGifts.length;
      }
      tile.hasGift = false; 
    }

    // Interakcja z kryształami przeciwników
    if (tile.crystallizedBy && tile.crystallizedBy !== player.id) {
      const opponent = allPlayers.find(p => p.id === tile.crystallizedBy);
      const plusGiftIndex = player.secretGifts.findIndex(g => g.type.toLowerCase() === 'plus');

      if (plusGiftIndex !== -1) {
        // Zużycie żetonu tarczy ochronnej PLUS
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
 * Algorytm punktacji końcowej
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

      // Zliczamy ikony bezpośrednio dopasowane tekstowo
      player.collectedTiles.forEach(tile => {
        spiritCount += tile.icons.filter(icon => icon.trim().toLowerCase() === color.toLowerCase()).length;
      });

      // Sprawdzamy obecność ukrytego żetonu
      const hasMatchingGift = player.secretGifts.some(gift => gift.type.toLowerCase() === color.toLowerCase());
      if (hasMatchingGift) {
        spiritCount += 1;
      }

      playerTotalSymbols[player.id] = spiritCount;
      if (spiritCount > maxSymbolsFound) maxSymbolsFound = spiritCount;
    });

    players.forEach(player => {
      const playerScore = scores.find(s => s.playerId === player.id)!;
      const currentSymbols = playerTotalSymbols[player.id];

      // Przyznanie punktów za uzyskanie większości/remisu w danym kolorze
      if (currentSymbols === maxSymbolsFound && maxSymbolsFound > 0) {
        playerScore.colorPoints[color] = currentSymbols; 
      } else {
        playerScore.colorPoints[color] = 0;
      }

      // Kara -3 pkt za brak fizycznego kafelka w danym kolorze
      const hasPhysicalTiles = player.collectedTiles.some(t => t.spiritType.toLowerCase() === color.toLowerCase());
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
        natureCount += tile.icons.filter(icon => icon.trim().toLowerCase() === type).length;
      });

      const hasNatureGift = player.secretGifts.some(gift => gift.type.toLowerCase() === type);
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

  // 3. PODSUMOWANIE SCORE WYNIKU
  scores.forEach(score => {
    const sumColors = Object.values(score.colorPoints).reduce((a, b) => a + b, 0);
    const sumNature = score.naturePoints.fire + score.naturePoints.sun + score.naturePoints.moon;
    score.totalScore = sumColors + sumNature + score.penalties;
  });

  return scores;
}