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

function createGiftsPool(): SecretGift[] {
  const types = ['fire', 'sun', 'moon', 'zielony', 'niebieski', 'czerwony', 'żółty', 'fioletowy', 'plus'];
  return types.map((type, i) => ({ id: `gift_${i + 1}`, type }));
}

function createInitialRoomState(): ExtendedGameState {
  return {
    forest: [],
    players: [],
    giftsPool: [],
    currentPlayerIndex: 0,
    isFirstTurn: true,
    turnPhase: 'TAKE_TILES',
    selectedTilesByCurrentPlayer: []
  };
}

function checkGameOver(room: ExtendedGameState): boolean {
  const isForestEmpty = room.forest.every(row => row.length === 0);
  if (isForestEmpty) {
    calculateFinalScores(room);
    return true;
  }
  return false;
}

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
        if (tile && tile.icons) tileIcons += tile.icons.filter(icon => icon.toLowerCase() === target).length;
      });
      spiritHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.type.toLowerCase() === target).length;
      spiritCounts[type] = tileIcons + tokenIcons;
    });

    natureTypes.forEach(type => {
      let tileIcons = 0;
      player.collectedTiles.forEach(tile => {
        if (tile && tile.icons) tileIcons += tile.icons.filter(icon => icon.toLowerCase() === type).length;
      });
      natureHasTiles[type] = tileIcons > 0;
      const tokenIcons = player.secretGifts.filter(g => g.type.toLowerCase() === type).length;
      natureCounts[type] = tileIcons + tokenIcons;
    });

    return { id: player.id, name: player.name, collectedTilesCount: player.collectedTiles.length, spiritCounts, spiritHasTiles, natureCounts, natureHasTiles, finalSpiritPoints: {} as Record<string, number>, finalNaturePoints: { fire: 0, sun: 0, moon: 0 }, penalties: 0 };
  });

  spiritTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.spiritCounts[type]));
    playersData.forEach(p => {
      p.finalSpiritPoints[type] = (p.spiritCounts[type] === maxIcons && maxIcons > 0) ? p.spiritCounts[type] : 0;
      if (!p.spiritHasTiles[type]) p.penalties += 3; 
    });
  });

  natureTypes.forEach(type => {
    const maxIcons = Math.max(...playersData.map(p => p.natureCounts[type as 'fire'|'sun'|'moon']));
    playersData.forEach(p => {
      p.finalNaturePoints[type as 'fire'|'sun'|'moon'] = (p.natureCounts[type as 'fire'|'sun'|'moon'] === maxIcons && maxIcons > 0) ? p.natureCounts[type as 'fire'|'sun'|'moon'] : 0;
      if (!p.natureHasTiles[type]) p.penalties += 3;
    });
  });

  room.scores = playersData.map(p => {
    const totalScore = Object.values(p.finalSpiritPoints).reduce((a, b) => a + b, 0) + Object.values(p.finalNaturePoints).reduce((a, b) => a + b, 0) - p.penalties;
    return { playerId: p.id, playerName: p.name, colorPoints: p.finalSpiritPoints, naturePoints: p.finalNaturePoints, penalties: p.penalties, totalScore };
  });
  
  // Rozstrzyganie remisów: mniej zebranych kafelków = wyższa pozycja
  room.scores.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const pA = playersData.find(p => p.id === a.playerId);
    const pB = playersData.find(p => p.id === b.playerId);
    return (pA?.collectedTilesCount || 0) - (pB?.collectedTilesCount || 0);
  });

  room.isGameOver = true;
}

function broadcastRoomState(roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.forEach(p => {
    const censoredPlayers = room.players.map(pl => (pl.id === p.id ? pl : { ...pl, secretGifts: [] }));
    io.to(p.id).emit('gameStateUpdate', { ...room, players: censoredPlayers });
  });
}

function endTurn(room: ExtendedGameState) {
  const activePlayer = room.players[room.currentPlayerIndex];
  if (activePlayer) {
    activePlayer.crystals += activePlayer.frozenCrystals;
    activePlayer.frozenCrystals = 0;
  }
  // Limit "1 kafelek" obowiązuje TYLKO w pierwszym ruchu całej gry (gracz rozpoczynający).
  // Po zakończeniu pierwszej tury wyłączamy go na zawsze.
  if (room.isFirstTurn) {
    room.isFirstTurn = false;
  }
  room.selectedTilesByCurrentPlayer = [];
  room.turnPhase = 'TAKE_TILES';
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
}

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    const name = typeof data === 'object' ? data.playerName : data;
    const code = (typeof data === 'object' && data.roomCode ? data.roomCode : 'GLOBAL').toUpperCase();
    socket.join(code);
    playerToRoomMap[socket.id] = code;
    if (!rooms[code]) {
        rooms[code] = createInitialRoomState();
        rooms[code].forest = generateInitialForest(createGiftsPool());
    }
    if (!rooms[code].players.some(p => p.id === socket.id)) {
      rooms[code].players.push({ id: socket.id, name, collectedTiles: [], collectedGiftsCount: 0, secretGifts: [], crystals: 3, frozenCrystals: 0, crystalVisual: CRYSTAL_VISUALS[rooms[code].players.length % CRYSTAL_VISUALS.length] });
    }
    broadcastRoomState(code);
  });

  socket.on('makeMove', (selectedTiles: { row: number; col: number }[]) => {
    const code = playerToRoomMap[socket.id];
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const activePlayer = room.players[room.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || room.turnPhase !== 'TAKE_TILES') return;

    // 1. Walidacja ilościowa ruchu
    if (room.isFirstTurn && selectedTiles.length > 1) { 
        socket.emit('error', 'W pierwszym ruchu gry można wziąć tylko 1 kafelek!'); return; 
    }
    if (!room.isFirstTurn && selectedTiles.length > 2) { 
        socket.emit('error', 'Maksymalnie 2 kafle!'); return; 
    }

    // Pobieramy referencje do rzeczywistych kafelków, które gracz chce wziąć
    const tilesToTake: Tile[] = [];
    for (const pos of selectedTiles) {
      const tile = room.forest[pos.row]?.[pos.col];
      if (!tile) {
        socket.emit('error', 'Wybrany kafelek nie istnieje!');
        return;
      }
      tilesToTake.push(tile);
    }

    // 2. Walidacja sumy symboli duchów (robimy to od razu na stabilnych danych)
    const NATURE_ICONS = ['fire', 'sun', 'moon'];
    let totalSpiritIcons = 0;

    for (const tile of tilesToTake) {
      if (tile.icons) {
        totalSpiritIcons += tile.icons.filter(icon => !NATURE_ICONS.includes(icon.toLowerCase())).length;
      }
    }

    if (totalSpiritIcons > 2) {
        socket.emit('error', `Łączna liczba symboli duchów nie może przekraczać 2! (Wybrano: ${totalSpiritIcons})`);
        return;
    }

    // 3. Bezpieczna walidacja krawędzi (łańcuchowa)
    // Tworzymy kopię lasu, z której będziemy eliminować kafelki po ich unikalnym ID
    let tempForest = room.forest.map(row => [...row]);

    for (const tileToValidate of tilesToTake) {
      // Szukamy, w którym rzędzie w tempForest znajduje się nasz kafelek
      let foundAndValid = false;

      for (let r = 0; r < tempForest.length; r++) {
        const row = tempForest[r];
        const idx = row.findIndex(t => t && t.id === tileToValidate.id);

        if (idx !== -1) {
          // Kafelek znaleziony. Teraz sprawdzamy czy leży na krawędzi swojego wiersza
          if (idx === 0 || idx === row.length - 1) {
            row.splice(idx, 1); // Usuwamy go z symulacji, odsłaniając kolejny kafelek jako krawędź
            foundAndValid = true;
            break;
          }
        }
      }

      if (!foundAndValid) {
        socket.emit('error', 'Możesz dobierać kafelki tylko z krawędzi (również w łańcuchu)!');
        return;
      }
    }

    // --- SPRAWDZENIE CZY GRACZ MA DOŚĆ KRYSZTAŁÓW NA PRZEJĘCIA ---
    let requiredCrystals = 0;
    tilesToTake.forEach(tile => {
      if (tile.crystallizedBy && tile.crystallizedBy !== activePlayer.id) {
        requiredCrystals++;
      }
    });

    const plusTokensCount = activePlayer.secretGifts.filter(g => g.type === 'plus').length;
    const effectiveCost = Math.max(0, requiredCrystals - plusTokensCount);

    if (activePlayer.crystals < effectiveCost) {
      socket.emit('error', 'Brak kryształów lub żetonów plus na przejęcie kafelka przeciwnika!');
      return;
    }

    // 4. Wykonanie ruchu na prawdziwym stanie gry
    let cutTurnShort = false;
    selectedTiles.forEach(pos => {
      const tile = room.forest[pos.row]?.[pos.col];
      if (tile) {
        if (tile.crystallizedBy) {
          if (tile.crystallizedBy !== activePlayer.id) {
            const plusIdx = activePlayer.secretGifts.findIndex(g => g.type === 'plus');
            if (plusIdx > -1) {
              activePlayer.secretGifts.splice(plusIdx, 1); 
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
        if (tile.hasGift && tile.tileGift) { 
            activePlayer.secretGifts.push(tile.tileGift); 
            tile.hasGift = false; 
            tile.tileGift = null; 
        }
        activePlayer.collectedTiles.push(tile);
        room.forest[pos.row][pos.col] = null;
      }
    });

    room.forest.forEach((row, i) => room.forest[i] = row.filter(t => t !== null));
    activePlayer.collectedGiftsCount = activePlayer.secretGifts.length;
    room.selectedTilesByCurrentPlayer = [];

    if (checkGameOver(room)) { broadcastRoomState(code); return; }

    if (cutTurnShort) {
       endTurn(room);
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

    // Przełożenie własnego kryształu (kliknięcie na swój ściąga go i nie kończy tury)
    if (tile.crystallizedBy === activePlayer.id) {
      tile.crystallizedBy = null;
      activePlayer.crystals += 1; 
      broadcastRoomState(code);
      return;
    }

    // Kładzenie na dowolnym wolnym polu (brak walidacji krawędzi)
    if (!tile.crystallizedBy && activePlayer.crystals > 0) {
      tile.crystallizedBy = activePlayer.id;
      activePlayer.crystals -= 1;
      endTurn(room); 
      broadcastRoomState(code);
      return;
    }
  });

  socket.on('disconnect', () => {
    const code = playerToRoomMap[socket.id];
    if (code && rooms[code]) {
        rooms[code].forest.forEach(row => {
          row.forEach(tile => {
            if (tile && tile.crystallizedBy === socket.id) tile.crystallizedBy = null;
          });
        });
        rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
        if (rooms[code].players.length === 0) delete rooms[code];
        else broadcastRoomState(code);
    }
    delete playerToRoomMap[socket.id];
  });
});

httpServer.listen(process.env.PORT || 3000);