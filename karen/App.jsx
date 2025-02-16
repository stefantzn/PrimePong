import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  // Define game phases: 'waiting', 'starting', 'serving', 'game'
  const [gamePhase, setGamePhase] = useState('waiting');

  // Track which player is currently serving ('A' or 'B')
  const [currentServer, setCurrentServer] = useState('A');

  // MAIN GAME STATES (used in the "game" phase)
  const [gameScore, setGameScore] = useState({ A: 0, B: 0 });
  const [playerAStats, setPlayerAStats] = useState({
    totalHits: 0,
    recentSwingSpeed: 0,
    accuracy: 0,
  });
  const [playerBStats, setPlayerBStats] = useState({
    totalHits: 0,
    recentSwingSpeed: 0,
    accuracy: 0,
  });

  // EVENT STATES (for overlays)
  const [centerHitEvent, setCenterHitEvent] = useState(false);
  const [scoreEvent, setScoreEvent] = useState(null); // 'A' or 'B'

  // AUDIO FILE PATHS (assumed to be in the public folder)
  const scoreSounds = [
    '/scoreSound1.mp3',
    '/scoreSound2.mp3',
    '/scoreSound3.mp3',
    '/scoreSound4.mp3',
    '/scoreSound5.mp3',
  ];
  const centerHitSound = '/centerHit.mp3';
  const startGameSound = '/startGameSound.mp3';

  // --- NEW: SENSOR DATA STATES ---
  const [sensorData, setSensorData] = useState({
    force_value: 0,
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    movement: 'Still',
    hit: false,
    swing: false,
  });

  // Fetch sensor data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('http://172.20.10.12/') // Replace with your ESP8266 IP
        .then((response) => response.json())
        .then((data) => {
          // data might look like:
          // {
          //   force_value: 5,
          //   accel_x: 9.86,
          //   accel_y: -0.21,
          //   accel_z: 0.08,
          //   movement: "Slow",
          //   hit: 0,            // 0 or 1
          //   swing: 1           // 0 or 1
          // }
          setSensorData({
            force_value: data.force_value,
            accel_x: data.accel_x,
            accel_y: data.accel_y,
            accel_z: data.accel_z,
            movement: data.movement,
            hit: !!data.hit,      // Convert 0/1 to boolean
            swing: !!data.swing,  // Convert 0/1 to boolean
          });
        })
        .catch((err) => {
          console.error('Error fetching sensor data:', err);
        });
    }, 1000); // fetch once every second

    return () => clearInterval(interval);
  }, []);

  // HELPER: Play a random score sound
  const playRandomScoreSound = () => {
    const randomIndex = Math.floor(Math.random() * scoreSounds.length);
    const audio = new Audio(scoreSounds[randomIndex]);
    audio.play();
  };

  // HELPER: Play center hit sound
  const playCenterHitSound = () => {
    const audio = new Audio(centerHitSound);
    audio.play();
  };

  // HELPER: Play start game sound
  const playStartGameSound = () => {
    const audio = new Audio(startGameSound);
    audio.play();
  };

  // --- PHASE TRANSITIONS ---

  // 1) WAITING -> STARTING -> SERVING -> GAME
  const simulateSensorsPressed = () => {
    // Move from waiting -> starting
    playStartGameSound();
    setGamePhase('starting');

    // After 2 seconds, move to "serving" for Player A
    setTimeout(() => {
      setCurrentServer('A');
      setGamePhase('serving');

      // After 3 seconds, move to the main game
      setTimeout(() => {
        setGamePhase('game');
      }, 3000);
    }, 2000);
  };

  // 2) Show the serve screen for whichever player is now serving
  //    then go back to the main game after 2 seconds
  const showServeScreen = (server) => {
    setCurrentServer(server);
    setGamePhase('serving');
    setTimeout(() => {
      setGamePhase('game');
    }, 2000);
  };

  // --- CENTER HIT EVENT ---
  const triggerCenterHit = () => {
    playCenterHitSound();
    setCenterHitEvent(true);
    setTimeout(() => setCenterHitEvent(false), 3000);
  };

  // --- SCORING EVENT ---
  const triggerScoreEvent = (winner) => {
    playRandomScoreSound();

    // Update score and stats based on the winner
    setGameScore((prev) => {
      const newA = winner === 'A' ? prev.A + 1 : prev.A;
      const newB = winner === 'B' ? prev.B + 1 : prev.B;

      if (winner === 'A') {
        setPlayerAStats((prevStats) => {
          const newHits = prevStats.totalHits + 1;
          const newAccuracy = newB > 0 ? Math.round((newHits / newB) * 100) : 0;
          return {
            ...prevStats,
            totalHits: newHits,
            recentSwingSpeed: Math.random() * 10,
            accuracy: newAccuracy,
          };
        });
      } else {
        setPlayerBStats((prevStats) => {
          const newHits = prevStats.totalHits + 1;
          const newAccuracy = newA > 0 ? Math.round((newHits / newA) * 100) : 0;
          return {
            ...prevStats,
            totalHits: newHits,
            recentSwingSpeed: Math.random() * 10,
            accuracy: newAccuracy,
          };
        });
      }

      return { A: newA, B: newB };
    });

    // Show the "Score!" / "Good Try!" overlay
    setScoreEvent(winner);
    setTimeout(() => {
      setScoreEvent(null);

      // After the overlay, show the "serve" screen for the scoring player
      showServeScreen(winner);
    }, 3000);
  };

  // ----------------------------------------------------
  // RENDER BASED ON GAME PHASE
  // ----------------------------------------------------
  if (gamePhase === 'waiting') {
    // WAITING SCREEN
    return (
      <div className="waiting-screen">
        <img
          src="/paddles.png"
          alt="Ping Pong Paddles"
          className="paddles-image"
        />
        <h1>Prime Pong</h1>
        <button onClick={simulateSensorsPressed}>
          Simulate Both Sensors Pressed
        </button>
      </div>
    );
  } else if (gamePhase === 'starting') {
    // QUICK "GAME START!" SCREEN
    return (
      <div className="start-screen">
        <h1>Game Start!</h1>
      </div>
    );
  } else if (gamePhase === 'serving') {
    // SERVING SCREEN: Show who is serving
    return (
      <div className="serve-screen">
        <h1>Player {currentServer} Serve</h1>
      </div>
    );
  } else {
    // MAIN GAME SCREEN (gamePhase === 'game')
    return (
      <div className="app-container">
        {/* Scoreboard */}
        <div className="score-board">
          <h1>
            {gameScore.A}:{gameScore.B}
          </h1>
        </div>

        {/* Player A Stats */}
        <div className="player-stats left-stats">
          <h2>Player A</h2>
          <p>Total Hits: {playerAStats.totalHits}</p>
          <p>
            Recent Swing Speed: {playerAStats.recentSwingSpeed.toFixed(1)} m/s
          </p>
          <p>Accuracy: {playerAStats.accuracy}%</p>
        </div>

        {/* Player B Stats */}
        <div className="player-stats right-stats">
          <h2>Player B</h2>
          <p>Total Hits: {playerBStats.totalHits}</p>
          <p>
            Recent Swing Speed: {playerBStats.recentSwingSpeed.toFixed(1)} m/s
          </p>
          <p>Accuracy: {playerBStats.accuracy}%</p>
        </div>

        {/* Center-Hit Explosion Overlay */}
        {centerHitEvent && (
          <div className="overlay explosion">
            <h1>BOOM! CENTER HIT</h1>
          </div>
        )}

        {/* Score Event Overlay */}
        {scoreEvent && (
          <div className="overlay score-event">
            {scoreEvent === 'A' ? (
              <>
                <div className="score-event-half winner">
                  <h1>Score!</h1>
                </div>
                <div className="score-event-half loser">
                  <h1>Good Try!</h1>
                </div>
              </>
            ) : (
              <>
                <div className="score-event-half loser">
                  <h1>Good Try!</h1>
                </div>
                <div className="score-event-half winner">
                  <h1>Score!</h1>
                </div>
              </>
            )}
          </div>
        )}

        {/* Demo Controls */}
        <div className="controls">
          <button onClick={triggerCenterHit}>Trigger Center Hit</button>
          <button onClick={() => triggerScoreEvent('A')}>Player A Scores</button>
          <button onClick={() => triggerScoreEvent('B')}>Player B Scores</button>
        </div>

        {/* --- NEW: Real-time Sensor Data from ESP8266 --- */}
        <div className="esp8266-sensor-data">
          <h2>ESP8266 Sensor Data</h2>
          <ul>
            <li>Force Value: {sensorData.force_value}</li>
            <li>Accel (x, y, z): {sensorData.accel_x.toFixed(2)}, {sensorData.accel_y.toFixed(2)}, {sensorData.accel_z.toFixed(2)}</li>
            <li>Movement: {sensorData.movement}</li>
            <li>Hit: {sensorData.hit ? 'Yes' : 'No'}</li>
            <li>Swing: {sensorData.swing ? 'Yes' : 'No'}</li>
          </ul>
        </div>
      </div>
    );
  }
}

export default App;
