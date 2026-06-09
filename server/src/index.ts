import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameState, Tile, SecretGift, Player, PlayerScore } from './types';
import { generateInitialForest } from './deckGenerator';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const CRYSTAL_VISUALS = ["💎", "🔮", "⭐", "🟢", "🟡", "🔴", "🔵", "❄️"];

type ExtendedGameState = GameState & {
  isGameOver?: boolean;
  scores?: PlayerScore[];
};

const rooms: Record<string, ExtendedGameState> = {};
const playerToRoomMap: Record<string, string> = {};

// Pula darów dostępna w grze (8 kafelków z darami na starcie)
function createGiftsPool(): SecretGift[] {
  const types = ['fire', 'sun', 'moon', 'zielony', 'niebieski', 'czerwony', 'żółty', 'fioletowy'];
  return types.map((type, i) => ({ id: `gift_${i + 1}`, type }));
}

function createInitialRoomState(): ExtendedGameState {
  return {
    forest: [],
    players: [],
    giftsPool: [],
    currentPlayerIndex: 0,
    isFirstRound: true,
    turnPhase: 'TAKE_TILES',
    selectedTilesByCurrentPlayer: []
  };
}

// Gra kończy się TYLKO I WYŁĄCZNIE wtedy, gdy nie ma więcej kafelków w lesie
function checkGameOver(room: ExtendedGameState): boolean {
  const isForestEmpty = room.forest.every(row => row.length === 0);
  if (isForestEmpty) {
    calculateFinalScores(room);
    return true;
  }
  return false;
}

// Oficjalne podliczanie punktów na podstawie instrukcji gry "Leśne Duchy"
function calculateFinalScores(room: ExtendedGameState) {
  const spiritTypes = ['Zielony', 'Szary', 'Czerwony', 'Niebieski', 'Brązowy', 'Jasnozielony', 'Żółty', 'Fioletowy', 'Jasnofioletowy'];
  const natureTypes = ['fire', 'moon', 'sun'];

  const playersData = room.players.map(player => {
    const spiritCounts: Record<string, number> = {};
    const spiritHasTiles: Record<string, boolean> = {};
    const natureCounts: Record<string, number> = { fire: 0, moon: 0, sun: 0 };
    const natureHasTiles: Record<string, boolean> = { fire: false, moon: false, sun: false };

    spiritTypes.forEach(type => {
      const target = type.toLowerCase();
      let tileIcons = 0;
      player.collectedTiles.forEach(tile => {
        if (tile && tile.icons) {
          tileIcons += tile.icons.filter(icon => icon.toLowerCase() === target).length;
        }
      });

      spiritHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.type.toLowerCase() === target).length;
      spiritCounts[type] = tileIcons + tokenIcons;
    });

    natureTypes.forEach(type => {
      let tileIcons = 0;
      player.collectedTiles.forEach(tile => {
        if (tile && tile.icons) {
          tileIcons += tile.icons.filter(icon => icon.toLowerCase() === type).length;
        }
      });

      natureHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.type.toLowerCase() === type).length;
      natureCounts[type] = tileIcons + tokenIcons;
    });

    return {
      id: player.id,
      name: player.name,
      collectedTilesCount: player.collectedTiles.length,
      spiritCounts,
      spiritHasTiles,
      natureCounts: natureCounts as { fire: number; sun: number; moon: number },
      natureHasTiles,
      finalSpiritPoints: {} as Record<string, number>,
      finalNaturePoints: { fire: 0, sun: 0, moon: 0 },
      penalties: 0
    };
  });

  spiritTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.spiritCounts[type]));

    playersData.forEach(p => {
      if (p.spiritCounts[type] === maxIcons && maxIcons > 0) {
        p.finalSpiritPoints[type] = p.spiritCounts[type];
      } else {
        p.finalSpiritPoints[type] = 0;
      }

      if (!p.spiritHasTiles[type]) {
        p.penalties += 3; 
      }
    });
  });

  natureTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.natureCounts[type as 'fire'|'sun'|'moon']));

    playersData.forEach(p => {
      const currentCount = p.natureCounts[type as 'fire'|'sun'|'moon'];
      if (currentCount === maxIcons && maxIcons > 0) {
        p.finalNaturePoints[type as 'fire'|'sun'|'moon'] = currentCount;
      } else {
        p.finalNaturePoints[type as 'fire'|'sun'|'moon'] = 0;
      }

      if (!p.natureHasTiles[type]) {
        p.penalties += 3;
      }
    });
  });

  room.scores = playersData.map(p => {
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

  room.scores.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const pA = playersData.find(p => p.id === a.playerId);
    const pB = playersData.find(p => p.id === b.playerId);
    return (pA?.collectedTilesCount || 0) - (pB?.collectedTilesCount || 0);
  });

  room.isGameOver = true;
}

function sendCensoredState(roomCode: string, socketId: string) {
  const room = rooms[roomCode];
  if (!room) return;

  const censoredPlayers = room.players.map(p => {
    if (p.id === socketId) return p;
    return { ...p, secretGifts: [] };
  });

  io.to(socketId).emit('gameStateUpdate', { ...room, players: censoredPlayers });
}

function broadcastRoomState(roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.forEach(p => sendCensoredState(roomCode, p.id));
}

io.on('connection', (socket) => {
  console.log(`Połączono: ${socket.id}`);

  socket.on('joinGame', (data: { playerName: string; roomCode?: string } | string) => {
    let name = '';
    let code = 'GLOBAL';

    if (typeof data === 'object' && data !== null) {
      name = data.playerName;
      code = (data.roomCode || 'GLOBAL').trim().toUpperCase();
    } else {
      name = data;
    }
    
    socket.join(code);
    playerToRoomMap[socket.id] = code;

    if (!rooms[code]) {
      rooms[code] = createInitialRoomState();
    }

    const room = rooms[code];

    if (room.forest.length === 0) {
      const giftsPool = createGiftsPool();
      room.forest = generateInitialForest(giftsPool);
    }

    if (!room.players.some(p => p.id === socket.id)) {
      const crystalVisual = CRYSTAL_VISUALS[room.players.length % CRYSTAL_VISUALS.length];
      room.players.push({
        id: socket.id,
        name: name,
        collectedTiles: [],
        collectedGiftsCount: 0,
        secretGifts: [],
        crystals: 3,
        frozenCrystals: 0,
        crystalVisual: crystalVisual
      });
    }
    broadcastRoomState(code);
  });

  socket.on('updateLiveSelection', (selectedTiles: { row: number; col: number }[]) => {
    const code = playerToRoomMap[socket.id];
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    const activePlayer = room.players[room.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id) return;
    
    room.selectedTilesByCurrentPlayer = selectedTiles;
    broadcastRoomState(code);
  });

  socket.on('makeMove', (selectedTiles: { row: number; col: number }[]) => {
    const code = playerToRoomMap[socket.id];
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    const activePlayer = room.players[room.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || room.turnPhase !== 'TAKE_TILES') return;

    if (room.isFirstRound && selectedTiles.length > 1) {
      socket.emit('error', `W pierwszym ruchu gry możesz dobrać maksymalnie 1 kafelek!`);
      return;
    }

    let opponentCrystalsCount = 0;
    let interruptedPlayerId: string | null = null;

    selectedTiles.forEach(pos => {
      const tile = room.forest[pos.row]?.[pos.col];
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
      const tile = room.forest[pos.row]?.[pos.col];
      if (tile) {
        if (tile.crystallizedBy) {
          if (tile.crystallizedBy !== activePlayer.id) {
            // Sprawdź czy gracz ma żeton 'plus' — jeśli tak, użyj go zamiast kryształu
            const plusTokenIdx = activePlayer.secretGifts.findIndex(g => g.type === 'plus');
            if (plusTokenIdx > -1) {
              activePlayer.secretGifts.splice(plusTokenIdx, 1);
              activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;
            } else {
              activePlayer.crystals -= 1;
            }

            const owner = room.players.find(p => p.id === tile.crystallizedBy);
            if (owner) owner.crystals += 1;

            cutTurnShort = true;
          } else {
            activePlayer.frozenCrystals += 1;
          }
          tile.crystallizedBy = null;
        }

        // Obsługa daru — tileGift to SecretGift | null
        if (tile.hasGift && tile.tileGift) {
          activePlayer.secretGifts.push(tile.tileGift);
          activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;

          // Bonus 'plus': jeśli gracz nie ma kryształów, dostaje 1
          if (tile.tileGift.type === 'plus' && activePlayer.crystals === 0) {
            activePlayer.crystals += 1;
          }

          tile.hasGift = false;
          tile.tileGift = null;
        }

        activePlayer.collectedTiles.push(tile);
        room.forest[pos.row][pos.col] = null;
      }
    });

    for (let r = 0; r < 4; r++) {
      room.forest[r] = room.forest[r].filter(tile => tile !== null);
    }

    room.selectedTilesByCurrentPlayer = [];

    if (checkGameOver(room)) {
      broadcastRoomState(code);
      return;
    }

    if (cutTurnShort && interruptedPlayerId) {
      activePlayer.crystals += activePlayer.frozenCrystals;
      activePlayer.frozenCrystals = 0;

      const nextPlayerIdx = room.players.findIndex(p => p.id === interruptedPlayerId);
      if (nextPlayerIdx > -1) {
        room.currentPlayerIndex = nextPlayerIdx;
      } else {
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
      }
      
      room.turnPhase = 'TAKE_TILES';
      if (room.isFirstRound) room.isFirstRound = false;
    } else {
      room.turnPhase = 'PLACE_CRYSTAL'; 
    }

    broadcastRoomState(code);
  });

  socket.on('placeCrystal', (pos: { row: number; col: number } | null) => {
    const code = playerToRoomMap[socket.id];
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    const activePlayer = room.players[room.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || room.turnPhase !== 'PLACE_CRYSTAL') return;

    if (pos === null) {
      endTurn(room);
      broadcastRoomState(code);
      return;
    }

    const tile = room.forest[pos.row]?.[pos.col];
    if (!tile) return;

    if (tile.crystallizedBy === activePlayer.id) {
      tile.crystallizedBy = null;
      activePlayer.crystals += 1; 
      broadcastRoomState(code);
      return;
    }

    if (!tile.crystallizedBy && activePlayer.crystals > 0) {
      tile.crystallizedBy = activePlayer.id;
      activePlayer.crystals -= 1;
      endTurn(room); 
      broadcastRoomState(code);
      return;
    }
  });

  function endTurn(room: ExtendedGameState) {
    const activePlayer = room.players[room.currentPlayerIndex];
    if (activePlayer) {
      activePlayer.crystals += activePlayer.frozenCrystals;
      activePlayer.frozenCrystals = 0;
    }
    if (room.isFirstRound) {
      room.isFirstRound = false;
    }
    room.selectedTilesByCurrentPlayer = [];
    room.turnPhase = 'TAKE_TILES';
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  }

  socket.on('disconnect', () => {
    const code = playerToRoomMap[socket.id];
    if (code && rooms[code]) {
      const room = rooms[code];
      room.forest.forEach(row => {
        row.forEach(tile => {
          if (tile && tile.crystallizedBy === socket.id) tile.crystallizedBy = null;
        });
      });
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        delete rooms[code];
      } else {
        broadcastRoomState(code);
      }
    }
    delete playerToRoomMap[socket.id];
    console.log(`Rozłączono: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Serwer gry działa dynamicznie na porcie ${PORT}`));