import React from 'react';
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

  // --- AUDIO HELPERS ---
  playRandomScoreSound = () => {
    const scoreSounds = [
      '/scoreSound1.mp3',
      '/scoreSound2.mp3',
      '/scoreSound3.mp3',
      '/scoreSound4.mp3',
      '/scoreSound5.mp3'
    ];
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
  simulateSensorsPressed = () => {
    this.playStartGameSound();
    this.setState({ gamePhase: 'starting' });
    setTimeout(() => {
      this.setState({ currentServer: 'A', gamePhase: 'serving' });
      setTimeout(() => {
        this.setState({ gamePhase: 'game' });
      }, 3000);
    }, 2000);
  };

  showServeScreen = (server) => {
    this.setState({ currentServer: server, gamePhase: 'serving' });
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
            <button onClick={this.triggerCenterHit}>Trigger Center Hit</button>
            <button onClick={() => this.triggerScoreEvent('A')}>Player A Scores</button>
            <button onClick={() => this.triggerScoreEvent('B')}>Player B Scores</button>
          </div>
        </div>
      );
    }
  }
}

export default App;
