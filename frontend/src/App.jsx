import { Buffer } from 'buffer';
window.Buffer = Buffer;

import React, { useState, useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@project-serum/anchor';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

const PROGRAM_ID = new PublicKey('5mJUgVeCnRaXHY45RhTfrg7DVnWoVYRSYShZWFVFHgF6');

const IDL = {
  version: "0.1.0",
  name: "solsurvive",
  instructions: [
    { name: "initializeGame", accounts: [{ name: "game", isMut: true, isSigner: false }, { name: "player", isMut: true, isSigner: true }, { name: "systemProgram", isMut: false, isSigner: false }], args: [] },
    { name: "movePlayer", accounts: [{ name: "game", isMut: true, isSigner: false }, { name: "player", isMut: false, isSigner: true }], args: [{ name: "newX", type: "u8" }, { name: "newY", type: "u8" }] },
    { name: "processAiTurn", accounts: [{ name: "game", isMut: true, isSigner: false }, { name: "player", isMut: false, isSigner: true }], args: [] },
    { name: "advanceRound", accounts: [{ name: "game", isMut: true, isSigner: false }, { name: "player", isMut: false, isSigner: true }], args: [] },
    { name: "resetGame", accounts: [{ name: "game", isMut: true, isSigner: false }, { name: "player", isMut: true, isSigner: true }, { name: "systemProgram", isMut: false, isSigner: false }], args: [] }
  ],
  accounts: [{
    name: "game", type: { kind: "struct", fields: [
      { name: "player", type: "publicKey" }, { name: "playerX", type: "u8" }, { name: "playerY", type: "u8" }, { name: "playerAlive", type: "bool" },
      { name: "aiX", type: { array: ["u8", 9] } }, { name: "aiY", type: { array: ["u8", 9] } }, { name: "aiAlive", type: { array: ["bool", 9] } },
      { name: "aiPersonality", type: { array: ["u8", 9] } }, { name: "round", type: "u8" }, { name: "safeZoneRadius", type: "u8" },
      { name: "prizePool", type: "u64" }, { name: "gameOver", type: "bool" }, { name: "bump", type: "u8" },
      { name: "powerupX", type: "u8" }, { name: "powerupY", type: "u8" }, { name: "powerupType", type: "u8" }, { name: "powerupActive", type: "bool" },
      { name: "playerShield", type: "bool" }, { name: "playerSpeedBoost", type: "u8" }, { name: "playerFreezeRounds", type: "u8" },
      { name: "comboCount", type: "u8" }, { name: "comboMultiplier", type: "u8" },
      { name: "totalMoves", type: "u16" }, { name: "aiKilled", type: "u8" }, { name: "powerupsCollected", type: "u8" }
    ]}
  }]
};

function GameScreen() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState(['> SOLSURVIVE v2.0 ONLINE', '> Smart contract deployed', '> Ready to play']);
  const [practice, setPractice] = useState(false);
  const [practiceGame, setPracticeGame] = useState(null);
  const [txCount, setTxCount] = useState(0);
  const [showVictory, setShowVictory] = useState(false);
  const [killCam, setKillCam] = useState(null);
  const [particles, setParticles] = useState([]);

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(IDL, PROGRAM_ID, provider);
  }, [provider]);

  const addLog = (msg) => {
    setLogs(prev => [...prev.slice(-5), `> ${msg}`]);
  };

  const getGamePDA = () => {
    if (!wallet.publicKey) return null;
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('game'), wallet.publicKey.toBuffer()], PROGRAM_ID);
    return pda;
  };

  const loadGame = async () => {
    if (!program || !wallet.publicKey) return;
    try {
      const pda = getGamePDA();
      const acc = await program.account.game.fetch(pda);
      
      setGame({
        px: acc.playerX, py: acc.playerY, alive: acc.playerAlive,
        aiX: acc.aiX, aiY: acc.aiY, aiAlive: acc.aiAlive, aiPers: acc.aiPersonality,
        round: acc.round, radius: acc.safeZoneRadius, over: acc.gameOver,
        powerupX: acc.powerupX, powerupY: acc.powerupY, powerupType: acc.powerupType, powerupActive: acc.powerupActive,
        shield: acc.playerShield, speedBoost: acc.playerSpeedBoost, freeze: acc.playerFreezeRounds,
        combo: acc.comboCount, multiplier: acc.comboMultiplier,
        moves: acc.totalMoves, killed: acc.aiKilled, collected: acc.powerupsCollected
      });
      
      if (acc.gameOver) {
        if (acc.playerAlive) setShowVictory(true);
        else if (!killCam) findKiller(acc);
      }
    } catch (e) {
      console.log("Load game error:", e.message);
      setGame(null);
    }
  };

  const findKiller = (acc) => {
    for (let i = 0; i < 9; i++) {
      if (acc.aiAlive[i] && acc.aiX[i] === acc.playerX && acc.aiY[i] === acc.playerY) {
        const names = ['🔥 AGGRO', '🛡️ DEFENSE', '😱 COWARD', '🎲 CHAOS'];
        setKillCam({ ai: i, name: names[acc.aiPersonality[i]] });
        return;
      }
    }
    setKillCam({ ai: -1, name: '⚠️ SAFE ZONE' });
  };

  useEffect(() => {
    if (!practice && wallet.publicKey) {
      loadGame();
      const interval = setInterval(loadGame, 3000);
      return () => clearInterval(interval);
    }
  }, [program, wallet.publicKey, practice]);

  const createGame = async () => {
    if (!program || !wallet.publicKey) return;
    setLoading(true);
    addLog('🎮 Creating game...');
    
    try {
      const pda = getGamePDA();
      
      const tx = await program.methods.initializeGame()
        .accounts({
          game: pda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId
        })
        .rpc();
      
      setTxCount(prev => prev + 1);
      addLog('✅ Game created! Entry: 0.05 SOL');
      addLog('⏳ Loading game state...');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      await loadGame();
      
    } catch (e) {
      const msg = e.message || e.toString();
      console.error("Create game error:", e);
      
      if (msg.includes('0x0') || msg.includes('already in use')) {
        addLog('🔄 Existing game found, loading...');
        try {
          await loadGame();
          if (!game || game.over) {
            addLog('♻️ Resetting game...');
            const pda = getGamePDA();
            await program.methods.resetGame()
              .accounts({
                game: pda,
                player: wallet.publicKey,
                systemProgram: SystemProgram.programId
              })
              .rpc();
            setTxCount(prev => prev + 1);
            addLog('✅ Game reset!');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await loadGame();
          } else {
            addLog('✅ Resuming game!');
          }
        } catch (resetErr) {
          addLog('❌ Reset failed: ' + resetErr.message.slice(0, 40));
          addLog('💡 Try refreshing page');
        }
      } else {
        addLog('❌ Error: ' + msg.slice(0, 50));
      }
    }
    
    setLoading(false);
  };

  const move = async (dir) => {
    if (loading) return;
    if (practice) { practiceMove(dir); return; }
    if (!program || !game || !game.alive) return;

    setLoading(true);
    const arrows = { u: '⬆️', d: '⬇️', l: '⬅️', r: '➡️' };
    addLog(`${arrows[dir]} Moving...`);
    
    try {
      let { px, py } = game;
      const maxDist = game.speedBoost > 0 ? 3 : 1;
      
      if (dir === 'u') py = Math.max(0, py - maxDist);
      if (dir === 'd') py = Math.min(9, py + maxDist);
      if (dir === 'l') px = Math.max(0, px - maxDist);
      if (dir === 'r') px = Math.min(9, px + maxDist);

      const pda = getGamePDA();
      const tx = await program.methods.movePlayer(px, py)
        .accounts({ game: pda, player: wallet.publicKey })
        .postInstructions([
          await program.methods.processAiTurn().accounts({ game: pda, player: wallet.publicKey }).instruction(),
          await program.methods.advanceRound().accounts({ game: pda, player: wallet.publicKey }).instruction()
        ])
        .rpc();

      setTxCount(prev => prev + 3);
      addLog('✅ Move confirmed!');
      spawnParticle(px, py);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      await loadGame();
      
    } catch (e) {
      console.error("Move error:", e);
      addLog('❌ ' + e.message.slice(0, 50));
    }
    
    setLoading(false);
  };

  const spawnParticle = (x, y) => {
    const id = Date.now() + Math.random();
    setParticles(prev => [...prev, { id, x, y }]);
    setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 600);
  };

  const startPractice = () => {
    setPractice(true);
    setKillCam(null);
    setShowVictory(false);
    setPracticeGame({
      px: 5, py: 5, alive: true,
      aiX: [1, 8, 1, 8, 4, 1, 8, 5, 4],
      aiY: [1, 1, 8, 8, 1, 5, 5, 8, 4],
      aiAlive: [true, true, true, true, true, true, true, true, true],
      aiPers: [0, 1, 2, 3, 0, 1, 2, 0, 3],
      round: 1, radius: 5, over: false,
      powerupX: 255, powerupY: 255, powerupType: 0, powerupActive: false,
      shield: false, speedBoost: 0, freeze: 0, combo: 0, multiplier: 1,
      moves: 0, killed: 0, collected: 0
    });
    addLog('[PRACTICE] Free mode started');
  };

  const practiceMove = (dir) => {
    if (!practiceGame || practiceGame.over) return;
    let g = { ...practiceGame };
    
    const maxDist = g.speedBoost > 0 ? 3 : 1;
    if (dir === 'u') g.py = Math.max(0, g.py - maxDist);
    if (dir === 'd') g.py = Math.min(9, g.py + maxDist);
    if (dir === 'l') g.px = Math.max(0, g.px - maxDist);
    if (dir === 'r') g.px = Math.min(9, g.px + maxDist);
    
    g.moves++;
    if (g.speedBoost > 0) g.speedBoost--;
    
    if (g.powerupActive && g.powerupX === g.px && g.powerupY === g.py) {
      g.powerupActive = false;
      g.collected++;
      const types = ['', '⚡ SPEED', '🛡️ SHIELD', '💣 BOMB', '⏱️ FREEZE', '💰 BONUS'];
      addLog(`Collected ${types[g.powerupType]}!`);
      
      if (g.powerupType === 1) g.speedBoost = 3;
      if (g.powerupType === 2) g.shield = true;
      if (g.powerupType === 3) {
        for (let i = 0; i < 9; i++) {
          if (!g.aiAlive[i]) continue;
          const dist = Math.abs(g.aiX[i] - g.px) + Math.abs(g.aiY[i] - g.py);
          if (dist <= 2) { g.aiAlive[i] = false; g.killed++; }
        }
        addLog('💣 Bomb exploded!');
      }
      if (g.powerupType === 4) g.freeze = 2;
    }
    
    if (g.freeze > 0) {
      addLog('⏱️ AI frozen!');
    } else {
      for (let i = 0; i < 9; i++) {
        if (!g.aiAlive[i]) continue;
        const dx = g.px - g.aiX[i], dy = g.py - g.aiY[i];
        
        if (g.aiPers[i] === 0) {
          if (Math.abs(dx) > Math.abs(dy)) g.aiX[i] += dx > 0 ? 1 : -1;
          else g.aiY[i] += dy > 0 ? 1 : -1;
        } else if (g.aiPers[i] === 1) {
          if (g.aiX[i] < 5) g.aiX[i]++;
          else if (g.aiX[i] > 5) g.aiX[i]--;
          else if (g.aiY[i] < 5) g.aiY[i]++;
          else if (g.aiY[i] > 5) g.aiY[i]--;
        } else if (g.aiPers[i] === 2) {
          if (Math.abs(dx) > Math.abs(dy)) g.aiX[i] -= dx > 0 ? 1 : -1;
          else g.aiY[i] -= dy > 0 ? 1 : -1;
        } else {
          const r = Math.random();
          if (r < 0.25) g.aiY[i] = Math.max(0, g.aiY[i] - 1);
          else if (r < 0.5) g.aiY[i] = Math.min(9, g.aiY[i] + 1);
          else if (r < 0.75) g.aiX[i] = Math.max(0, g.aiX[i] - 1);
          else g.aiX[i] = Math.min(9, g.aiX[i] + 1);
        }
        
        g.aiX[i] = Math.max(0, Math.min(9, g.aiX[i]));
        g.aiY[i] = Math.max(0, Math.min(9, g.aiY[i]));
        
        if (g.aiX[i] === g.px && g.aiY[i] === g.py) {
          if (g.shield) {
            g.shield = false;
            g.aiAlive[i] = false;
            g.killed++;
            addLog('🛡️ Shield blocked!');
          } else {
            g.alive = false;
            g.over = true;
            const names = ['🔥 AGGRO', '🛡️ DEFENSE', '😱 COWARD', '🎲 CHAOS'];
            setKillCam({ ai: i, name: names[g.aiPers[i]] });
          }
        }
      }
    }
    
    if (!g.over) {
      g.combo++;
      if (g.combo >= 15) g.multiplier = 3;
      else if (g.combo >= 10) g.multiplier = 2;
      else if (g.combo >= 5) g.multiplier = 2;
    }
    
    g.round++;
    if (g.round % 2 === 0 && g.radius > 1) g.radius--;
    if (g.freeze > 0) g.freeze--;
    
    if (g.round % 2 === 0 && !g.powerupActive) {
      g.powerupX = Math.floor(Math.random() * 8) + 1;
      g.powerupY = Math.floor(Math.random() * 8) + 1;
      g.powerupType = Math.floor(Math.random() * 5) + 1;
      g.powerupActive = true;
    }
    
    const pDist = Math.abs(g.px - 5) + Math.abs(g.py - 5);
    if (pDist > g.radius) {
      g.alive = false;
      g.over = true;
      setKillCam({ ai: -1, name: '⚠️ SAFE ZONE' });
    }
    
    for (let i = 0; i < 9; i++) {
      if (!g.aiAlive[i]) continue;
      const dist = Math.abs(g.aiX[i] - 5) + Math.abs(g.aiY[i] - 5);
      if (dist > g.radius) { g.aiAlive[i] = false; g.killed++; }
    }
    
    if (g.round > 10 || !g.alive) g.over = true;
    if (g.over && g.alive) setShowVictory(true);
    
    setPracticeGame(g);
    spawnParticle(g.px, g.py);
  };

  const currentGame = practice ? practiceGame : game;
  const showLobby = !currentGame;
  
  const txCost = (txCount * 0.000005).toFixed(6);
  const ethCost = (txCount * 15).toFixed(0);

  return (
    <div className="game-container">
      <div className="header">
        <h1>⚡ SOLSURVIVE ⚡</h1>
        <div className="version">v2.0 • DEVNET</div>
      </div>

      <div className="wallet-section">
        {!practice && <WalletMultiButton className="wallet-btn" />}
        {practice && (
          <button 
            onClick={() => { 
              setPractice(false); 
              setPracticeGame(null); 
              setKillCam(null); 
              setShowVictory(false); 
            }} 
            className="btn-secondary"
          >
            EXIT PRACTICE
          </button>
        )}
      </div>

      {showLobby ? (
        <div className="lobby">
          <div className="lobby-title">CHOOSE YOUR BATTLE</div>
          <div className="mode-buttons">
            <button onClick={startPractice} className="mode-btn practice">
              <div className="mode-icon">🤖</div>
              <div className="mode-name">PRACTICE MODE</div>
              <div className="mode-desc">Free • No wallet • Instant play</div>
            </button>
            {!practice && wallet.publicKey && (
              <button onClick={createGame} disabled={loading} className="mode-btn real">
                <div className="mode-icon">💰</div>
                <div className="mode-name">REAL BATTLE</div>
                <div className="mode-desc">{loading ? 'CREATING...' : '0.05 SOL • On-chain • Win prize'}</div>
              </button>
            )}
            {!wallet.publicKey && !practice && (
              <div className="mode-btn disabled">
                <div className="mode-icon">🔌</div>
                <div className="mode-name">CONNECT WALLET</div>
                <div className="mode-desc">Phantom • Devnet mode</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {!practice && (
            <div className="tx-dashboard">
              <div className="tx-item">
                <span className="tx-label">TRANSACTIONS</span>
                <span className="tx-value">{txCount}</span>
              </div>
              <div className="tx-item">
                <span className="tx-label">COST</span>
                <span className="tx-value">${txCost}</span>
              </div>
              <div className="tx-item eth">
                <span className="tx-label">VS ETH</span>
                <span className="tx-value">${ethCost}</span>
              </div>
            </div>
          )}

          <div className="stats-panel">
            <div className="stat-item">
              <span className="stat-label">ROUND</span>
              <span className="stat-value">{currentGame.round}/10</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">ZONE</span>
              <span className="stat-value zone">{currentGame.radius}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">COMBO</span>
              <span className={`stat-value combo ${currentGame.combo >= 5 ? 'active' : ''}`}>
                {currentGame.combo}x{currentGame.multiplier > 1 && ` (${currentGame.multiplier}x💰)`}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">STATUS</span>
              <span className={`stat-value ${currentGame.alive ? 'alive' : 'dead'}`}>
                {currentGame.over ? (currentGame.alive ? '👑 WIN' : '💀 DEAD') : '💚 ALIVE'}
              </span>
            </div>
          </div>

          {currentGame.shield && <div className="powerup-indicator">🛡️ SHIELD</div>}
          {currentGame.speedBoost > 0 && <div className="powerup-indicator">⚡ SPEED x{currentGame.speedBoost}</div>}
          {currentGame.freeze > 0 && <div className="powerup-indicator">⏱️ FROZEN</div>}

          <div className="grid-container">
            <div className="grid-board">
              {Array.from({ length: 100 }).map((_, i) => {
                const x = i % 10, y = Math.floor(i / 10);
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
                
                const isPowerup = currentGame.powerupActive && currentGame.powerupX === x && currentGame.powerupY === y;
                const powerupIcons = ['', '⚡', '🛡️', '💣', '⏱️', '💰'];
                
                return (
                  <div key={i} className={`cell ${isSafe ? 'safe' : 'danger'} ${isPlayer ? 'player' : ''} ${aiIcon ? 'ai' : ''} ${isPowerup ? 'powerup' : ''}`}>
                    {aiIcon && <span className="ai-icon">{aiIcon}</span>}
                    {isPowerup && <span className="powerup-icon">{powerupIcons[currentGame.powerupType]}</span>}
                    {isPlayer && <span className="player-icon">🟢</span>}
                    {particles.filter(p => p.x === x && p.y === y).map(p => <div key={p.id} className="particle" />)}
                  </div>
                );
              })}
            </div>
          </div>

          {!currentGame.over && currentGame.alive && (
            <div className="controls">
              <button className="control-btn" onClick={() => move('u')} disabled={loading}>⬆️</button>
              <button className="control-btn" onClick={() => move('l')} disabled={loading}>⬅️</button>
              <button className="control-btn" onClick={() => move('d')} disabled={loading}>⬇️</button>
              <button className="control-btn" onClick={() => move('r')} disabled={loading}>➡️</button>
            </div>
          )}

          {currentGame.over && killCam && !showVictory && (
            <div className="killcam">
              <div className="killcam-title">💀 ELIMINATED</div>
              <div className="killcam-by">Killed by: {killCam.name}</div>
              <div className="killcam-stats">
                <div>Rounds: {currentGame.round}</div>
                <div>Combo: {currentGame.combo}x</div>
                <div>Killed: {currentGame.killed} AI</div>
              </div>
              <button 
                onClick={() => {
                  if (practice) {
                    setPracticeGame(null);
                    setKillCam(null);
                  } else {
                    setGame(null);
                    setKillCam(null);
                  }
                }} 
                className="btn-primary"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {showVictory && (
            <div className="victory-screen">
              <div className="victory-title">🎉 VICTORY! 🎉</div>
              <div className="victory-subtitle">SOLE SURVIVOR</div>
              <div className="victory-stats">
                <div className="victory-stat">
                  <span className="victory-label">Combo</span>
                  <span className="victory-value">{currentGame.combo}x</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">Multiplier</span>
                  <span className="victory-value">{currentGame.multiplier}x 💰</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">AI Killed</span>
                  <span className="victory-value">{currentGame.killed}</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">Moves</span>
                  <span className="victory-value">{currentGame.moves}</span>
                </div>
              </div>
              <button 
                onClick={() => {
                  if (practice) {
                    setPracticeGame(null);
                    setShowVictory(false);
                  } else {
                    setGame(null);
                    setShowVictory(false);
                  }
                }} 
                className="btn-primary"
              >
                PLAY AGAIN
              </button>
            </div>
          )}
        </>
      )}

      <div className="log-panel">
        <div className="log-title">SYSTEM LOG</div>
        {logs.map((l, i) => <div key={i} className="log-line">{l}</div>)}
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