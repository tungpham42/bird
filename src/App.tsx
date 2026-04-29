import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

// --- Global Constants ---
const PIPE_WIDTH = 75; // Thicker, friendlier width
const BIRD_SIZE = 44; // Cuter, larger bird
const BIRD_X_POSITION = 60;
const GROUND_HEIGHT = 80;

type Level = "Easy" | "Medium" | "Hard";

interface LevelConfig {
  gravity: number;
  jumpHeight: number;
  pipeSpeed: number;
  pipeSpawnRate: number; // ms
  pipeGap: number;
}

const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  Easy: {
    gravity: 3,
    jumpHeight: 60,
    pipeSpeed: 3,
    pipeSpawnRate: 1800,
    pipeGap: 240,
  },
  Medium: {
    gravity: 4,
    jumpHeight: 70,
    pipeSpeed: 5,
    pipeSpawnRate: 1500,
    pipeGap: 180,
  },
  Hard: {
    gravity: 5,
    jumpHeight: 80,
    pipeSpeed: 7,
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

  const [birdPos, setBirdPos] = useState<number>(300);
  const [pipes, setPipes] = useState<PipeData[]>([]);
  const [score, setScore] = useState<number>(0);

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
    // Quick pitch sweep up (classic jump sound)
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);

    // Volume envelope
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
    // Classic two-tone coin/score chime (B5 -> E6)
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);

    // Volume envelope
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

    // Sawtooth provides a harsher, buzzy retro sound
    osc.type = "sawtooth";
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    // Descending low-frequency pitch
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

    // Volume envelope
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
          setBirdPos(containerRef.current.clientHeight / 2);
        }
      }
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, [gameState]);

  // --- Game Loop (Physics & Movement) ---
  useEffect(() => {
    let timeId: ReturnType<typeof setInterval>;

    if (gameState === "PLAYING") {
      timeId = setInterval(() => {
        setBirdPos((prev) => prev + currentConfig.gravity);

        setPipes((prevPipes) => {
          return prevPipes
            .map((pipe) => ({ ...pipe, x: pipe.x - currentConfig.pipeSpeed }))
            .filter((pipe) => pipe.x + PIPE_WIDTH > -20);
        });
      }, 24); // ~40 FPS
    }

    return () => clearInterval(timeId);
  }, [gameState, currentConfig]);

  // --- Pipe Spawner ---
  useEffect(() => {
    let pipeId: ReturnType<typeof setInterval>;

    if (gameState === "PLAYING") {
      pipeId = setInterval(() => {
        const minPipeHeight = 60;
        const maxPipeHeight =
          size.height - GROUND_HEIGHT - currentConfig.pipeGap - minPipeHeight;

        const safeMaxHeight = Math.max(minPipeHeight, maxPipeHeight);
        const randomHeight =
          Math.floor(Math.random() * (safeMaxHeight - minPipeHeight + 1)) +
          minPipeHeight;

        setPipes((prev) => [
          ...prev,
          { x: size.width + 50, topHeight: randomHeight, passed: false },
        ]);
      }, currentConfig.pipeSpawnRate);
    }

    return () => clearInterval(pipeId);
  }, [gameState, currentConfig, size]);

  // --- Collision Detection & Scoring ---
  useEffect(() => {
    if (gameState !== "PLAYING") return;

    const birdHitboxSize = BIRD_SIZE - 8;
    const birdCenterY = birdPos + BIRD_SIZE / 2;

    const hasCollidedWithFloor =
      birdPos + BIRD_SIZE >= size.height - GROUND_HEIGHT;
    const hasCollidedWithCeiling = birdPos <= 0;

    if (hasCollidedWithFloor || hasCollidedWithCeiling) {
      playCrashSound();
      setGameState("GAME_OVER");
      return;
    }

    pipes.forEach((pipe, index) => {
      const inPipeHorizontalRange =
        BIRD_X_POSITION + birdHitboxSize >= pipe.x &&
        BIRD_X_POSITION <= pipe.x + PIPE_WIDTH;

      const hitTopPipe = birdCenterY - birdHitboxSize / 2 <= pipe.topHeight;
      const hitBottomPipe =
        birdCenterY + birdHitboxSize / 2 >=
        pipe.topHeight + currentConfig.pipeGap;

      if (inPipeHorizontalRange && (hitTopPipe || hitBottomPipe)) {
        playCrashSound();
        setGameState("GAME_OVER");
      }

      if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X_POSITION) {
        playScoreSound();
        setScore((prev) => prev + 1);
        setPipes((prev) => {
          const newPipes = [...prev];
          newPipes[index].passed = true;
          return newPipes;
        });
      }
    });
  }, [
    birdPos,
    pipes,
    gameState,
    currentConfig,
    size,
    playCrashSound,
    playScoreSound,
  ]);

  // --- Controls ---
  const handleJump = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      if (e) e.preventDefault();

      initAudio();

      if (gameState === "PLAYING") {
        playJumpSound();
        setBirdPos((prev) => Math.max(prev - currentConfig.jumpHeight, 0));
      }
    },
    [gameState, currentConfig, playJumpSound],
  );

  const startGame = async (selectedLevel: Level) => {
    await initAudio();
    setLevel(selectedLevel);
    setBirdPos(size.height / 2);
    setPipes([]);
    setScore(0);
    setGameState("PLAYING");
  };

  const returnToMenu = () => {
    setGameState("MENU");
    setBirdPos(size.height / 2);
    setPipes([]);
    setScore(0);
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
        onMouseDown={handleJump}
        onTouchStart={handleJump}
        style={{ cursor: gameState === "PLAYING" ? "pointer" : "default" }}
      >
        {/* Floating Background Clouds */}
        <div className="clouds-container">
          {/* Cloud 1 */}
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
          {/* Cloud 2 (Flipped Horizontally for organic variety) */}
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
          {/* Cloud 3 */}
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
          {/* Cloud 4 (Flipped Horizontally) */}
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

        {/* Play State UI */}
        {gameState === "PLAYING" && (
          <div className="score-display">{score}</div>
        )}

        {/* Main Menu Screen */}
        {gameState === "MENU" && (
          <div className="overlay-panel">
            <h1 className="overlay-title">Flappy!</h1>
            <p className="overlay-subtitle">Choose your challenge</p>
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

        {/* Game Over Screen */}
        {gameState === "GAME_OVER" && (
          <div className="overlay-panel">
            <h2 className="overlay-title">Oops!</h2>
            <p className="overlay-subtitle">You scored {score} points</p>
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

        {/* The Bird */}
        <div
          style={{
            position: "absolute",
            top: birdPos,
            left: BIRD_X_POSITION,
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            transition: "top 0.05s linear",
            transform:
              gameState === "PLAYING"
                ? `rotate(${currentConfig.gravity * 3}deg)`
                : "none",
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

        {/* Pipes */}
        {pipes.map((pipe, i) => {
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
                  left: pipe.x,
                  width: PIPE_WIDTH,
                  height: pipe.topHeight,
                  zIndex: 5, // Ensures it stacks above clouds but below bird
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
                  left: pipe.x,
                  width: PIPE_WIDTH,
                  height: bottomPipeHeight,
                  zIndex: 5, // Ensures it stacks above clouds but below bird
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
