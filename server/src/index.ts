import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameState, GiftContent } from './types';
import { generateInitialForest } from './deckGenerator';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

let gameState: GameState = {
  forest: [],
  players: [],
  currentPlayerIndex: 0,
  isFirstRound: true,
  turnPhase: 'TAKE_TILES',
  selectedTilesByCurrentPlayer: []
};

// Pula możliwych nagród ukrytych w żetonach darów dostosowana pod 9 typów duchów (małymi literami)
const GIFT_POOL: GiftContent[] = [
  'zielony', 'szary', 'czerwony', 'niebieski', 'brązowy', 
  'jasnozielony', 'żółty', 'fioletowy', 'jasnofioletowy',
  'fire', 'moon', 'sun', 'plus'
];

// Pula unikalnych kryształków dla wchodzących graczy
const CRYSTAL_VISUALS = ["💎", "🔮", "⭐", "🟢", "🟡", "🔴", "🔵", "❄️"];

function getRandomGift(): GiftContent {
  return GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
}

// Funkcja filtrująca stan gry, aby ukryć sekrety innych graczy przed nieuprawnionym socketem
function sendCensoredState(socketId: string) {
  const censoredPlayers = gameState.players.map(p => {
    if (p.id === socketId) {
      return p; // Twój socket -> widzisz swoje sekrety
    }
    return {
      ...p,
      secretGifts: [] // Inny socket -> ukrywamy zawartość żetonów przed rywalami
    };
  });

  if (socketId) {
    io.to(socketId).emit('gameStateUpdate', { ...gameState, players: censoredPlayers });
  }
}

function broadcastState() {
  gameState.players.forEach(p => {
    sendCensoredState(p.id);
  });
}

io.on('connection', (socket) => {
  console.log(`Połączono: ${socket.id}`);

  socket.on('joinGame', (playerName) => {
    if (gameState.forest.length === 0) {
      gameState.forest = generateInitialForest();
    }

    if (!gameState.players.some(p => p.id === socket.id)) {
      // Przydzielenie unikalnego kryształka na podstawie kolejności dołączania
      const crystalVisual = CRYSTAL_VISUALS[gameState.players.length % CRYSTAL_VISUALS.length];

      gameState.players.push({
        id: socket.id,
        name: playerName,
        collectedTiles: [],
        collectedGiftsCount: 0,
        secretGifts: [],
        crystals: 3,
        frozenCrystals: 0,
        crystalVisual: crystalVisual // Przypisanie wizualne do stanu gracza
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

    let crystalRejectedThisTurn = false;
    let requiredCrystalsForThisMove = 0;

    selectedTiles.forEach(pos => {
      const tile = gameState.forest[pos.row]?.[pos.col];
      if (tile && tile.crystallizedBy && tile.crystallizedBy !== activePlayer.id) {
        requiredCrystalsForThisMove += 1;
      }
    });

    if (activePlayer.crystals < requiredCrystalsForThisMove) {
      socket.emit('error', `Brak kryształów na przejęcie kafelka przeciwnika!`);
      return;
    }

    selectedTiles.forEach(pos => {
      const tile = gameState.forest[pos.row]?.[pos.col];
      if (tile) {
        if (tile.crystallizedBy) {
          if (tile.crystallizedBy !== activePlayer.id) {
            activePlayer.crystals -= 1;
            crystalRejectedThisTurn = true; 
            const owner = gameState.players.find(p => p.id === tile.crystallizedBy);
            if (owner) owner.crystals += 1;
          } else {
            activePlayer.frozenCrystals += 1;
          }
          tile.crystallizedBy = null;
        }

        // MECHANIKA ZBIERANIA ŻETONU DARU
        if (tile.hasGift) {
          const reward = getRandomGift();
          activePlayer.secretGifts.push(reward);
          activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;
          tile.hasGift = false;
        }

        activePlayer.collectedTiles.push(tile);
        gameState.forest[pos.row][pos.col] = null;
      }
    });

    // Zsuwanie lasu po pobraniu kafelków
    for (let r = 0; r < 4; r++) {
      gameState.forest[r] = gameState.forest[r].filter(tile => tile !== null);
    }

    gameState.selectedTilesByCurrentPlayer = [];

    if (crystalRejectedThisTurn) {
      endTurn(); 
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
    if (gameState.isFirstRound && gameState.currentPlayerIndex === 0) {
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
    }
    broadcastState();
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => console.log(`Backend żetonów ruszył na porcie ${PORT}`));