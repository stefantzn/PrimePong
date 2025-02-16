import React, { useState, useEffect } from 'react';
import './App.css';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      gamePhase: 'waiting',       // 'waiting', 'starting', 'serving', 'game'
      currentServer: 'A',
      gameScore: { A: 0, B: 0 },
      playerAStats: { totalHits: 0, recentSwingSpeed: 0, accuracy: 0 },
      playerBStats: { totalHits: 0, recentSwingSpeed: 0, accuracy: 0 },
      centerHitEvent: false,
      scoreEvent: null            // 'A' or 'B'
    };
    this.forceIntervalId = null;
  }

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

  // SENSOR DATA STATE
  const [sensorData, setSensorData] = useState({
    force_value: 0,
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    movement: 'Still',
    hit: false,
    swing: false,
  });

  // NEW: State to show/hide a separate "SWING!" message
  const [showSwing, setShowSwing] = useState(false);

  // Fetch sensor data every 200 ms (as an example of frequent polling)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('http://172.20.10.12/') // Replace with your ESP8266 IP
        .then((response) => response.json())
        .then((data) => {
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
    }, 1); // fetch every 1 ms

    return () => clearInterval(interval);
  }, []);

  // WATCH FOR CHANGES TO sensorData.swing
  useEffect(() => {
    if (sensorData.swing) {
      // Show the SWING! message
      setShowSwing(true);

      // Hide after 1 second
      const timer = setTimeout(() => {
        setShowSwing(false);
      }, 200); // time in ms of displaying

      // Cleanup
      return () => clearTimeout(timer);
    }
  }, [sensorData.swing]);

  // HELPER: Play a random score sound
  const playRandomScoreSound = () => {
    const randomIndex = Math.floor(Math.random() * scoreSounds.length);
    new Audio(scoreSounds[randomIndex]).play();
  };

  playCenterHitSound = () => {
    new Audio('/centerHit.mp3').play();
  };

  playStartGameSound = () => {
    new Audio('/startGameSound.mp3').play();
  };

  // --- PHASE TRANSITIONS ---
  const simulateSensorsPressed = () => {
    // Move from waiting -> starting
    playStartGameSound();
    setGamePhase('starting');

    // After 2 seconds, move to "serving" for Player A
    setTimeout(() => {
      this.setState({ currentServer: 'A', gamePhase: 'serving' });
      setTimeout(() => {
        this.setState({ gamePhase: 'game' });
      }, 3000);
    }, 2000);
  };

  const showServeScreen = (server) => {
    setCurrentServer(server);
    setGamePhase('serving');
    setTimeout(() => {
      this.setState({ gamePhase: 'game' });
    }, 2000);
  };

  // --- CENTER HIT EVENT ---
  // When triggered, plays the center hit sound and shows an overlay for 3 seconds.
  triggerCenterHit = () => {
    if (this.state.centerHitEvent) return; // Prevent duplicate triggers
    console.log('Center hit triggered!');
    this.playCenterHitSound();
    this.setState({ centerHitEvent: true });
    setTimeout(() => {
      this.setState((prevState) => {
        const newTotal = prevState.playerAStats.totalHits + 1;
        console.log('Player A totalHits updated to:', newTotal);
        return {
          playerAStats: { ...prevState.playerAStats, totalHits: newTotal },
          centerHitEvent: false
        };
      });
    }, 3000);
  };

  // --- SCORING EVENT (manual controls) ---
  triggerScoreEvent = (winner) => {
    this.playRandomScoreSound();
    this.setState((prevState) => {
      const newA = winner === 'A' ? prevState.gameScore.A + 1 : prevState.gameScore.A;
      const newB = winner === 'B' ? prevState.gameScore.B + 1 : prevState.gameScore.B;
      let newPlayerAStats = { ...prevState.playerAStats };
      let newPlayerBStats = { ...prevState.playerBStats };

      if (winner === 'A') {
        newPlayerAStats.totalHits += 1;
        newPlayerAStats.recentSwingSpeed = Math.random() * 10;
        newPlayerAStats.accuracy =
          newB > 0 ? Math.round((newPlayerAStats.totalHits / newB) * 100) : 0;
      } else {
        newPlayerBStats.totalHits += 1;
        newPlayerBStats.recentSwingSpeed = Math.random() * 10;
        newPlayerBStats.accuracy =
          newA > 0 ? Math.round((newPlayerBStats.totalHits / newA) * 100) : 0;
      }
      return {
        gameScore: { A: newA, B: newB },
        playerAStats: newPlayerAStats,
        playerBStats: newPlayerBStats,
        scoreEvent: winner
      };
    });
    setTimeout(() => {
      this.setState({ scoreEvent: null });
      this.showServeScreen(winner);
    }, 3000);
  };

  // --- POLL SENSOR DATA ---
  // Polls the ESP endpoint (which returns JSON) every 250ms.
  // If "force_value" is 1 and no center hit is active, trigger center hit.
  pollSensorData = async () => {
    try {
      const response = await fetch("http://172.20.10.13/");
      if (response.ok) {
        const data = await response.json();
        // Expected data format:
        // {"force_value": 1, "accel_x": 9.80, "accel_y": -0.24, "accel_z": -0.57, "movement": "Slow", "hit": 0, "swing": 0}
        const forceVal = Number(data.force_value);
        console.log("Fetched force_value:", forceVal);
        if (forceVal === 1 && !this.state.centerHitEvent) {
          console.log("force_value is 1 - triggering center hit.");
          this.triggerCenterHit();
        }
      } else {
        console.error("Failed to fetch sensor data");
      }
    } catch (error) {
      console.error("Error fetching sensor data:", error);
    }
  };

  componentDidMount() {
    // Poll every 250ms for faster reaction time.
    this.pollSensorData(); // Initial call
    this.forceIntervalId = setInterval(this.pollSensorData, 250);
  }

  componentWillUnmount() {
    clearInterval(this.forceIntervalId);
  }

  // --- RENDERING ---
  render() {
    const { gamePhase, currentServer, gameScore, playerAStats, playerBStats, centerHitEvent, scoreEvent } = this.state;
    if (gamePhase === 'waiting') {
      return (
        <div className="waiting-screen">
          <img src="/paddles.png" alt="Ping Pong Paddles" className="paddles-image" />
          <h1>Prime Pong</h1>
          <button onClick={this.simulateSensorsPressed}>
            Simulate Both Sensors Pressed
          </button>
        </div>
      );
    } else if (gamePhase === 'starting') {
      return (
        <div className="start-screen">
          <h1>Game Start!</h1>
        </div>
      );
    } else if (gamePhase === 'serving') {
      return (
        <div className="serve-screen">
          <h1>Player {currentServer} Serve</h1>
        </div>
      );
    } else {
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
            <p>Recent Swing Speed: {playerAStats.recentSwingSpeed.toFixed(1)} m/s</p>
            <p>Accuracy: {playerAStats.accuracy}%</p>
          </div>

          {/* Player B Stats */}
          <div className="player-stats right-stats">
            <h2>Player B</h2>
            <p>Total Hits: {playerBStats.totalHits}</p>
            <p>Recent Swing Speed: {playerBStats.recentSwingSpeed.toFixed(1)} m/s</p>
            <p>Accuracy: {playerBStats.accuracy}%</p>
          </div>

          {/* Center-Hit Overlay */}
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
            <li>
              Accel (x, y, z): {sensorData.accel_x.toFixed(2)}, {sensorData.accel_y.toFixed(2)}, {sensorData.accel_z.toFixed(2)}
            </li>
            <li>Movement: {sensorData.movement}</li>
            <li>Hit: {sensorData.hit ? 'Yes' : 'No'}</li>
            <li>Swing: {sensorData.swing}</li>
            <li>Swing: {sensorData.swing ? 'Yes' : 'No'}</li>
          </ul>
        </div>

        {/* --- NEW: 'Swing!' text if showSwing is true --- */}
        {showSwing && (
          <div className="swing-overlay">
            <h1>SWING!</h1>
          </div>
        )}
      </div>
    );
  }
}

export default App;
