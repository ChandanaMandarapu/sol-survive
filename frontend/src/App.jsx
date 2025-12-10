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
  const [logs, setLogs] = useState(['> SOLSURVIVE v2.0 initialized...', '> AI neural networks online...', '> Blockchain connected...']);
  const [practice, setPractice] = useState(false);
  const [practiceGame, setPracticeGame] = useState(null);
  const [txCount, setTxCount] = useState(0);
  const [showVictory, setShowVictory] = useState(false);
  const [killCam, setKillCam] = useState(null);
  const [particles, setParticles] = useState([]);

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet, { preflightCommitment: 'processed' });
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
      setGame(null);
    }
  };

  const findKiller = (acc) => {
    for (let i = 0; i < 9; i++) {
      if (acc.aiAlive[i] && acc.aiX[i] === acc.playerX && acc.aiY[i] === acc.playerY) {
        const names = ['🔥 AGGRO', '🛡️ DEFENSE', '😱 COWARD', '🎲 CHAOS'];
        setKillCam({ ai: i, name: names[acc.aiPersonality[i]], x: acc.aiX[i], y: acc.aiY[i] });
        return;
      }
    }
    setKillCam({ ai: -1, name: 'SAFE ZONE', x: acc.playerX, y: acc.playerY });
  };

  useEffect(() => {
    if (!practice) loadGame();
    const interval = setInterval(() => {
      if (!practice && wallet.publicKey) loadGame();
    }, 2000);
    return () => clearInterval(interval);
  }, [program, wallet.publicKey, practice]);

  const forceCloseAccount = async () => {
    if (!wallet.publicKey || !connection) return false;
    
    try {
      const pda = getGamePDA();
      const accountInfo = await connection.getAccountInfo(pda);
      
      if (accountInfo) {
        addLog('🗑️ Closing old account...');
        
        // Manual account close
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: pda,
            toPubkey: wallet.publicKey,
            lamports: accountInfo.lamports,
          })
        );
        
        // This will fail but that's okay - we just want to mark it for closure
        try {
          await wallet.sendTransaction(tx, connection);
        } catch (e) {
          // Expected to fail - account is owned by program
          addLog('⚠️ Manual close failed (expected). Use Solana CLI:');
          addLog(`solana program close ${pda.toString()}`);
          return false;
        }
      }
      return true;
    } catch (e) {
      return true; // Account doesn't exist, which is fine
    }
  };

  const createGame = async () => {
    if (!program) return;
    setLoading(true);
    addLog('🎮 Initializing on-chain battle arena...');
    
    try {
      const pda = getGamePDA();
      await program.methods.initializeGame().accounts({
        game: pda, player: wallet.publicKey, systemProgram: SystemProgram.programId
      }).rpc();
      setTxCount(prev => prev + 1);
      addLog('✅ Arena created! 0.05 SOL staked.');
      await loadGame();
    } catch (e) {
      const errMsg = e.message || e.toString();
      
      if (errMsg.includes('already in use') || errMsg.includes('0x0')) {
        addLog('🔄 Account exists, trying reset...');
        
        try {
          const pda = getGamePDA();
          await program.methods.resetGame().accounts({
            game: pda, player: wallet.publicKey, systemProgram: SystemProgram.programId
          }).rpc();
          setTxCount(prev => prev + 1);
          addLog('✅ Game reset! GL HF.');
          await loadGame();
        } catch (resetErr) {
          const resetMsg = resetErr.message || resetErr.toString();
          
          if (resetMsg.includes('account data')) {
            addLog('❌ Old account structure detected!');
            addLog('📋 MANUAL FIX REQUIRED:');
            addLog(`Run: solana program close ${getGamePDA().toString()}`);
            addLog('Then refresh and try again.');
          } else {
            addLog('❌ Reset error: ' + resetMsg.slice(0, 50));
          }
        }
      } else {
        addLog('❌ Error: ' + errMsg.slice(0, 60));
      }
    }
    setLoading(false);
  };

  const move = async (dir) => {
    if (loading) return;
    if (practice) { practiceMove(dir); return; }
    if (!program || !game) return;

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
      await program.methods.movePlayer(px, py).accounts({ game: pda, player: wallet.publicKey })
        .postInstructions([
          await program.methods.processAiTurn().accounts({ game: pda, player: wallet.publicKey }).instruction(),
          await program.methods.advanceRound().accounts({ game: pda, player: wallet.publicKey }).instruction()
        ]).rpc();

      setTxCount(prev => prev + 3);
      addLog('✅ Move confirmed!');
      spawnParticle(px, py);
      await loadGame();
    } catch (e) {
      addLog('❌ ' + e.message.slice(0, 50));
    }
    setLoading(false);
  };

  const spawnParticle = (x, y) => {
    const id = Date.now();
    setParticles(prev => [...prev, { id, x, y }]);
    setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 500);
  };

  const startPractice = () => {
    setPractice(true);
    setPracticeGame({
      px: 5, py: 5, alive: true,
      aiX: [1, 8, 1, 8, 4, 1, 8, 5, 4], aiY: [1, 1, 8, 8, 1, 5, 5, 8, 4],
      aiAlive: [true, true, true, true, true, true, true, true, true],
      aiPers: [0, 1, 2, 3, 0, 1, 2, 0, 3],
      round: 1, radius: 5, over: false,
      powerupX: 255, powerupY: 255, powerupType: 0, powerupActive: false,
      shield: false, speedBoost: 0, freeze: 0, combo: 0, multiplier: 1,
      moves: 0, killed: 0, collected: 0
    });
    addLog('[PRACTICE] Tutorial mode activated.');
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
      }
      if (g.powerupType === 4) g.freeze = 2;
    }
    
    if (g.freeze > 0) {
      addLog('AI FROZEN!');
    } else {
      for (let i = 0; i < 9; i++) {
        if (!g.aiAlive[i]) continue;
        const dx = g.px - g.aiX[i], dy = g.py - g.aiY[i];
        
        if (g.aiPers[i] === 0) {
          if (Math.abs(dx) > Math.abs(dy)) g.aiX[i] += dx > 0 ? 1 : -1;
          else g.aiY[i] += dy > 0 ? 1 : -1;
        } else if (g.aiPers[i] === 1) {
          if (g.aiX[i] < 5) g.aiX[i]++; else if (g.aiX[i] > 5) g.aiX[i]--;
          else if (g.aiY[i] < 5) g.aiY[i]++; else if (g.aiY[i] > 5) g.aiY[i]--;
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
            addLog('Shield blocked attack!');
          } else {
            g.alive = false;
            g.over = true;
            const names = ['AGGRO', 'DEFENSE', 'COWARD', 'CHAOS'];
            setKillCam({ ai: i, name: names[g.aiPers[i]], x: g.aiX[i], y: g.aiY[i] });
            addLog(`💀 Killed by ${names[g.aiPers[i]]} AI!`);
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
    if (pDist > g.radius) { g.alive = false; g.over = true; addLog('💀 Zone killed you!'); }
    
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
        <div className="version">v2.0 DEVNET</div>
      </div>

      <div className="wallet-section">
        {!practice && <WalletMultiButton className="wallet-btn" />}
        {practice && <button onClick={() => { setPractice(false); setPracticeGame(null); }} className="btn-secondary">EXIT PRACTICE</button>}
      </div>

      {showLobby ? (
        <div className="lobby">
          <div className="lobby-title">CHOOSE YOUR BATTLE</div>
          <div className="mode-buttons">
            <button onClick={startPractice} className="mode-btn practice">
              <div className="mode-icon">🤖</div>
              <div className="mode-name">PRACTICE MODE</div>
              <div className="mode-desc">Free • Learn mechanics • No wallet</div>
            </button>
            {!practice && wallet.publicKey && (
              <button onClick={createGame} disabled={loading} className="mode-btn real">
                <div className="mode-icon">💰</div>
                <div className="mode-name">REAL BATTLE</div>
                <div className="mode-desc">{loading ? 'DEPLOYING...' : '0.05 SOL • Win prize • On-chain'}</div>
              </button>
            )}
            {!wallet.publicKey && !practice && (
              <div className="mode-btn disabled">
                <div className="mode-icon">🔌</div>
                <div className="mode-name">CONNECT WALLET</div>
                <div className="mode-desc">Required for real battles</div>
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
                <span className="tx-label">COST (SOL)</span>
                <span className="tx-value">${txCost}</span>
              </div>
              <div className="tx-item eth">
                <span className="tx-label">VS ETHEREUM</span>
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
              <span className="stat-label">SAFE ZONE</span>
              <span className="stat-value zone">{currentGame.radius}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">COMBO</span>
              <span className={`stat-value combo ${currentGame.combo >= 5 ? 'active' : ''}`}>
                {currentGame.combo}x {currentGame.multiplier > 1 && `(${currentGame.multiplier}x 💰)`}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">STATUS</span>
              <span className={`stat-value ${currentGame.alive ? 'alive' : 'dead'}`}>
                {currentGame.over ? (currentGame.alive ? '👑 WINNER' : '💀 DEAD') : '💚 ALIVE'}
              </span>
            </div>
          </div>

          {currentGame.shield && <div className="powerup-indicator">🛡️ SHIELD ACTIVE</div>}
          {currentGame.speedBoost > 0 && <div className="powerup-indicator">⚡ SPEED x{currentGame.speedBoost}</div>}
          {currentGame.freeze > 0 && <div className="powerup-indicator">⏱️ AI FROZEN</div>}

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
                <div>Survived: {currentGame.round} rounds</div>
                <div>Combo: {currentGame.combo}x</div>
                <div>AI Killed: {currentGame.killed}</div>
              </div>
              <button onClick={() => practice ? setPracticeGame(null) : setGame(null)} className="btn-primary">
                TRY AGAIN
              </button>
            </div>
          )}

          {showVictory && (
            <div className="victory-screen">
              <div className="victory-title">🎉 VICTORY ROYALE! 🎉</div>
              <div className="victory-subtitle">SOLE SURVIVOR</div>
              <div className="victory-stats">
                <div className="victory-stat">
                  <span className="victory-label">Final Combo</span>
                  <span className="victory-value">{currentGame.combo}x</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">Prize Multiplier</span>
                  <span className="victory-value">{currentGame.multiplier}x 💰</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">AI Eliminated</span>
                  <span className="victory-value">{currentGame.killed}</span>
                </div>
                <div className="victory-stat">
                  <span className="victory-label">Total Moves</span>
                  <span className="victory-value">{currentGame.moves}</span>
                </div>
              </div>
              <button onClick={() => { practice ? setPracticeGame(null) : setGame(null); setShowVictory(false); }} className="btn-primary">
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