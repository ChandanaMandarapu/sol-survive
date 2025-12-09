import { Buffer } from 'buffer';
window.Buffer = Buffer;

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@project-serum/anchor';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

const PROGRAM_ID = new PublicKey('H9xrsmTET4Kfj51ULfZog5GKjrBanrknrSAByqeCw5w2');

const IDL = {
  "version": "0.1.0",
  "name": "solsurvive",
  "instructions": [
    {
      "name": "initializeGame",
      "accounts": [
        { "name": "game", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "movePlayer",
      "accounts": [
        { "name": "game", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": false, "isSigner": true }
      ],
      "args": [{ "name": "newX", "type": "u8" }, { "name": "newY", "type": "u8" }]
    },
    {
      "name": "processAiTurn",
      "accounts": [
        { "name": "game", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "advanceRound",
      "accounts": [
        { "name": "game", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "resetGame",
      "accounts": [
        { "name": "game", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "player", "type": "publicKey" },
          { "name": "playerX", "type": "u8" },
          { "name": "playerY", "type": "u8" },
          { "name": "playerAlive", "type": "bool" },
          { "name": "aiX", "type": { "array": ["u8", 9] } },
          { "name": "aiY", "type": { "array": ["u8", 9] } },
          { "name": "aiAlive", "type": { "array": ["bool", 9] } },
          { "name": "aiPersonality", "type": { "array": ["u8", 9] } },
          { "name": "round", "type": "u8" },
          { "name": "safeZoneRadius", "type": "u8" },
          { "name": "prizePool", "type": "u64" },
          { "name": "gameOver", "type": "bool" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ]
};

function GameScreen() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState(['> System initialized...']);

  // Practice Mode State
  const [practice, setPractice] = useState(false);
  const [practiceGame, setPracticeGame] = useState(null);

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet, { preflightCommitment: 'processed' });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(IDL, PROGRAM_ID, provider);
  }, [provider]);

  const addLog = (msg) => {
    setLogs(prev => [...prev.slice(-4), `> ${msg}`]);
  };

  const getGamePDA = () => {
    if (!wallet.publicKey) return null;
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
    return pda;
  };

  const loadGame = async () => {
    if (!program || !wallet.publicKey) return;
    try {
      const pda = getGamePDA();
      const acc = await program.account.game.fetch(pda);
      console.log("Game loaded:", acc);
      setGame({
        px: acc.playerX, py: acc.playerY, alive: acc.playerAlive,
        aiX: acc.aiX, aiY: acc.aiY, aiAlive: acc.aiAlive,
        aiPers: acc.aiPersonality, round: acc.round,
        radius: acc.safeZoneRadius, over: acc.gameOver
      });
    } catch (e) {
      console.log("Load Game Error:", e);
      setGame(null);
    }
  };

  useEffect(() => {
    if (!practice) loadGame();
    // Auto-refresh interval
    const interval = setInterval(() => {
      if (!practice && wallet.publicKey) loadGame();
    }, 2000);
    return () => clearInterval(interval);
  }, [program, wallet.publicKey, practice]);

  const createGame = async () => {
    if (!program) return;
    setLoading(true);
    addLog('Creating game on-chain (0.05 SOL)...');
    try {
      const pda = getGamePDA();
      await program.methods.initializeGame().accounts({
        game: pda,
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId
      }).rpc();
      addLog('Game created! GLHF.');
      await loadGame();
    } catch (e) {
      if (e.message.includes('already in use') || e.message.includes('0x0')) {
        addLog('Game exists! Resetting...');
        try {
          const pda = getGamePDA();
          await program.methods.resetGame().accounts({
            game: pda,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId
          }).rpc();
          addLog('Game Reset! Good luck.');
          await loadGame();
        } catch (err) {
          addLog('Reset Error: ' + err.message);
        }
      } else {
        addLog('Error: ' + e.message);
      }
    }
    setLoading(false);
  };

  const move = async (dir) => {
    if (loading) return;

    if (practice) {
      practiceMove(dir);
      return;
    }

    if (!program || !game) return;

    setLoading(true);
    addLog(`Moving ${dir.toUpperCase()}...`);
    try {
      let { px, py } = game;
      if (dir === 'u') py = Math.max(0, py - 1);
      if (dir === 'd') py = Math.min(9, py + 1);
      if (dir === 'l') px = Math.max(0, px - 1);
      if (dir === 'r') px = Math.min(9, px + 1);

      const pda = getGamePDA();

      // We bundle instructions for speed? Or separate for clarity? 
      // Separate is safer for debugging, bundled is faster.
      // Let's do separate calls for now to ensure state updates correctly.

      await program.methods.movePlayer(px, py).accounts({
        game: pda, player: wallet.publicKey
      }).rpc();

      addLog('AI thinking...');
      await program.methods.processAiTurn().accounts({
        game: pda, player: wallet.publicKey
      }).rpc();

      await program.methods.advanceRound().accounts({
        game: pda, player: wallet.publicKey
      }).rpc();

      await loadGame();
    } catch (e) {
      addLog('Error: ' + e.message);
    }
    setLoading(false);
  };

  // --- PRACTICE MODE LOGIC ---
  const startPractice = () => {
    setPractice(true);
    setPracticeGame({
      px: 5, py: 5, alive: true,
      aiX: [1, 8, 1, 8, 4, 1, 8, 5, 4],
      aiY: [1, 1, 8, 8, 1, 5, 5, 8, 4],
      aiAlive: [true, true, true, true, true, true, true, true, true],
      aiPers: [0, 1, 2, 3, 0, 1, 2, 0, 3], // 0=Aggro, 1=Def, 2=Coward, 3=Chaos
      round: 1, radius: 5, over: false
    });
    addLog('[PRACTICE] Match started.');
  };

  const practiceMove = (dir) => {
    if (!practiceGame) return;
    let { px, py, aiX, aiY, round, radius, aiAlive } = practiceGame;

    // Move Player
    if (dir === 'u') py = Math.max(0, py - 1);
    if (dir === 'd') py = Math.min(9, py + 1);
    if (dir === 'l') px = Math.max(0, px - 1);
    if (dir === 'r') px = Math.min(9, px + 1);

    // Initial Safe Zone Check
    const pDist = Math.abs(px - 5) + Math.abs(py - 5);
    let pAlive = pDist <= radius;

    if (!pAlive) {
      setPracticeGame({ ...practiceGame, px, py, alive: false, over: true });
      addLog('Eliminated by Safe Zone!');
      return;
    }

    // Move AI and Interact
    const newAiX = [...aiX];
    const newAiY = [...aiY];
    const newAiAlive = [...aiAlive];

    for (let i = 0; i < 9; i++) {
      if (!newAiAlive[i]) continue;

      // Simple AI Logic based on personality
      const dx = px - newAiX[i];
      const dy = py - newAiY[i];

      // 0 = Aggro (Approaches player)
      if (practiceGame.aiPers[i] === 0) {
        if (Math.abs(dx) > Math.abs(dy)) newAiX[i] += dx > 0 ? 1 : -1;
        else newAiY[i] += dy > 0 ? 1 : -1;
      }
      // 1 = Defensive (Stays near center 5,5)
      else if (practiceGame.aiPers[i] === 1) {
        if (newAiX[i] < 5) newAiX[i]++; else if (newAiX[i] > 5) newAiX[i]--;
        else if (newAiY[i] < 5) newAiY[i]++; else if (newAiY[i] > 5) newAiY[i]--;
      }
      // 2 = Coward (Runs from player)
      else if (practiceGame.aiPers[i] === 2) {
        if (Math.abs(dx) > Math.abs(dy)) newAiX[i] -= dx > 0 ? 1 : -1;
        else newAiY[i] -= dy > 0 ? 1 : -1;
      }
      // 3 = Chaos (Random)
      else {
        if (Math.random() > 0.5) newAiX[i] += Math.random() > 0.5 ? 1 : -1;
        else newAiY[i] += Math.random() > 0.5 ? 1 : -1;
      }

      // Bounds Check
      newAiX[i] = Math.max(0, Math.min(9, newAiX[i]));
      newAiY[i] = Math.max(0, Math.min(9, newAiY[i]));

      // Collision with Player (Elimination)
      if (newAiX[i] === px && newAiY[i] === py) {
        pAlive = false;
        addLog(`Killed by AI #${i + 1}`);
      }
    }

    // Advance Round Logic
    const newRound = round + 1;
    const newRadius = Math.floor(10 - (newRound / 2)); // Shrink logic
    const safeRadius = Math.max(1, newRadius); // Min radius 1

    // Verify AI survival in safe zone
    for (let i = 0; i < 9; i++) {
      const dist = Math.abs(newAiX[i] - 5) + Math.abs(newAiY[i] - 5);
      if (dist > safeRadius) newAiAlive[i] = false;
    }

    setPracticeGame({
      px, py,
      alive: pAlive,
      aiX: newAiX,
      aiY: newAiY,
      aiAlive: newAiAlive,
      aiPers: practiceGame.aiPers,
      round: newRound,
      radius: safeRadius,
      over: !pAlive || newRound >= 10
    });

    if (!pAlive) addLog('GAME OVER');
    else addLog(`Round ${newRound} started.`);
  };

  const currentGame = practice ? practiceGame : game;
  const showLobby = !currentGame;

  return (
    <div className="game-container">
      <h1>⚡ SOLSURVIVE ⚡</h1>
      <div style={{ color: '#666', marginBottom: 20 }}>DEVNET</div>

      <div style={{ marginBottom: 20 }}>
        {!practice && <WalletMultiButton className="wallet-btn" />}
        {practice && <button onClick={() => setPractice(false)} className="control-btn" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>EXIT PRACTICE</button>}
      </div>

      {showLobby ? (
        <div className="lobby">
          {wallet.publicKey || practice ? (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={startPractice} className="control-btn" style={{ borderColor: '#58a6ff' }}>
                🤖 PRACTICE (FREE)
              </button>
              {!practice && (
                <button onClick={createGame} className="control-btn" style={{ borderColor: '#00ff00', color: '#00ff00' }}>
                  {loading ? 'CREATING...' : '💰 REAL GAME (0.05 SOL)'}
                </button>
              )}
            </div>
          ) : (
            <div style={{ color: 'orange' }}>🔌 Connect Phantom to Play</div>
          )}
        </div>
      ) : (
        <div className="game-interface">
          <div className="stats-panel">
            <div className="stat-item">
              <span>ROUND</span>
              <span className="stat-value">{currentGame.round}/10</span>
            </div>
            <div className="stat-item">
              <span>SAFE ZONE</span>
              <span className="stat-value">{currentGame.radius}</span>
            </div>
            <div className="stat-item">
              <span>STATUS</span>
              <span className="stat-value" style={{ color: currentGame.alive ? '#0f0' : '#f00' }}>
                {currentGame.over ? (currentGame.alive ? 'WINNER' : 'DEAD') : 'ALIVE'}
              </span>
            </div>
          </div>

          <div className="grid-board">
            {Array.from({ length: 100 }).map((_, i) => {
              const x = i % 10;
              const y = Math.floor(i / 10);

              // Calc safe zone
              const dist = Math.abs(x - 5) + Math.abs(y - 5);
              const isSafe = dist <= currentGame.radius;

              const isPlayer = currentGame.px === x && currentGame.py === y && currentGame.alive;

              let aiIcon = null;
              for (let b = 0; b < 9; b++) {
                if (currentGame.aiAlive[b] && currentGame.aiX[b] === x && currentGame.aiY[b] === y) {
                  const icons = ['🔥', '🛡️', '😱', '🎲'];
                  aiIcon = icons[currentGame.aiPers[b]];
                }
              }

              return (
                <div key={i} className={`cell ${isSafe ? 'safe' : 'danger'} ${isPlayer ? 'player' : ''}`}>
                  {aiIcon}
                </div>
              );
            })}
          </div>

          {!currentGame.over && currentGame.alive && (
            <div className="controls">
              <button className="control-btn d-pad-up" onClick={() => move('u')}>⬆️</button>
              <button className="control-btn d-pad-left" onClick={() => move('l')}>⬅️</button>
              <button className="control-btn d-pad-down" onClick={() => move('d')}>⬇️</button>
              <button className="control-btn d-pad-right" onClick={() => move('r')}>➡️</button>
            </div>
          )}

          {currentGame.over && (
            <div style={{ marginTop: 20 }}>
              <h2>{currentGame.alive ? '🎉 VICTORY!' : '💀 ELIMINATED'}</h2>
              <button onClick={() => practice ? setPracticeGame(null) : setGame(null)} className="control-btn">
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>
      )}

      <div className="log-panel">
        {logs.map((l, i) => <div key={i}>{l}</div>)}
        <div style={{ float: "left", clear: "both" }} ref={(el) => { el?.scrollIntoView({ behavior: "smooth" }); }}></div>
      </div>
    </div>
  );
}

export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <GameScreen />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
