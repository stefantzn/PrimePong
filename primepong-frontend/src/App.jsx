import React, { useState, useEffect, useRef } from 'react';
import './App.css';

export default function App() {
  // ---------------------
  // GAME STATE
  // ---------------------
  const [gamePhase, setGamePhase] = useState('waiting');
  const [currentServer, setCurrentServer] = useState('A');
  const [gameScore, setGameScore] = useState({ A: 0, B: 0 });

  // Player A stats
  const [playerAStats, setPlayerAStats] = useState({ totalHits: 0 });
  // Player B stats
  const [playerBStats, setPlayerBStats] = useState({ totalHits: 0 });

  // Overlays (center hit, scoring)
  const [centerHitEvent, setCenterHitEvent] = useState(false);
  const [scoreEvent, setScoreEvent] = useState(null); // 'A' or 'B'

  // ---------------------
  // SENSOR DATA
  // ---------------------
  // Player A => IP .13
  const [sensorA, setSensorA] = useState({
    force_value: 0,
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    movement: 'not moving'
  });

  // Player B => IP .12
  const [sensorB, setSensorB] = useState({
    force_value: 0,
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    movement: 'not moving'
  });

  // Keep track of the previous force values (for detecting rising edges)
  const lastForceA = useRef(0);  
  const lastForceB = useRef(0);  

  // ---------------------
  // Audio
  // ---------------------
  const playRandomScoreSound = () => {
    const scoreSounds = [
      '/scoreSound1.mp3',
      '/scoreSound2.mp3',
      '/scoreSound3.mp3',
      '/scoreSound4.mp3',
      '/scoreSound5.mp3'
    ];
    const idx = Math.floor(Math.random() * scoreSounds.length);
    new Audio(scoreSounds[idx]).play();
  };

  const playCenterHitSound = () => {
    new Audio('/centerHit.mp3').play();
  };

  const playStartGameSound = () => {
    new Audio('/startGameSound.mp3').play();
  };

  // ---------------------
  // SIMPLE GAME FLOW
  // ---------------------
  const simulateSensorsPressed = () => {
    playStartGameSound();
    setGamePhase('starting');
    setTimeout(() => {
      setCurrentServer('A');
      setGamePhase('serving');
      setTimeout(() => setGamePhase('game'), 3000);
    }, 2000);
  };

  const showServeScreen = (server) => {
    setCurrentServer(server);
    setGamePhase('serving');
    setTimeout(() => setGamePhase('game'), 2000);
  };

  // ---------------------
  // CENTER HIT EVENT
  // ---------------------
  const triggerCenterHit = () => {
    if (centerHitEvent) return; // Only once if not active
    console.log('Center hit triggered!');
    playCenterHitSound();
    setCenterHitEvent(true);

    // If you want center hits to increment both players, do so here:
    setPlayerAStats((prev) => ({ ...prev, totalHits: prev.totalHits + 1 }));
    setPlayerBStats((prev) => ({ ...prev, totalHits: prev.totalHits + 1 }));

    // Show "BOOM!" for 1 second (1000 ms)
    setTimeout(() => {
      setCenterHitEvent(false);
    }, 1000);
  };

  // ---------------------
  // SCORE EVENT
  // ---------------------
  const triggerScoreEvent = (winner) => {
    playRandomScoreSound();
    setGameScore((prev) => {
      const newA = winner === 'A' ? prev.A + 1 : prev.A;
      const newB = winner === 'B' ? prev.B + 1 : prev.B;

      if (winner === 'A') {
        setPlayerAStats((p) => ({ ...p, totalHits: p.totalHits + 1 }));
      } else {
        setPlayerBStats((p) => ({ ...p, totalHits: p.totalHits + 1 }));
      }
      return { A: newA, B: newB };
    });
    setScoreEvent(winner);
    setTimeout(() => {
      setScoreEvent(null);
      showServeScreen(winner);
    }, 3000);
  };

  // ---------------------
  // POLLING: PLAYER A => IP .13
  // Poll every 10 ms
  // Rising edge detection: if lastForceA=0 and new=1 => increment hits
  // Then store new in lastForceA
  // ---------------------
  useEffect(() => {
    const pollA = async () => {
      try {
        const resp = await fetch('http://172.20.10.13/');
        if (!resp.ok) throw new Error('Bad response from A');
        const data = await resp.json();

        // Read the new force_value
        const fVal = data.force_value;
        // If lastForce=0 and fVal=1 => increment Player A hits
        if (lastForceA.current === 0 && fVal === 1) {
          setPlayerAStats((prev) => ({
            ...prev,
            totalHits: prev.totalHits + 1
          }));
        }

        // Store sensor data
        setSensorA({
          force_value: fVal,
          accel_x: data.accel_x,
          accel_y: data.accel_y,
          accel_z: data.accel_z,
          movement: data.movement.toLowerCase()
        });

        // Update the ref
        lastForceA.current = fVal;
      } catch (err) {
        console.error('Error polling A (.13):', err);
      }
    };

    pollA();
    const intA = setInterval(pollA, 10);
    return () => clearInterval(intA);
  }, []);

  // ---------------------
  // POLLING: PLAYER B => IP .12
  // Poll every 10 ms
  // Rising edge detection for B => increment B hits
  // ---------------------
  useEffect(() => {
    const pollB = async () => {
      try {
        const resp = await fetch('http://172.20.10.12/');
        if (!resp.ok) throw new Error('Bad response from B');
        const data = await resp.json();

        const fVal = data.force_value;
        // If lastForceB=0 and fVal=1 => increment B hits
        if (lastForceB.current === 0 && fVal === 1) {
          setPlayerBStats((prev) => ({
            ...prev,
            totalHits: prev.totalHits + 1
          }));
        }

        setSensorB({
          force_value: fVal,
          accel_x: data.accel_x,
          accel_y: data.accel_y,
          accel_z: data.accel_z,
          movement: data.movement.toLowerCase()
        });

        lastForceB.current = fVal;
      } catch (err) {
        console.error('Error polling B (.12):', err);
      }
    };

    pollB();
    const intB = setInterval(pollB, 10);
    return () => clearInterval(intB);
  }, []);

  // ---------------------
  // If either sensor sees rising edge => centerHit
  // We'll detect rising edge with lastForceA/B logic
  // 
  // But if you still want "force=1 => boom" each time,
  // we can do a rising-edge check here too.
  // 
  // Or simpler approach: if centerHit triggers for each poll,
  // you might get duplicates. 
  // 
  // We'll do a check:
  // If (lastForceA=0 => 1) or (lastForceB=0 => 1) => trigger once
  // But we've done that in the poll. 
  //
  // If you want a centerHit that triggers whenever new=1:
  // Do the same approach:
  // If lastForceA.current=0 && sensorA.force_value=1 => trigger
  // If lastForceB.current=0 && sensorB.force_value=1 => trigger
  // 
  // We'll do that in a separate effect.
  // ---------------------
  useEffect(() => {
    // If A just went from 0 -> 1 or B 0 ->1 => center hit
    // We detect that by storing them in local vars
    const fA = sensorA.force_value;
    const fB = sensorB.force_value;

    // If either is 1 but was 0 last time => centerHit
    // We'll track that with lastForceA/B in the same effect
    // Actually simpler: we'll do it directly in the poll
    // so we don't double-detect. 
    // 
    // If you want it here, you'd do something like:
    // if (lastForceA.current===0 && fA===1 && !centerHitEvent) { triggerCenterHit(); }
    // if (lastForceB.current===0 && fB===1 && !centerHitEvent) { triggerCenterHit(); }

    // For clarity, let's do it here:
    if (!centerHitEvent) {
      if (lastForceA.current === 1 && fA === 1) {
        // means it was already 1 in the poll => we don't do it again
      }
      if (lastForceA.current === 0 && fA === 1) {
        triggerCenterHit();
      }
      if (lastForceB.current === 0 && fB === 1) {
        triggerCenterHit();
      }
    }
  }, [sensorA, sensorB, centerHitEvent]);

  // ---------------------
  // RENDER
  // ---------------------
  if (gamePhase === 'waiting') {
    return (
      <div className="waiting-screen">
        <h1>Prime Pong</h1>
        <button onClick={simulateSensorsPressed}>
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
    // MAIN "GAME" SCREEN
    return (
      <div className="app-container">
        {/* Scoreboard */}
        <div className="score-board">
          <h1>{gameScore.A}:{gameScore.B}</h1>
        </div>

        {/* Player A Column */}
        <div className="player-stats left-stats">
          <h2>Player A</h2>
          <p>Total Hits: {playerAStats.totalHits}</p>
          {sensorA.movement === 'very fast' && (
            <p className="swing-message">SWING!</p>
          )}
        </div>

        {/* Player B Column */}
        <div className="player-stats right-stats">
          <h2>Player B</h2>
          <p>Total Hits: {playerBStats.totalHits}</p>
          {sensorB.movement === 'very fast' && (
            <p className="swing-message">SWING!</p>
          )}
        </div>

        {/* Center-Hit Overlay (1s) */}
        {centerHitEvent && (
          <div className="overlay explosion">
            <h1>BOOM! CENTER HIT</h1>
          </div>
        )}

        {/* Score Event Overlay (3s) */}
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
      </div>
    );
  }
}
