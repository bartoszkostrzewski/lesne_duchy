import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const ALL_SPIRIT_TYPES = [
  'Zielony', 'Szary', 'Czerwony', 'Niebieski', 'Brązowy', 
  'Jasnozielony', 'Żółty', 'Fioletowy', 'Jasnofioletowy'
] as const;

type SpiritIconType = typeof ALL_SPIRIT_TYPES[number];
type TileIconType = string; 
type GiftContent = string;

interface Tile {
  id: string;
  color: string;     
  spiritType: SpiritIconType;
  icons: TileIconType[]; 
  hasGift: boolean;  
  crystallizedBy: string | null; 
}

interface Player {
  id: string;
  name: string;
  collectedTiles: Tile[];
  collectedGiftsCount: number; 
  secretGifts: GiftContent[];  
  crystals: number;       
  frozenCrystals: number; 
  crystalVisual: string;  
}

interface PlayerScore {
  playerId: string;
  playerName: string;
  colorPoints: Record<string, number>;
  naturePoints: { fire: number; sun: number; moon: number };
  penalties: number;
  totalScore: number;
}

interface GameState {
  forest: (Tile | null)[][]; 
  players: Player[];
  currentPlayerIndex: number;
  isFirstRound: boolean; 
  turnPhase: 'TAKE_TILES' | 'PLACE_CRYSTAL';
  selectedTilesByCurrentPlayer: { row: number; col: number }[];
  isGameOver?: boolean;
  scores?: PlayerScore[];
}

const socket: Socket = io("http://localhost:3000");

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTiles, setSelectedTiles] = useState<{ row: number; col: number }[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [isJoined, setIsJoined] = useState<boolean>(false);

  useEffect(() => {
    socket.on("connect", () => setPlayerId(socket.id || ""));
    socket.on("gameStateUpdate", (updatedState: GameState) => {
      setGameState(updatedState);
      
      // Jeżeli tura przeszła na kogoś innego lub zmieniła się faza, czyścimy lokalny wybór
      const activePlayer = updatedState.players[updatedState.currentPlayerIndex];
      if (activePlayer?.id !== socket.id) {
        setSelectedTiles(updatedState.selectedTilesByCurrentPlayer || []);
      }
    });
    
    socket.on("error", (message: string) => {
      alert(message);
      setSelectedTiles([]); // Reset zaznaczenia w przypadku błędu (np. próba wzięcia 2 kryształów rywali)
    });

    return () => {
      socket.off("connect");
      socket.off("gameStateUpdate");
      socket.off("error");
    };
  }, []);

  const handleJoinGame = () => {
    if (!playerName.trim()) return;
    socket.emit("joinGame", playerName);
    setIsJoined(true);
  };

  const renderTileIcon = (icon: TileIconType) => {
    const normalized = icon.trim().toLowerCase();
    switch (normalized) {
      case 'zielony': return "🟩";
      case 'szary': return "⬜";
      case 'czerwony': return "🟥";
      case 'niebieski': return "🟦";
      case 'brązowy': return "🟫";
      case 'jasnozielony': return "💚"; 
      case 'żółty': return "🟨";
      case 'fioletowy': return "🟪";
      case 'jasnofioletowy': return "🔮";
      
      case 'fire': case 'ogień': return "🔥";
      case 'sun': case 'słońce': return "☀️";
      case 'moon': case 'księżyc': return "🌙";
      
      default: return "❓";
    }
  };

  const renderGiftWidget = (giftType: GiftContent) => {
    const normalized = giftType.trim().toLowerCase();
    switch (normalized) {
      case 'zielony': return "🟩 Żeton Ducha Zielonego";
      case 'szary': return "⬜ Żeton Ducha Szarego";
      case 'czerwony': return "🟥 Żeton Ducha Czerwonego";
      case 'niebieski': return "🟦 Żeton Ducha Niebieskiego";
      case 'brązowy': return "🟫 Żeton Ducha Brązowego";
      case 'jasnozielony': return "💚 Żeton Ducha Jasnozielonego";
      case 'żółty': return "🟨 Żeton Ducha Żółtego";
      case 'fioletowy': return "🟪 Żeton Ducha Fioletowego";
      case 'jasnofioletowy': return "🔮 Żeton Ducha Jasnofioletowego";
      
      case 'fire': return "🔥 Żeton Żywiołu Ognia";
      case 'sun': return "☀️ Żeton Żywiołu Słońca";
      case 'moon': return "🌙 Żeton Żywiołu Księżyca";
      case 'plus': return "➕ Żeton Plusa (Ochrona przed stratą kryształu)";
      
      default: return `🟫 Żeton (${giftType})`; 
    }
  };

  const getTileStyle = (tile: Tile, isSelected: boolean, isMiniature: boolean): React.CSSProperties => {
    return {
      width: "90px",
      height: isMiniature ? "70px" : "135px",
      minWidth: "90px",
      maxWidth: "90px",
      backgroundColor: tile.color,
      borderRadius: "6px",
      color: "white",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "8px",
      boxSizing: "border-box",
      cursor: "pointer",
      position: "relative",
      border: isSelected ? "4px solid #ffcc00" : "1px solid rgba(0,0,0,0.2)",
      boxShadow: isSelected ? "0 0 15px #ffcc00" : "2px 2px 5px rgba(0,0,0,0.1)",
    };
  };

  const handleTileClick = (rowIndex: number, colIndex: number) => {
    if (!gameState || gameState.isGameOver) return;
    if (gameState.players[gameState.currentPlayerIndex]?.id !== playerId) {
      alert("To nie jest Twój ruch!");
      return;
    }

    const tile = gameState.forest[rowIndex]?.[colIndex];
    if (!tile) return;

    if (gameState.turnPhase === 'PLACE_CRYSTAL') {
      // Można kliknąć pusty kafelek lub SWÓJ własny kryształ, aby go ściągnąć
      if (tile.crystallizedBy && tile.crystallizedBy !== playerId) {
        alert("Ten kafelek zajął już Twój rywal! Nie możesz go nadpisać.");
        return;
      }
      socket.emit("placeCrystal", { row: rowIndex, col: colIndex });
      return;
    }

    const alreadySelectedIdx = selectedTiles.findIndex(pos => pos.row === rowIndex && pos.col === colIndex);
    let newSelection = [...selectedTiles];

    if (alreadySelectedIdx > -1) {
      newSelection.splice(alreadySelectedIdx, 1);
    } else {
      if (newSelection.length >= 2) {
        alert("Możesz zaznaczyć maksymalnie 2 kafelki!");
        return;
      }
      newSelection.push({ row: rowIndex, col: colIndex });
    }

    setSelectedTiles(newSelection);
    socket.emit("updateLiveSelection", newSelection);
  };

  const handleConfirmMove = () => {
    socket.emit("makeMove", selectedTiles);
    setSelectedTiles([]);
  };

  if (!isJoined) {
    return (
      <div style={{ padding: "50px", textAlign: "center", fontFamily: "sans-serif" }}>
        <h1>Leśne Duchy Online</h1>
        <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Twoje imię..." style={{ padding: "10px", fontSize: "16px", marginRight: "10px" }} />
        <button onClick={handleJoinGame} style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}>Wejdź do gry</button>
      </div>
    );
  }

  if (!gameState) return <div style={{ padding: "50px", textAlign: "center" }}>Wczytywanie lasu...</div>;

  if (gameState.isGameOver && gameState.scores) {
    return (
      <div style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#f0f4f8", minHeight: "100vh" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", background: "white", padding: "30px", borderRadius: "12px" }}>
          <h1 style={{ textAlign: "center", color: "#2E7D32" }}>🏆 Koniec Gry! 🏆</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "20px" }}>
            {[...gameState.scores].sort((a,b)=>b.totalScore-a.totalScore).map((score, idx) => (
              <div key={score.playerId} style={{ border: "1px solid #ddd", padding: "20px", borderRadius: "8px", background: idx === 0 ? "#f1f8e9" : "#fff" }}>
                <h3>{idx+1}. {score.playerName} — {score.totalScore} pkt</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: "13px", marginTop: "10px" }}>
                  <div>
                    <strong>Przewagi w duchach:</strong>
                    <ul>
                      {ALL_SPIRIT_TYPES.map(t => score.colorPoints[t] > 0 && <li key={t}>{renderTileIcon(t)} {t}: +{score.colorPoints[t]}</li>)}
                    </ul>
                  </div>
                  <div>
                    <strong>Żywioły i kary:</strong>
                    <div>🔥 Ogień: +{score.naturePoints.fire} | ☀️ Słońce: +{score.naturePoints.sun} | 🌙 Księżyc: +{score.naturePoints.moon}</div>
                    <div style={{ color: "red", marginTop: "5px" }}>Kary za puste kolory: {score.penalties} pkt</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;

  return (
    <div style={{ padding: "20px 40px", fontFamily: "sans-serif", backgroundColor: "#f4f7f4", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #ccc", paddingBottom: "10px" }}>
        <h2>Zaczarowany Las (9 Duchów + Mechanika Kontry)</h2>
        <div style={{ fontSize: "17px", fontWeight: "bold", color: isMyTurn ? "#2E7D32" : "#C62828" }}>
          {isMyTurn ? `🟢 TWÓJ RUCH! Faza: ${gameState.turnPhase === 'TAKE_TILES' ? 'Wybór Kafelków' : 'Rezerwacja Kryształu'}` : `Czekasz na ruch gracza: ${gameState.players[gameState.currentPlayerIndex]?.name}`}
        </div>
      </header>

      {/* PLANSZA */}
      <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
        {gameState.forest.map((row, rIdx) => (
          <div key={rIdx} style={{ display: "flex", gap: "8px", background: "#e2ebe2", padding: "10px", borderRadius: "8px" }}>
            {row.map((tile, cIdx) => {
              if (!tile) return <div key={cIdx} style={{ width: "90px", height: "135px", background: "rgba(0,0,0,0.02)" }} />;
              const isSelected = selectedTiles.some(p => p.row === rIdx && p.col === cIdx);
              const crystal = tile.crystallizedBy ? (gameState.players.find(p => p.id === tile.crystallizedBy)?.crystalVisual || "🔮") : null;

              return (
                <div key={tile.id} onClick={() => handleTileClick(rIdx, cIdx)} style={getTileStyle(tile, isSelected, false)}>
                  <div style={{ display: "flex", gap: "4px", justifyContent: "center", background: "rgba(255,255,255,0.25)", padding: "2px", borderRadius: "4px", minHeight: "20px" }}>
                    {tile.icons.map((icon, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", fontSize: "14px" }}>
                        {renderTileIcon(icon)}
                      </span>
                    ))}
                  </div>
                  <div style={{ textAlign: "center", fontSize: "11px", fontWeight: "bold", textShadow: "1px 1px 1px rgba(0,0,0,0.5)" }}>{tile.spiritType}</div>
                  <div style={{ height: "20px", textAlign: "center", fontSize: "18px" }}>{crystal} {tile.hasGift && "🪙"}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* PRZYCISKI AKCJI */}
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        {isMyTurn && (
          gameState.turnPhase === 'TAKE_TILES' ? (
            <button onClick={handleConfirmMove} disabled={selectedTiles.length === 0} style={{ padding: "10px 30px", fontWeight: "bold", backgroundColor: "#4CAF50", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Zatwierdź wybór kafelków ✅</button>
          ) : (
            <button onClick={() => socket.emit("placeCrystal", null)} style={{ padding: "10px 25px", backgroundColor: "#f44336", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Pomiń rezerwację kryształu ⏭️</button>
          )
        )}
      </div>

      {/* PANELE GRACZY */}
      <div style={{ marginTop: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>
        {gameState.players.map((player) => {
          const isMe = player.id === playerId;
          return (
            <div key={player.id} style={{ background: "white", padding: "20px", borderRadius: "10px", border: "1px solid #ddd", boxShadow: player.id === gameState.players[gameState.currentPlayerIndex]?.id ? "0 0 10px rgba(76, 175, 80, 0.5)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: "8px" }}>
                <strong>{player.name} {isMe && "(Ty)"} — {player.crystalVisual}</strong>
                <span style={{ fontSize: "13px" }}>Kryształy w puli: <strong style={{color: "#2E7D32"}}>{player.crystals}</strong> | Zamrożone: {player.frozenCrystals} | Zdobyte Dary: {player.collectedGiftsCount}</span>
              </div>

              {/* Sekcja Tajnych Żetonów */}
              {isMe && player.secretGifts && player.secretGifts.length > 0 && (
                <div style={{ display: "flex", gap: "10px", marginTop: "10px", background: "#fff3e0", padding: "8px", borderRadius: "6px", flexWrap: "wrap" }}>
                  {player.secretGifts.map((giftType, idx) => (
                    <span key={idx} style={{ background: "white", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", border: "1px solid #ffb74d", display: "inline-flex", alignItems: "center" }}>
                      {renderGiftWidget(giftType)}
                    </span>
                  ))}
                </div>
              )}

              {/* STOSY KAFELKÓW GRACZA */}
              <div style={{ display: "flex", gap: "10px", marginTop: "15px", overflowX: "auto", paddingBottom: "5px" }}>
                {ALL_SPIRIT_TYPES.map(type => {
                  const subTiles = player.collectedTiles.filter(t => t.spiritType.toLowerCase() === type.toLowerCase());
                  return (
                    <div key={type} style={{ minWidth: "85px", textAlign: "center", background: "#fdfdfd", padding: "5px", borderRadius: "4px" }}>
                      <div style={{ fontSize: "9px", background: subTiles.length > 0 ? subTiles[0].color : "#eee", color: subTiles.length > 0 ? "white" : "#666", padding: "2px", borderRadius: "3px", fontWeight: "bold" }}>
                        {renderTileIcon(type)} {type}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "5px" }}>
                        {subTiles.map((t, idx) => (
                          <div key={idx} style={{ height: "30px", backgroundColor: t.color, borderRadius: "4px", display: "flex", justifyContent: "center", alignItems: "center", gap: "2px" }}>
                            {t.icons.map((ico, i) => <span key={i} style={{ scale: "0.8" }}>{renderTileIcon(ico)}</span>)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}