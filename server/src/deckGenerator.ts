import { Tile, SpiritIconType } from './types'; // Dostosuj ścieżkę do swoich typów

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateInitialForest(): (Tile | null)[][] {
  const baseDeck: { spiritType: SpiritIconType; icons: string[] }[] = [
    { spiritType: 'Zielony', icons: ['spirit', 'moon'] },
    { spiritType: 'Zielony', icons: ['spirit', 'spirit'] },
    { spiritType: 'Zielony', icons: ['spirit', 'fire'] },
    { spiritType: 'Zielony', icons: ['spirit', 'sun'] },
    { spiritType: 'Zielony', icons: ['spirit'] },
    { spiritType: 'Szary', icons: ['spirit', 'spirit'] },
    { spiritType: 'Szary', icons: ['spirit', 'spirit'] },
    { spiritType: 'Szary', icons: ['spirit', 'sun'] },
    { spiritType: 'Szary', icons: ['spirit', 'moon'] },
    { spiritType: 'Czerwony', icons: ['spirit', 'spirit'] },
    { spiritType: 'Czerwony', icons: ['spirit', 'fire'] },
    { spiritType: 'Czerwony', icons: ['spirit', 'fire'] },
    { spiritType: 'Czerwony', icons: ['spirit', 'sun'] },
    { spiritType: 'Czerwony', icons: ['spirit', 'moon'] },
    { spiritType: 'Niebieski', icons: ['spirit', 'spirit'] },
    { spiritType: 'Niebieski', icons: ['spirit', 'spirit'] },
    { spiritType: 'Niebieski', icons: ['spirit', 'sun'] },
    { spiritType: 'Niebieski', icons: ['spirit', 'moon'] },
    { spiritType: 'Niebieski', icons: ['spirit', 'fire'] },
    { spiritType: 'Brązowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Brązowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Brązowy', icons: ['spirit', 'sun'] },
    { spiritType: 'Brązowy', icons: ['spirit', 'moon'] },
    { spiritType: 'Brązowy', icons: ['spirit', 'fire'] },
    { spiritType: 'Jasnozielony', icons: ['spirit', 'spirit'] },
    { spiritType: 'Jasnozielony', icons: ['spirit', 'spirit'] },
    { spiritType: 'Jasnozielony', icons: ['spirit'] },
    { spiritType: 'Jasnozielony', icons: ['spirit', 'sun'] },
    { spiritType: 'Jasnozielony', icons: ['spirit', 'moon'] },
    { spiritType: 'Jasnozielony', icons: ['spirit', 'fire'] },
    { spiritType: 'Żółty', icons: ['spirit', 'spirit'] },
    { spiritType: 'Żółty', icons: ['spirit', 'spirit'] },
    { spiritType: 'Żółty', icons: ['spirit'] },
    { spiritType: 'Żółty', icons: ['spirit', 'sun'] },
    { spiritType: 'Żółty', icons: ['spirit', 'moon'] },
    { spiritType: 'Żółty', icons: ['spirit', 'fire'] },
    { spiritType: 'Fioletowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Fioletowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Fioletowy', icons: ['spirit'] },
    { spiritType: 'Fioletowy', icons: ['spirit', 'sun'] },
    { spiritType: 'Fioletowy', icons: ['spirit', 'fire'] },
    { spiritType: 'Fioletowy', icons: ['spirit', 'moon'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'spirit'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'moon'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'sun'] },
    { spiritType: 'Jasnofioletowy', icons: ['spirit', 'fire'] },
  ];

  const colorMap: Record<string, string> = {
    'Zielony': '#2E7D32', 'Szary': '#757575', 'Czerwony': '#C62828',
    'Niebieski': '#1565C0', 'Brązowy': '#6D4C41', 'Jasnozielony': '#66BB6A',
    'Żółty': '#FBC02D', 'Fioletowy': '#6A1B9A', 'Jasnofioletowy': '#BA68C8'
  };

  let idCounter = 1;
  const fullDeck: Tile[] = baseDeck.map((bTile) => {
    // KLUCZOWE: Automatycznie podmieniamy 'spirit' na realną nazwę koloru (małymi literami)
    const normalizedIcons = bTile.icons.map(icon => 
      icon.toLowerCase() === 'spirit' ? bTile.spiritType.toLowerCase() : icon.toLowerCase()
    );

    return {
      id: `tile_${idCounter++}`,
      spiritType: bTile.spiritType,
      color: colorMap[bTile.spiritType] || '#ffffff',
      icons: normalizedIcons,
      hasGift: false,
      crystallizedBy: null
    };
  });

  const shuffledDeck = shuffle(fullDeck);

  const forest: (Tile | null)[][] = [[], [], [], []];
  let deckIndex = 0;
  
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      forest[row].push(shuffledDeck[deckIndex++] || null);
    }
  }

  const giftPositions = [
    { r: 0, c: 1 },  
    { r: 1, c: 2 },  
    { r: 2, c: 3 },  
    { r: 3, c: 4 },  
    { r: 0, c: 10 }, 
    { r: 1, c: 9 },  
    { r: 2, c: 8 },  
    { r: 3, c: 7 }   
  ];

  giftPositions.forEach(pos => {
    if (forest[pos.r] && forest[pos.r][pos.c]) {
      forest[pos.r][pos.c]!.hasGift = true;
    }
  });

  return forest;
}