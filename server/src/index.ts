import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameState, GiftContent } from './types';
import { generateInitialForest } from './deckGenerator';

const app = express();
const httpServer = createServer(app);

// POPRAWKA 1: Dynamiczny CORS akceptujący połączenia chmurowe oraz protokoły WebSocket
const io = new Server(httpServer, {
  cors: { 
    origin: "*", // W chmurze zezwalamy na połączenia z Twojego hostingu frontendu (np. Vercel)
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'] // Wymuszenie stabilnych transportów dla chmury Render
});

// Pełna, unikalna pula 13 żetonów darów lasu z instrukcji
const FULL_GIFT_POOL: GiftContent[] = [
  'zielony', 'szary', 'czerwony', 'niebieski', 'brązowy', 
  'jasnozielony', 'żółty', 'fioletowy', 'jasnofioletowy',
  'fire', 'moon', 'sun', 'plus'
];

let gameState: GameState & { giftsDeck: GiftContent[] } = {
  forest: [],
  players: [],
  currentPlayerIndex: 0,
  isFirstRound: true,
  turnPhase: 'TAKE_TILES',
  selectedTilesByCurrentPlayer: [],
  giftsDeck: []
};

const CRYSTAL_VISUALS = ["💎", "🔮", "⭐", "🟢", "🟡", "🔴", "🔵", "❄️"];

function initializeGiftsDeck() {
  const deck = [...FULL_GIFT_POOL];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  gameState.giftsDeck = deck;
}

// Gra kończy się TYLKO I WYŁĄCZNIE wtedy, gdy nie ma więcej kafelków w lesie
function checkGameOver(): boolean {
  const isForestEmpty = gameState.forest.every(row => row.length === 0);
  if (isForestEmpty) {
    calculateFinalScores();
    return true;
  }
  return false;
}

// Oficjalne podliczanie punktów na podstawie instrukcji gry "Leśne Duchy"
function calculateFinalScores() {
  const spiritTypes = ['Zielony', 'Szary', 'Czerwony', 'Niebieski', 'Brązowy', 'Jasnozielony', 'Żółty', 'Fioletowy', 'Jasnofioletowy'];
  const natureTypes = ['fire', 'moon', 'sun'];

  // 1. Przygotowanie struktury danych i zliczenie ikon oraz fizycznych kafelków u każdego gracza
  const playersData = gameState.players.map(player => {
    const spiritCounts: Record<string, number> = {};
    const spiritHasTiles: Record<string, boolean> = {};
    const natureCounts: Record<string, number> = {};
    const natureHasTiles: Record<string, boolean> = {};

    spiritTypes.forEach(type => {
      const target = type.toLowerCase();
      let tileIcons = 0;
      player.collectedTiles.forEach(tile => {
        tileIcons += tile.icons.filter(icon => icon.toLowerCase() === target).length;
      });

      spiritHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.toLowerCase() === target).length;
      spiritCounts[type] = tileIcons + tokenIcons;
    });

    natureTypes.forEach(type => {
      let tileIcons = 0;
      player.collectedTiles.forEach(tile => {
        tileIcons += tile.icons.filter(icon => icon.toLowerCase() === type).length;
      });

      natureHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.toLowerCase() === type).length;
      natureCounts[type] = tileIcons + tokenIcons;
    });

    return {
      id: player.id,
      name: player.name,
      collectedTilesCount: player.collectedTiles.length,
      spiritCounts,
      spiritHasTiles,
      natureCounts,
      natureHasTiles,
      finalSpiritPoints: {} as Record<string, number>,
      finalNaturePoints: {} as Record<string, number>,
      penalties: 0
    };
  });

  // 2. Szukanie maksimów i przyznawanie punktów oraz kar dla DUCHÓW
  spiritTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.spiritCounts[type]));

    playersData.forEach(p => {
      if (p.spiritCounts[type] === maxIcons && maxIcons > 0) {
        p.finalSpiritPoints[type] = p.spiritCounts[type];
      } else {
        p.finalSpiritPoints[type] = 0;
      }

      if (!p.spiritHasTiles[type]) {
        p.penalties += 3; // Żetony nie chronią przed karą -3 pkt za brak fizycznego kaflowego wizerunku
      }
    });
  });

  // 3. Szukanie maksimów i przyznawanie punktów oraz kar dla ŻYWIOŁÓW
  natureTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.natureCounts[type]));

    playersData.forEach(p => {
      if (p.natureCounts[type] === maxIcons && maxIcons > 0) {
        p.finalNaturePoints[type] = p.natureCounts[type];
      } else {
        p.finalNaturePoints[type] = 0;
      }

      if (!p.natureHasTiles[type]) {
        p.penalties += 3;
      }
    });
  });

  // 4. Obliczanie ostatecznego wyniku końcowego
  gameState.scores = playersData.map(p => {
    const sumSpirits = Object.values(p.finalSpiritPoints).reduce((a, b) => a + b, 0);
    const sumNature = Object.values(p.finalNaturePoints).reduce((a, b) => a + b, 0);
    const totalScore = sumSpirits + sumNature - p.penalties;

    return {
      playerId: p.id,
      playerName: p.name,
      colorPoints: p.finalSpiritPoints,
      naturePoints: p.finalNaturePoints,
      penalties: p.penalties,
      totalScore: totalScore
    };
  });

  // Rozstrzyganie remisów: przy równych punktach wygrywa ten, kto ma MNIEJ fizycznych kafelków
  gameState.scores.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const pA = playersData.find(p => p.id === a.playerId);
    const pB = playersData.find(p => p.id === b.playerId);
    return (pA?.collectedTilesCount || 0) - (pB?.collectedTilesCount || 0);
  });

  gameState.isGameOver = true;
}

function sendCensoredState(socketId: string) {
  const censoredPlayers = gameState.players.map(p => {
    if (p.id === socketId) return p;
    return { ...p, secretGifts: [] };
  });
  if (socketId) {
    io.to(socketId).emit('gameStateUpdate', { ...gameState, players: censoredPlayers });
  }
}

function broadcastState() {
  gameState.players.forEach(p => sendCensoredState(p.id));
}

io.on('connection', (socket) => {
  console.log(`Połączono: ${socket.id}`);

  socket.on('joinGame', (playerName) => {
    if (gameState.forest.length === 0) {
      initializeGiftsDeck();
      gameState.forest = generateInitialForest(gameState.giftsDeck);
    }

    if (!gameState.players.some(p => p.id === socket.id)) {
      const crystalVisual = CRYSTAL_VISUALS[gameState.players.length % CRYSTAL_VISUALS.length];
      gameState.players.push({
        id: socket.id,
        name: playerName,
        collectedTiles: [],
        collectedGiftsCount: 0,
        secretGifts: [],
        crystals: 3,
        frozenCrystals: 0,
        crystalVisual: crystalVisual
      });
    }
    broadcastState();
  });

  socket.on('updateLiveSelection', (selectedTiles: { row: number; col: number }[]) => {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id) return;
    gameState.selectedTilesByCurrentPlayer = selectedTiles;
    broadcastState();
  });

  socket.on('makeMove', (selectedTiles: { row: number; col: number }[]) => {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || gameState.turnPhase !== 'TAKE_TILES') return;

    if (gameState.isFirstRound && selectedTiles.length > 1) {
      socket.emit('error', `W pierwszym ruchu gry możesz dobrać maksymalnie 1 kafelek!`);
      return;
    }

    let opponentCrystalsCount = 0;
    let interruptedPlayerId: string | null = null;

    selectedTiles.forEach(pos => {
      const tile = gameState.forest[pos.row]?.[pos.col];
      if (tile && tile.crystallizedBy && tile.crystallizedBy !== activePlayer.id) {
        opponentCrystalsCount++;
        interruptedPlayerId = tile.crystallizedBy;
      }
    });

    if (opponentCrystalsCount > 1) {
      socket.emit('error', `Możesz odrzucić maksymalnie 1 kryształek przeciwnika w swojej turze!`);
      return;
    }

    if (opponentCrystalsCount === 1 && activePlayer.crystals < 1) {
      socket.emit('error', `Nie masz kryształków, aby odrzucić kryształ rywala!`);
      return;
    }

    let cutTurnShort = false;

    selectedTiles.forEach(pos => {
      const tile = gameState.forest[pos.row]?.[pos.col];
      if (tile) {
        if (tile.crystallizedBy) {
          if (tile.crystallizedBy !== activePlayer.id) {
            const plusTokenIdx = activePlayer.secretGifts.indexOf('plus');
            if (plusTokenIdx > -1) {
              activePlayer.secretGifts.splice(plusTokenIdx, 1);
              activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;
            } else {
              activePlayer.crystals -= 1;
            }

            const owner = gameState.players.find(p => p.id === tile.crystallizedBy);
            if (owner) owner.crystals += 1;

            cutTurnShort = true;
          } else {
            activePlayer.frozenCrystals += 1;
          }
          tile.crystallizedBy = null;
        }

        if (tile.hasGift && tile.tileGift) {
          activePlayer.secretGifts.push(tile.tileGift);
          activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;

          if (tile.tileGift === 'plus' && activePlayer.crystals === 0) {
            activePlayer.crystals += 1;
          }

          tile.hasGift = false;
          tile.tileGift = null;
        }

        activePlayer.collectedTiles.push(tile);
        gameState.forest[pos.row][pos.col] = null;
      }
    });

    for (let r = 0; r < 4; r++) {
      gameState.forest[r] = gameState.forest[r].filter(tile => tile !== null);
    }

    gameState.selectedTilesByCurrentPlayer = [];

    if (checkGameOver()) {
      broadcastState();
      return;
    }

    if (cutTurnShort && interruptedPlayerId) {
      activePlayer.crystals += activePlayer.frozenCrystals;
      activePlayer.frozenCrystals = 0;

      const nextPlayerIdx = gameState.players.findIndex(p => p.id === interruptedPlayerId);
      if (nextPlayerIdx > -1) {
        gameState.currentPlayerIndex = nextPlayerIdx;
      } else {
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
      }
      
      gameState.turnPhase = 'TAKE_TILES';
      if (gameState.isFirstRound) gameState.isFirstRound = false;
    } else {
      gameState.turnPhase = 'PLACE_CRYSTAL'; 
    }

    broadcastState();
  });

  socket.on('placeCrystal', (pos: { row: number; col: number } | null) => {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || gameState.turnPhase !== 'PLACE_CRYSTAL') return;

    if (pos === null) {
      endTurn();
      broadcastState();
      return;
    }

    const tile = gameState.forest[pos.row]?.[pos.col];
    if (!tile) return;

    if (tile.crystallizedBy === activePlayer.id) {
      tile.crystallizedBy = null;
      activePlayer.crystals += 1; 
      broadcastState();
      return;
    }

    if (!tile.crystallizedBy && activePlayer.crystals > 0) {
      tile.crystallizedBy = activePlayer.id;
      activePlayer.crystals -= 1;
      endTurn(); 
      broadcastState();
      return;
    }
  });

  function endTurn() {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer) {
      activePlayer.crystals += activePlayer.frozenCrystals;
      activePlayer.frozenCrystals = 0;
    }
    if (gameState.isFirstRound) {
      gameState.isFirstRound = false;
    }
    gameState.selectedTilesByCurrentPlayer = [];
    gameState.turnPhase = 'TAKE_TILES';
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  }

  socket.on('disconnect', () => {
    gameState.forest.forEach(row => {
      row.forEach(tile => {
        if (tile && tile.crystallizedBy === socket.id) tile.crystallizedBy = null;
      });
    });
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    if (gameState.players.length === 0) {
      gameState.forest = [];
      gameState.isFirstRound = true;
      gameState.currentPlayerIndex = 0;
      gameState.turnPhase = 'TAKE_TILES';
      gameState.selectedTilesByCurrentPlayer = [];
      gameState.giftsDeck = [];
    }
    broadcastState();
  });
});

// POPRAWKA 2: Wykorzystanie zmiennej środowiskowej PORT dostarczanej automatycznie przez Render.com
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Serwer gry działa dynamicznie na porcie ${PORT}`));