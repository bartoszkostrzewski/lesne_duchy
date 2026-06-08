import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = "https://lesne-duchy.onrender.com" || "http://localhost:3000";

const socket: Socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
});

export default function App() {
  const [gameState, setGameState] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [selectedTiles, setSelectedTiles] = useState<{ row: number; col: number }[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    socket.on('gameStateUpdate', (state: any) => {
      setGameState(state);
      setSelectedTiles([]);
      setErrorMessage('');
    });

    socket.on('error', (msg: string) => {
      setErrorMessage(msg);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('error');
    };
  }, []);

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    const codeToSend = roomCode.trim() ? roomCode.trim().toUpperCase() : 'GLOBAL';
    
    socket.emit('joinGame', { playerName: playerName.trim(), roomCode: codeToSend });
    setActiveRoom(codeToSend);
    setIsJoined(true);
  };

  const handleTileClick = (row: number, col: number) => {
    if (!gameState) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id || gameState.turnPhase !== 'TAKE_TILES') return;

    const isAlreadySelected = selectedTiles.some(t => t.row === row && t.col === col);
    let newSelection = [...selectedTiles];

    if (isAlreadySelected) {
      newSelection = newSelection.filter(t => !(t.row === row && t.col === col));
    } else {
      newSelection.push({ row, col });
    }

    setSelectedTiles(newSelection);
    socket.emit('updateLiveSelection', newSelection);
  };

  const handleConfirmMove = () => {
    if (selectedTiles.length === 0) return;
    socket.emit('makeMove', selectedTiles);
  };

  const handlePlaceCrystal = (row: number, col: number) => {
    if (!gameState || gameState.turnPhase !== 'PLACE_CRYSTAL') return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer || activePlayer.id !== socket.id) return;

    socket.emit('placeCrystal', { row, col });
  };

  const handleSkipCrystal = () => {
    socket.emit('placeCrystal', null);
  };

  if (!isJoined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#1e293b', color: '#f8fafc' }}>
        <div style={{ background: '#334155', padding: '2.5rem', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', width: '320px', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '1.5rem', fontSize: '1.75rem', color: '#38bdf8' }}>🌳 Leśne Duchy Online</h1>
          <form onSubmit={handleJoinGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Twoje imię"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '6px', border: 'none', fontSize: '1rem', outline: 'none' }}
              required
            />
            <input
              type="text"
              placeholder="Kod pokoju (np. LUD)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              maxLength={10}
              style={{ padding: '0.75rem', borderRadius: '6px', border: 'none', fontSize: '1rem', outline: 'none', textTransform: 'uppercase' }}
            />
            <button type="submit" style={{ padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
              Zagraj online
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1e293b', color: '#fff', fontFamily: 'sans-serif' }}>
        <h2>Łączenie z lasem... 🌲</h2>
      </div>
    );
  }

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = activePlayer?.id === socket.id;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', background: '#0f172a', color: '#e2e8f0', minHeight: '100vh' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px 20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#38bdf8' }}>🌳 Leśne Duchy Online</h2>
        <div style={{ background: '#0284c7', padding: '5px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem' }}>
          Pokój: {activeRoom}
        </div>
      </div>

      {errorMessage && (
        <div style={{ background: '#ef4444', color: '#fff', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontWeight: 'bold', textAlign: 'center' }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {gameState.isGameOver ? (
        <div style={{ background: '#1e293b', padding: '30px', borderRadius: '12px', textAlign: 'center', maxWidth: '500px', margin: '40px auto' }}>
          <h2 style={{ color: '#f59e0b' }}>🏆 Koniec Gry! Wyniki końcowe:</h2>
          <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #475569' }}>
                <th style={{ padding: '8px' }}>Miejsce</th>
                <th style={{ padding: '8px' }}>Gracz</th>
                <th style={{ padding: '8px' }}>Wynik</th>
              </tr>
            </thead>
            <tbody>
              {gameState.scores?.map((score: any, idx: number) => (
                <tr key={score.playerId} style={{ borderBottom: '1px solid #334155', background: score.playerId === socket.id ? '#334155' : 'transparent' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{idx + 1}.</td>
                  <td style={{ padding: '12px' }}>{score.playerName} {score.playerId === socket.id && '(Ty)'}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#10b981' }}>{score.totalScore} pkt</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
          
          <div>
            <div style={{ marginBottom: '15px', background: isMyTurn ? '#065f46' : '#1e293b', padding: '15px', borderRadius: '8px' }}>
              <h3>
                {isMyTurn ? "🟢 Twoja tura!" : `⏳ Tura gracza: ${activePlayer?.name || '...'}`}
              </h3>
              <p style={{ margin: 0 }}>
                {gameState.turnPhase === 'TAKE_TILES' 
                  ? "Faza: Wybierz i dobierz kafelki z lasu." 
                  : "Faza: Połóż swój kryształ na jednym wolnym kafelku lub pomiń."}
              </p>
              
              {isMyTurn && gameState.turnPhase === 'TAKE_TILES' && (
                <button onClick={handleConfirmMove} disabled={selectedTiles.length === 0} style={{ marginTop: '10px', padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Potwierdź dobranie ({selectedTiles.length})
                </button>
              )}

              {isMyTurn && gameState.turnPhase === 'PLACE_CRYSTAL' && (
                <button onClick={handleSkipCrystal} style={{ marginTop: '10px', padding: '8px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Pomiń kładzenie kryształu
                </button>
              )}
            </div>

            {/* PLANSZA ZGODNA Z TWOIM TYPEM TILE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#1e293b', padding: '20px', borderRadius: '8px' }}>
              {gameState.forest.map((row: any[], rIdx: number) => (
                <div key={rIdx} style={{ display: 'flex', gap: '10px' }}>
                  {row.map((tile: any, cIdx: number) => {
                    if (!tile) {
                      return <div key={cIdx} style={{ width: '90px', height: '90px', background: 'transparent' }} />;
                    }

                    const isLocallySelected = selectedTiles.some(t => t.row === rIdx && t.col === cIdx);
                    const isOthersLiveSelected = !isMyTurn && gameState.selectedTilesByCurrentPlayer?.some((t: any) => t.row === rIdx && t.col === cIdx);

                    let borderStyle = '2px solid #475569';
                    if (isLocallySelected) borderStyle = '3px solid #10b981';
                    if (isOthersLiveSelected) borderStyle = '3px dashed #ef4444';

                    return (
                      <div
                        key={tile.id}
                        onClick={() => gameState.turnPhase === 'TAKE_TILES' ? handleTileClick(rIdx, cIdx) : handlePlaceCrystal(rIdx, cIdx)}
                        style={{
                          width: '95px',
                          height: '95px',
                          background: tile.color || '#334155', // Używamy koloru z Twojego typu Tile!
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          border: borderStyle,
                          position: 'relative',
                          userSelect: 'none',
                          color: '#000' // Czarny tekst ikon na kolorowych kafelkach
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '2px' }}>{tile.spiritType}</div>
                        <div style={{ fontSize: '1.1rem' }}>{tile.icons?.join(' ')}</div>
                        {tile.hasGift && <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 'bold', marginTop: '4px' }}>🎁 Dar</div>}
                        {tile.crystallizedBy && (
                          <div style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '1rem' }}>
                            {gameState.players.find((p: any) => p.id === tile.crystallizedBy)?.crystalVisual || "🔮"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* LISTA GRACZY */}
          <div style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', height: 'fit-content' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #475569', paddingBottom: '8px' }}>👥 Gracze w pokoju:</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {gameState.players.map((p: any, idx: number) => (
                <div key={p.id} style={{ padding: '10px', background: idx === gameState.currentPlayerIndex ? '#334155' : '#1e293b', borderRadius: '6px', border: idx === gameState.currentPlayerIndex ? '1px solid #38bdf8' : '1px solid transparent' }}>
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{p.crystalVisual}</span>
                    <span>{p.name} {p.id === socket.id && '(Ty)'}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                    <div>Kryształy: {p.crystals} 💎</div>
                    <div>Zabrane kafle: {p.collectedTiles?.length || 0} 🃏</div>
                    <div>Dary: {p.collectedGiftsCount || p.secretGifts?.length || 0} 🎁</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}