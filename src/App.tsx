import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

// --- Global Constants ---
const PIPE_WIDTH = 75;
const BIRD_SIZE = 44;
const BIRD_X_POSITION = 60;
const GROUND_HEIGHT = 80;

type Level = "Easy" | "Medium" | "Hard";

interface LevelConfig {
  gravity: number;
  jumpStrength: number;
  pipeSpeed: number;
  pipeSpawnRate: number; // ms
  pipeGap: number;
}

const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  Easy: {
    gravity: 0.2,
    jumpStrength: -5.5,
    pipeSpeed: 3,
    pipeSpawnRate: 1800,
    pipeGap: 240,
  },
  Medium: {
    gravity: 0.25,
    jumpStrength: -6.5,
    pipeSpeed: 4.5,
    pipeSpawnRate: 1500,
    pipeGap: 180,
  },
  Hard: {
    gravity: 0.35,
    jumpStrength: -7.5,
    pipeSpeed: 6,
    pipeSpawnRate: 1100,
    pipeGap: 140,
  },
};

type GameState = "MENU" | "PLAYING" | "GAME_OVER";

interface PipeData {
  x: number;
  topHeight: number;
  passed: boolean;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [level, setLevel] = useState<Level>("Medium");

  // Game Engine Logic
  const birdPosRef = useRef<number>(300);
  const birdVelocityRef = useRef<number>(0);
  const pipesRef = useRef<PipeData[]>([]);
  const scoreRef = useRef<number>(0);

  // Timing Refs for Delta Time
  const lastPipeSpawnRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0); // Tracks time between frames
  const reqIdRef = useRef<number>(0);

  const [, setRenderTick] = useState(0);

  const currentConfig = LEVEL_CONFIGS[level];

  // --- Web Audio API (Synthesizers) ---
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = async () => {
    if (!audioCtxRef.current) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
  };

  const playJumpSound = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }, []);

  const playScoreSound = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0.3, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }, []);

  const playCrashSound = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }, []);

  // --- Responsive Resize Handler ---
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        if (gameState === "MENU") {
          birdPosRef.current = containerRef.current.clientHeight / 2;
          setRenderTick((t) => t + 1);
        }
      }
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, [gameState]);

  // --- Unified Game Loop (Physics, Spawning & Collision) ---
  useEffect(() => {
    if (gameState !== "PLAYING") return;

    const updateLoop = (currentTime: number) => {
      // 0. Calculate Delta Time (dt) to ensure smoothness regardless of monitor refresh rate
      if (lastTimeRef.current === 0) lastTimeRef.current = currentTime;
      let dt = currentTime - lastTimeRef.current;

      // Cap delta time to prevent physics from breaking if the user switches browser tabs
      if (dt > 100) dt = 16.66;
      lastTimeRef.current = currentTime;

      // Normalize to a baseline of 60fps (16.66ms per frame)
      const timeScale = dt / 16.66;

      // 1. Áp dụng Vật lý (Scaled by Delta Time)
      birdVelocityRef.current += currentConfig.gravity * timeScale;

      if (birdVelocityRef.current > 8) {
        birdVelocityRef.current = 8;
      }

      birdPosRef.current += birdVelocityRef.current * timeScale;

      // 2. Di chuyển các ống cống (Scaled by Delta Time)
      pipesRef.current = pipesRef.current
        .map((pipe) => ({
          ...pipe,
          x: pipe.x - currentConfig.pipeSpeed * timeScale,
        }))
        .filter((pipe) => pipe.x + PIPE_WIDTH > -20);

      // 3. Spawner
      if (
        currentTime - lastPipeSpawnRef.current >=
        currentConfig.pipeSpawnRate
      ) {
        const minPipeHeight = 60;
        const maxPipeHeight =
          size.height - GROUND_HEIGHT - currentConfig.pipeGap - minPipeHeight;
        const safeMaxHeight = Math.max(minPipeHeight, maxPipeHeight);
        const randomHeight =
          Math.floor(Math.random() * (safeMaxHeight - minPipeHeight + 1)) +
          minPipeHeight;

        pipesRef.current.push({
          x: size.width + 50,
          topHeight: randomHeight,
          passed: false,
        });
        lastPipeSpawnRef.current = currentTime;
      }

      // 4. Phát hiện va chạm
      const hitboxWidth = 24;
      const hitboxHeight = 24;

      const birdLeft = BIRD_X_POSITION + (BIRD_SIZE - hitboxWidth) / 2;
      const birdRight = birdLeft + hitboxWidth;
      const birdTop = birdPosRef.current + (BIRD_SIZE - hitboxHeight) / 2;
      const birdBottom = birdTop + hitboxHeight;

      let isGameOver = false;

      if (
        birdPosRef.current + BIRD_SIZE >= size.height - GROUND_HEIGHT ||
        birdPosRef.current <= 0
      ) {
        isGameOver = true;
      }

      pipesRef.current.forEach((pipe) => {
        const inPipeHorizontalRange =
          birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH;
        const hitTopPipe = birdTop < pipe.topHeight;
        const hitBottomPipe =
          birdBottom > pipe.topHeight + currentConfig.pipeGap;

        if (inPipeHorizontalRange && (hitTopPipe || hitBottomPipe)) {
          isGameOver = true;
        }

        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdLeft) {
          pipe.passed = true;
          scoreRef.current += 1;
          playScoreSound();
        }
      });

      if (isGameOver) {
        playCrashSound();
        setGameState("GAME_OVER");
        return;
      }

      setRenderTick((t) => t + 1);
      reqIdRef.current = requestAnimationFrame(updateLoop);
    };

    reqIdRef.current = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(reqIdRef.current);
  }, [gameState, currentConfig, size, playCrashSound, playScoreSound]);

  // --- Controls ---
  const handleJump = useCallback(
    (e?: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
      if (e) e.preventDefault();
      initAudio();
      if (gameState === "PLAYING") {
        playJumpSound();
        birdVelocityRef.current = currentConfig.jumpStrength;
      }
    },
    [gameState, currentConfig, playJumpSound],
  );

  const startGame = async (selectedLevel: Level) => {
    await initAudio();
    setLevel(selectedLevel);
    birdPosRef.current = size.height / 2;
    birdVelocityRef.current = 0;
    pipesRef.current = [];
    scoreRef.current = 0;
    lastPipeSpawnRef.current = performance.now();
    lastTimeRef.current = performance.now(); // Reset time to prevent logic jumps
    setGameState("PLAYING");
  };

  const returnToMenu = () => {
    setGameState("MENU");
    birdPosRef.current = size.height / 2;
    pipesRef.current = [];
    scoreRef.current = 0;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleJump();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleJump]);

  return (
    <div className="game-wrapper">
      <div
        className={`game-container ${gameState === "GAME_OVER" ? "game-over" : ""}`}
        ref={containerRef}
        onPointerDown={handleJump}
        style={{
          cursor: gameState === "PLAYING" ? "pointer" : "default",
          touchAction: "none",
        }}
      >
        {/* Floating Background Clouds */}
        <div className="clouds-container">
          {/* SVG definitions remain unchanged */}
          <div className="cloud cloud-1">
            <svg viewBox="0 0 100 60" width="100%" height="100%">
              <g opacity="0.5" fill="#fff">
                <circle cx="25" cy="40" r="15" />
                <circle cx="45" cy="30" r="25" />
                <circle cx="75" cy="35" r="20" />
                <rect x="25" y="30" width="50" height="25" />
              </g>
            </svg>
          </div>
          <div className="cloud cloud-2">
            <svg
              viewBox="0 0 100 60"
              width="100%"
              height="100%"
              style={{ transform: "scaleX(-1)" }}
            >
              <g opacity="0.6" fill="#fff">
                <circle cx="25" cy="40" r="15" />
                <circle cx="45" cy="30" r="25" />
                <circle cx="75" cy="35" r="20" />
                <rect x="25" y="30" width="50" height="25" />
              </g>
            </svg>
          </div>
          <div className="cloud cloud-3">
            <svg viewBox="0 0 100 60" width="100%" height="100%">
              <g opacity="0.4" fill="#fff">
                <circle cx="25" cy="40" r="15" />
                <circle cx="45" cy="30" r="25" />
                <circle cx="75" cy="35" r="20" />
                <rect x="25" y="30" width="50" height="25" />
              </g>
            </svg>
          </div>
          <div className="cloud cloud-4">
            <svg
              viewBox="0 0 100 60"
              width="100%"
              height="100%"
              style={{ transform: "scaleX(-1)" }}
            >
              <g opacity="0.5" fill="#fff">
                <circle cx="25" cy="40" r="15" />
                <circle cx="45" cy="30" r="25" />
                <circle cx="75" cy="35" r="20" />
                <rect x="25" y="30" width="50" height="25" />
              </g>
            </svg>
          </div>
        </div>

        {gameState === "PLAYING" && (
          <div className="score-display">{scoreRef.current}</div>
        )}

        {gameState === "MENU" && (
          <div className="overlay-panel">
            <h1 className="overlay-title">Softy Bird</h1>
            <p className="overlay-subtitle">Choose your level</p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {(Object.keys(LEVEL_CONFIGS) as Level[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={(e) => {
                    e.stopPropagation();
                    startGame(lvl);
                  }}
                  className={`btn-friendly btn-${lvl.toLowerCase()}`}
                >
                  {lvl} Mode
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === "GAME_OVER" && (
          <div className="overlay-panel">
            <h2 className="overlay-title">Oops!</h2>
            <p className="overlay-subtitle">
              You scored {scoreRef.current} points
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                width: "100%",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startGame(level);
                }}
                className="btn-friendly btn-action"
              >
                Try Again
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  returnToMenu();
                }}
                className="btn-friendly btn-menu"
              >
                Main Menu
              </button>
            </div>
          </div>
        )}

        {/* The Bird: Switched from 'top/left' to 'translate3d' for smooth hardware acceleration */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            transform: `translate3d(${BIRD_X_POSITION}px, ${birdPosRef.current}px, 0) rotate(${
              gameState === "PLAYING"
                ? Math.min(Math.max(birdVelocityRef.current * 4, -25), 90)
                : 0
            }deg)`,
            zIndex: 10,
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            style={{ overflow: "visible" }}
          >
            <ellipse
              cx="50"
              cy="56"
              rx="40"
              ry="32"
              fill="rgba(92, 64, 51, 0.2)"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="40"
              ry="32"
              fill="#ffd166"
              stroke="#5c4033"
              strokeWidth="6"
            />
            <path
              d="M 15 50 Q 30 30 50 55 Z"
              fill="#fff5eb"
              stroke="#5c4033"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <circle
              cx="70"
              cy="38"
              r="12"
              fill="white"
              stroke="#5c4033"
              strokeWidth="5"
            />
            <circle cx="74" cy="38" r="5" fill="#5c4033" />
            <path
              d="M 80 46 Q 98 52 78 60 Z"
              fill="#ef476f"
              stroke="#5c4033"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Pipes: Switched from 'left' to 'translate3d' for smooth hardware acceleration */}
        {pipesRef.current.map((pipe, i) => {
          const bottomPipeHeight =
            size.height -
            pipe.topHeight -
            currentConfig.pipeGap -
            GROUND_HEIGHT;
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: PIPE_WIDTH,
                  height: pipe.topHeight,
                  transform: `translate3d(${pipe.x}px, 0, 0)`,
                  zIndex: 5,
                }}
              >
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  <rect
                    x="6"
                    y="-10"
                    width={PIPE_WIDTH - 12}
                    height={pipe.topHeight}
                    fill="#a2d149"
                    stroke="#5c4033"
                    strokeWidth="6"
                  />
                  <rect
                    x="0"
                    y={pipe.topHeight - 30}
                    width={PIPE_WIDTH}
                    height="30"
                    rx="10"
                    fill="#a2d149"
                    stroke="#5c4033"
                    strokeWidth="6"
                  />
                  <rect
                    x="14"
                    y="-10"
                    width="8"
                    height={pipe.topHeight - 30}
                    fill="#c4f07a"
                    opacity="0.6"
                  />
                </svg>
              </div>

              <div
                style={{
                  position: "absolute",
                  top: pipe.topHeight + currentConfig.pipeGap,
                  left: 0,
                  width: PIPE_WIDTH,
                  height: bottomPipeHeight,
                  transform: `translate3d(${pipe.x}px, 0, 0)`,
                  zIndex: 5,
                }}
              >
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  <rect
                    x="6"
                    y="20"
                    width={PIPE_WIDTH - 12}
                    height={bottomPipeHeight}
                    fill="#a2d149"
                    stroke="#5c4033"
                    strokeWidth="6"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={PIPE_WIDTH}
                    height="30"
                    rx="10"
                    fill="#a2d149"
                    stroke="#5c4033"
                    strokeWidth="6"
                  />
                  <rect
                    x="14"
                    y="30"
                    width="8"
                    height={bottomPipeHeight}
                    fill="#c4f07a"
                    opacity="0.6"
                  />
                </svg>
              </div>
            </React.Fragment>
          );
        })}

        {/* Ground */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            height: GROUND_HEIGHT,
            zIndex: 15,
          }}
        >
          <svg width="100%" height="100%" preserveAspectRatio="none">
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="#e09f5a"
              stroke="#5c4033"
              strokeWidth="8"
            />
            <rect
              x="0"
              y="0"
              width="100%"
              height="16"
              fill="#f4c878"
              stroke="#5c4033"
              strokeWidth="6"
            />
            <line
              x1="10%"
              y1="40"
              x2="20%"
              y2="40"
              stroke="#c87a38"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="45%"
              y1="55"
              x2="52%"
              y2="55"
              stroke="#c87a38"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="75%"
              y1="35"
              x2="88%"
              y2="35"
              stroke="#c87a38"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
