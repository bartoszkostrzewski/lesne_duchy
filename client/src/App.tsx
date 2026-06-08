import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

// Zastąp adres URL swoim adresem, bez portu :3000 na końcu!
const socket = io("https://lesne-duchy.onrender.com", {
  transports: ['websocket', 'polling'] 
});

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

const SPIRIT_COLOR_MAP: Record<SpiritIconType, string> = {
  'Zielony': '#2E7D32',
  'Szary': '#757575',
  'Czerwony': '#C62828',
  'Niebieski': '#1565C0',
  'Brązowy': '#6D4C41',
  'Jasnozielony': '#66BB6A',
  'Żółty': '#FBC02D',
  'Fioletowy': '#6A1B9A',
  'Jasnofioletowy': '#BA68C8',
};

const DECK_STATS: Record<SpiritIconType, number> = {
  'Zielony': 5,
  'Szary': 6,
  'Czerwony': 6,
  'Niebieski': 7,
  'Brązowy': 7,
  'Jasnozielony': 8,
  'Żółty': 8,
  'Fioletowy': 8,
  'Jasnofioletowy': 10,
};

const socket: Socket = io("http://localhost:3000");

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTiles, setSelectedTiles] = useState<{ row: number; col: number }[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [activeOpponentId, setActiveOpponentId] = useState<string>("");

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = "#0f172a";
  }, []);

  useEffect(() => {
    socket.on("connect", () => setPlayerId(socket.id || ""));
    
    socket.on("gameStateUpdate", (updatedState: GameState) => {
      setGameState(updatedState);
      setSelectedTiles(updatedState.selectedTilesByCurrentPlayer || []);
    });
    
    socket.on("error", (message: string) => {
      alert(message);
      setSelectedTiles([]);
    });

    return () => {
      socket.off("connect");
      socket.off("gameStateUpdate");
      socket.off("error");
    };
  }, []);

  useEffect(() => {
    if (gameState && gameState.players) {
      const opponents = gameState.players.filter(p => p.id !== playerId);
      if (opponents.length > 0 && !activeOpponentId) {
        setActiveOpponentId(opponents[0].id);
      }
    }
  }, [gameState, playerId, activeOpponentId]);

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
      default: return "🐾";
    }
  };

  const renderGiftWidget = (giftType: GiftContent) => {
    const normalized = giftType.trim().toLowerCase();
    switch (normalized) {
      case 'zielony': return "🟩 Żeton Zielonego";
      case 'szary': return "⬜ Żeton Szarego";
      case 'czerwony': return "🟥 Żeton Czerwonego";
      case 'niebieski': return "🟦 Żeton Niebieskiego";
      case 'brązowy': return "🟫 Żeton Brązowego";
      case 'jasnozielony': return "💚 Żeton Jasnozielonego";
      case 'żółty': return "🟨 Żeton Żółtego";
      case 'fioletowy': return "🟪 Żeton Fioletowego";
      case 'jasnofioletowy': return "🔮 Żeton Jasnofioletowego";
      case 'fire': return "🔥 Żeton Ognia";
      case 'sun': return "☀️ Żeton Słońca";
      case 'moon': return "🌙 Żeton Księżyca";
      case 'plus': return "➕ Żeton Plusa";
      default: return `🎁 Żeton (${giftType})`; 
    }
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
      if (tile.crystallizedBy && tile.crystallizedBy !== playerId) {
        alert("Ten kafelek zajął już Twój rywal!");
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
      if (gameState.isFirstRound && newSelection.length >= 1) {
        alert("W pierwszym ruchu gry możesz dobrać maksymalnie 1 kafelek!");
        return;
      }
      if (!gameState.isFirstRound && newSelection.length >= 2) {
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
      <div style={{ position: "fixed", inset: 0, background: "#0f172a", color: "white", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "400px", width: "90%", background: "#1e293b", padding: "40px", borderRadius: "12px", border: "1px solid #334155", textAlign: "center" }}>
          <h1 style={{ color: "#34d399", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 10px 0", fontSize: "24px" }}>Leśne Duchy Online</h1>
          <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "20px" }}>Wpisz swoje imię, aby wejść do zaczarowanego lasu</p>
          <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Twoje imię..." style={{ padding: "12px", fontSize: "16px", width: "100%", borderRadius: "6px", border: "1px solid #475569", background: "#0f172a", color: "white", boxSizing: "border-box", textAlign: "center", marginBottom: "15px" }} maxLength={12} />
          <button onClick={handleJoinGame} style={{ padding: "12px", fontSize: "16px", cursor: "pointer", width: "100%", background: "#059669", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold" }}>Wejdź do gry</button>
        </div>
      </div>
    );
  }

  if (!gameState) return <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#94a3b8", background: "#0f172a" }}>Wczytywanie leśnej głuszy...</div>;

  if (gameState.isGameOver && gameState.scores) {
    return (
      <div style={{ position: "fixed", inset: 0, padding: "40px", fontFamily: "sans-serif", backgroundColor: "#0f172a", color: "white", overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "600px", width: "100%", background: "#1e293b", padding: "30px", borderRadius: "12px", border: "1px solid #334155" }}>
          <h1 style={{ textAlign: "center", color: "#34d399", margin: "0 0 20px 0" }}>🏆 Koniec Rozgrywki! 🏆</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {[...gameState.scores].sort((a,b)=>b.totalScore-a.totalScore).map((score, idx) => (
              <div key={score.playerId} style={{ border: "1px solid #334155", padding: "15px", borderRadius: "8px", background: idx === 0 ? "#064e3b" : "#0f172a" }}>
                <h3 style={{ margin: "0 0 10px 0" }}>{idx+1}. {score.playerName} — <span style={{color: "#34d399"}}>{score.totalScore} pkt</span></h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: "12px", color: "#cbd5e1" }}>
                  <div>
                    <strong>Suma ikon duchów:</strong>
                    <ul style={{ margin: "5px 0 0 0", paddingLeft: "15px" }}>
                      {ALL_SPIRIT_TYPES.map(t => score.colorPoints[t] > 0 && <li key={t}>{t}: +{score.colorPoints[t]}</li>)}
                    </ul>
                  </div>
                  <div>
                    <strong>Żywioły i kary:</strong>
                    <div>🔥 Ogień: +{score.naturePoints?.fire || 0}</div>
                    <div>☀️ Słońce: +{score.naturePoints?.sun || 0}</div>
                    <div>🌙 Księżyc: +{score.naturePoints?.moon || 0}</div>
                    <div style={{ color: "#f87171", marginTop: "8px", fontWeight: "bold" }}>Kary: -{score.penalties} pkt</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => window.location.reload()} style={{ display: "block", margin: "20px auto 0 auto", padding: "10px 20px", background: "#475569", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Zagraj ponownie</button>
        </div>
      </div>
    );
  }

  const myPlayer = gameState.players.find(p => p.id === playerId);
  const opponents = gameState.players.filter(p => p.id !== playerId);
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = activePlayer?.id === playerId;
  const selectedOpponent = opponents.find(p => p.id === activeOpponentId) || opponents[0];

  const renderAggregatedCollection = (player: Player | undefined) => {
    if (!player) return <div style={{ color: "#64748b", fontStyle: "italic", fontSize: "11px", textAlign: "center", marginTop: "20px" }}>Brak danych</div>;
    const natureTypes = ['fire', 'sun', 'moon'];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexGrow: 1, overflowY: "auto", paddingRight: "2px" }}>
        <div style={{ fontSize: "11px", color: "#94a3b8", borderBottom: "1px solid #334155", paddingBottom: "4px", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
          <span>Kryształy: <strong>{player.crystals}</strong> 💎</span>
          <span>Dary: <strong>{player.collectedGiftsCount}</strong> 🎁</span>
        </div>

        <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>Duchy:</div>
        {ALL_SPIRIT_TYPES.map(type => {
          const target = type.toLowerCase();
          let iconCount = 0;
          player.collectedTiles.forEach(tile => {
            if (tile?.icons) {
              iconCount += tile.icons.filter(ico => ico.toLowerCase() === target).length;
            }
          });

          const hasPhysicalTile = iconCount > 0;
          return (
            <div key={type} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold",
              backgroundColor: SPIRIT_COLOR_MAP[type], color: "white",
              opacity: hasPhysicalTile ? 1 : 0.2
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {renderTileIcon(type)} {type}
              </span>
              <span style={{ background: "rgba(0,0,0,0.3)", padding: "1px 6px", borderRadius: "10px" }}>{iconCount}</span>
            </div>
          );
        })}

        <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase", marginTop: "4px" }}>Żywioły:</div>
        {natureTypes.map(nat => {
          let iconCount = 0;
          player.collectedTiles.forEach(tile => {
            if (tile?.icons) {
              iconCount += tile.icons.filter(ico => ico.toLowerCase() === nat.toLowerCase()).length;
            }
          });
          const hasPhysicalTile = iconCount > 0;

          return (
            <div key={nat} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold",
              backgroundColor: nat === 'fire' ? "#9a3412" : nat === 'sun' ? "#b45309" : "#1e1b4b", color: "white",
              opacity: hasPhysicalTile ? 1 : 0.2
            }}>
              <span>{renderTileIcon(nat)} {nat === 'fire' ? 'Ogień' : nat === 'sun' ? 'Słońce' : 'Księżyc'}</span>
              <span style={{ background: "rgba(0,0,0,0.3)", padding: "1px 6px", borderRadius: "10px" }}>{iconCount}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, padding: "10px", backgroundColor: "#0f172a", color: "white", fontFamily: "sans-serif", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      
      {/* NAGŁÓWEK */}
      <header style={{ height: "6vh", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "900", letterSpacing: "1px", color: "#34d399", textTransform: "uppercase" }}>Leśne Duchy</h2>
          <div style={{
            fontSize: "12px", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold",
            backgroundColor: isMyTurn ? "#064e3b" : "#1e293b", color: isMyTurn ? "#34d399" : "#94a3b8",
            border: isMyTurn ? "1px solid #059669" : "1px solid #334155"
          }}>
            {isMyTurn ? "🟢 TWOJA TURA!" : `Oczekiwanie na: ${activePlayer?.name}`}
          </div>
        </div>
        <div style={{ fontSize: "12px", background: "#1e293b", padding: "4px 15px", borderRadius: "20px", border: "1px solid #334155", display: "flex", gap: "15px" }}>
          <span>Faza: <strong style={{color: "#fbbf24"}}>{gameState.turnPhase === 'TAKE_TILES' ? 'Dobieranie' : 'Kryształ'}</strong></span>
          {gameState.isFirstRound && <span style={{ color: "#f87171", fontWeight: "900" }}>RUNDA 1</span>}
        </div>
      </header>

      {/* LAYOUT GŁÓWNY */}
      <div style={{ height: "94vh", width: "100%", display: "flex", gap: "10px", boxSizing: "border-box", paddingTop: "10px" }}>
        
        {/* LEWA KOLUMNA */}
        <div style={{ width: "18%", height: "100%", display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", fontSize: "11px", fontWeight: "900", color: "#34d399", background: "rgba(6, 78, 59, 0.4)", padding: "6px", borderRadius: "6px", border: "1px solid rgba(5, 150, 105, 0.3)" }}>
            Twoja Kolekcja ({myPlayer?.name})
          </div>
          {renderAggregatedCollection(myPlayer)}
        </div>

        {/* ŚRODKOWA KOLUMNA */}
        <div style={{ width: "64%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", background: "rgba(30, 41, 59, 0.2)", border: "1px solid #1e293b", borderRadius: "12px", padding: "10px", boxSizing: "border-box" }}>
          
          {/* PRZYCISK DECYZJI */}
          <div style={{ height: "8vh", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            {isMyTurn ? (
              gameState.turnPhase === 'TAKE_TILES' ? (
                <button onClick={handleConfirmMove} disabled={selectedTiles.length === 0} style={{
                  padding: "8px 30px", fontSize: "13px", fontWeight: "bold", borderRadius: "6px", border: "none", cursor: selectedTiles.length > 0 ? "pointer" : "not-allowed",
                  backgroundColor: selectedTiles.length > 0 ? "#059669" : "#334155", color: selectedTiles.length > 0 ? "white" : "#64748b"
                }}>
                  Potwierdź Dobór Kafelków ({selectedTiles.length}) ✅
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <span style={{ fontSize: "12px", color: "#fbbf24", fontWeight: "bold" }}>Połóż kryształ na wolnym kafu lub:</span>
                  <button onClick={() => socket.emit("placeCrystal", null)} style={{ padding: "6px 15px", fontSize: "12px", fontWeight: "bold", background: "#dc2626", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                    Pomiń Kryształ ⏭️
                  </button>
                </div>
              )
            ) : (
              <div style={{ color: "#475569", fontSize: "12px", fontStyle: "italic" }}>Oczekiwanie na ruch rywala...</div>
            )}
          </div>

          {/* PLANSZA LASU */}
          <div style={{ flexGrow: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", overflow: "hidden" }}>
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "0.5vw", 
              background: "#111827", 
              padding: "0.8vw", 
              borderRadius: "12px", 
              border: "1px solid #1f2937",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box"
            }}>
              {gameState.forest.map((row, rIdx) => (
                // POPRAWKA: Dodano `justifyContent: "center"` do wiersza.
                // Teraz niezależnie od liczby pozostałych kafelków, cały wiersz jest automatycznie scentrowany!
                <div key={rIdx} style={{ display: "flex", gap: "0.5vw", width: "100%", justifyContent: "center" }}>
                  {row.map((tile, cIdx) => {
                    // Kafelki mają stałą szerokość bazującą na maksymalnej pojemności wiersza, dzięki czemu nie rosną.
                    const tileStyleBase = {
                      width: "calc((100% - (11 * 0.5vw)) / 12)",
                      aspectRatio: "3 / 4",
                      boxSizing: "border-box" as const,
                      borderRadius: "6px"
                    };

                    // POPRAWKA: Zwracamy `null` (czyli całkowicie usuwamy pusty element), aby Flexbox mógł
                    // płynnie i symetrycznie złożyć pozostałe aktywne kafelki do środka rzędu.
                    if (!tile) {
                      return null;
                    }

                    const isSelected = selectedTiles.some(p => p.row === rIdx && p.col === cIdx);
                    const crystal = tile.crystallizedBy ? (gameState.players.find(p => p.id === tile.crystallizedBy)?.crystalVisual || "💎") : null;
                    const totalSymbolsCount = DECK_STATS[tile.spiritType] || 0;

                    return (
                      <div
                        key={tile.id}
                        onClick={() => handleTileClick(rIdx, cIdx)}
                        style={{
                          ...tileStyleBase,
                          backgroundColor: tile.color, color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "0.3vw", cursor: "pointer", position: "relative", transition: "all 0.1s",
                          border: isSelected ? "3px solid #fbbf24" : "1px solid rgba(255,255,255,0.15)",
                          transform: isSelected ? "scale(0.95)" : "none",
                          zIndex: isSelected ? 10 : 1,
                        }}
                      >
                        {/* IKONY NA GÓRZE */}
                        <div style={{ display: "flex", gap: "2px", justifyContent: "center", background: "rgba(0,0,0,0.2)", padding: "2px", borderRadius: "4px", overflow: "hidden" }}>
                          {tile.icons.map((icon, i) => (
                            <span key={i} style={{ fontSize: "0.9vw", display: "inline-flex", alignItems: "center" }}>
                              {renderTileIcon(icon)}
                            </span>
                          ))}
                        </div>

                        {/* CYFRA NA DOLE */}
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "2px" }}>
                          <div style={{ background: "rgba(0,0,0,0.6)", color: "#fbbf24", fontSize: "1vw", fontWeight: "900", padding: "1px 6px", borderRadius: "4px", border: "1px solid rgba(0,0,0,0.3)" }}>
                            {totalSymbolsCount}
                          </div>
                        </div>

                        {/* Kryształ */}
                        {crystal && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5vw" }}>
                            {crystal}
                          </div>
                        )}

                        {/* Prezent */}
                        {tile.hasGift && (
                          <div style={{ position: "absolute", top: "-2px", right: "-2px", background: "#ef4444", border: "1px solid white", borderRadius: "50%", width: "12px", height: "12px", fontSize: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            🎁
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* SEKRETNE DARY */}
          {myPlayer?.secretGifts && myPlayer.secretGifts.length > 0 && (
            <div style={{ height: "5vh", width: "100%", display: "flex", gap: "6px", justifyContent: "center", alignItems: "center", background: "#1e293b", borderRadius: "6px", padding: "2px", boxSizing: "border-box" }}>
              {myPlayer.secretGifts.map((giftType, idx) => (
                <span key={idx} style={{ background: "#0f172a", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", border: "1px solid #b45309", fontWeight: "bold" }}>
                  {renderGiftWidget(giftType)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* PRAWA KOLUMNA */}
        <div style={{ width: "18%", height: "100%", display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", fontSize: "11px", fontWeight: "900", color: "#f87171", background: "rgba(153, 27, 27, 0.2)", padding: "6px", borderRadius: "6px", border: "1px solid rgba(220, 38, 38, 0.3)" }}>
            Kolekcje Rywali
          </div>

          {opponents.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: "4px", overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid #1e293b", overflowX: "auto", whiteSpace: "nowrap", paddingBottom: "2px" }}>
                {opponents.map(opp => (
                  <button
                    key={opp.id}
                    onClick={() => setActiveOpponentId(opp.id)}
                    style={{
                      padding: "4px 8px", fontSize: "11px", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "4px 4px 0 0", marginRight: "2px",
                      background: selectedOpponent?.id === opp.id ? "#1e293b" : "transparent",
                      color: selectedOpponent?.id === opp.id ? "#f87171" : "#475569",
                    }}
                  >
                    {opp.name.substring(0, 6)} {opp.crystalVisual}
                  </button>
                ))}
              </div>
              {renderAggregatedCollection(selectedOpponent)}
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: "11px", color: "#475569", marginTop: "20px", fontStyle: "italic" }}>Oczekiwanie na graczy...</div>
          )}
        </div>

      </div>
    </div>
  );
}