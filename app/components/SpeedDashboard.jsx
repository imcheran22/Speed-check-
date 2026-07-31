'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'speed-check-logs';
const INTERVAL_MS = 2 * 60 * 1000;
const DOWNLOAD_SIZE_MB = 5;
const UPLOAD_SIZE_MB = 2;

function loadLogs() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  const trimmed = logs.slice(-500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${month}/${day} ${h}:${m}:${s}`;
}

function getQuality(download) {
  if (download >= 50) return { label: 'Good', cls: 'good' };
  if (download >= 10) return { label: 'OK', cls: 'ok' };
  return { label: 'Poor', cls: 'poor' };
}

function SpeedChart({ logs }) {
  if (logs.length < 2) return null;

  const recent = logs.slice(-30);
  const w = 820, h = 200, px = 50, py = 20;
  const chartW = w - px * 2;
  const chartH = h - py * 2;

  const maxDl = Math.max(...recent.map((l) => l.download), 1);
  const maxUl = Math.max(...recent.map((l) => l.upload), 1);
  const maxVal = Math.max(maxDl, maxUl) * 1.2;

  const points = (key) =>
    recent.map((l, i) => {
      const x = px + (i / (recent.length - 1)) * chartW;
      const y = py + chartH - (l[key] / maxVal) * chartH;
      return `${x},${y}`;
    });

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const y = py + chartH - pct * chartH;
    const val = (pct * maxVal).toFixed(0);
    return { y, val };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={px} y1={g.y} x2={w - px} y2={g.y} stroke="#2a2a3a" strokeWidth="1" />
          <text x={px - 8} y={g.y + 4} textAnchor="end" fill="#71717a" fontSize="10">
            {g.val}
          </text>
        </g>
      ))}
      <polyline
        points={points('download').join(' ')}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points('upload').join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {recent.map((l, i) => {
        const x = px + (i / (recent.length - 1)) * chartW;
        return (
          <g key={i}>
            <circle cx={x} cy={py + chartH - (l.download / maxVal) * chartH} r="3" fill="#22c55e" />
            <circle cx={x} cy={py + chartH - (l.upload / maxVal) * chartH} r="3" fill="#3b82f6" />
          </g>
        );
      })}
      <text x={w - px} y={h - 2} textAnchor="end" fill="#71717a" fontSize="10">
        Mbps
      </text>
      <g transform={`translate(${px + 10}, ${h - 4})`}>
        <circle cx="0" cy="-3" r="4" fill="#22c55e" />
        <text x="8" y="0" fill="#71717a" fontSize="10">Download</text>
        <circle cx="80" cy="-3" r="4" fill="#3b82f6" />
        <text x="88" y="0" fill="#71717a" fontSize="10">Upload</text>
      </g>
    </svg>
  );
}

export default function SpeedDashboard() {
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [current, setCurrent] = useState({ download: 0, upload: 0, ping: 0 });
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    setLogs(loadLogs());
  }, []);

  const runTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    setProgress(0);

    const result = { timestamp: Date.now(), download: 0, upload: 0, ping: 0 };

    try {
      setPhase('Measuring ping...');
      setProgress(5);
      const pings = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        await fetch('/api/ping?_=' + Date.now(), { cache: 'no-store' });
        pings.push(performance.now() - t0);
      }
      pings.sort((a, b) => a - b);
      result.ping = Math.round(pings[Math.floor(pings.length / 2)]);
      setProgress(15);

      setPhase('Testing download...');
      const dlStart = performance.now();
      const dlResp = await fetch(`/api/download?size=${DOWNLOAD_SIZE_MB}&_=${Date.now()}`, {
        cache: 'no-store',
      });
      const reader = dlResp.body.getReader();
      let dlBytes = 0;
      const contentLength = parseInt(dlResp.headers.get('content-length') || '0', 10);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dlBytes += value.length;
        if (contentLength > 0) {
          setProgress(15 + Math.round((dlBytes / contentLength) * 45));
        }
      }
      const dlTime = (performance.now() - dlStart) / 1000;
      result.download = parseFloat(((dlBytes * 8) / (dlTime * 1000000)).toFixed(2));
      setProgress(60);

      setPhase('Testing upload...');
      const ulData = new Uint8Array(UPLOAD_SIZE_MB * 1024 * 1024);
      const ulStart = performance.now();
      await fetch('/api/upload', {
        method: 'POST',
        body: ulData,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const ulTime = (performance.now() - ulStart) / 1000;
      result.upload = parseFloat(((ulData.length * 8) / (ulTime * 1000000)).toFixed(2));
      setProgress(95);
    } catch (err) {
      console.error('Speed test error:', err);
      setPhase('Test failed - check connection');
      setTesting(false);
      setProgress(0);
      return;
    }

    setProgress(100);
    setPhase('');
    setCurrent(result);

    setLogs((prev) => {
      const updated = [...prev, result];
      saveLogs(updated);
      return updated;
    });

    setTimeout(() => {
      setTesting(false);
      setProgress(0);
    }, 500);
  }, [testing]);

  useEffect(() => {
    if (autoRun) {
      runTest();
      setCountdown(INTERVAL_MS / 1000);
      intervalRef.current = setInterval(() => {
        runTest();
        setCountdown(INTERVAL_MS / 1000);
      }, INTERVAL_MS);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
      setCountdown(0);
    }
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [autoRun, runTest]);

  const clearLogs = () => {
    if (confirm('Clear all speed test logs?')) {
      setLogs([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const exportCSV = () => {
    const header = 'Timestamp,Download (Mbps),Upload (Mbps),Ping (ms)\n';
    const rows = logs
      .map(
        (l) =>
          `${new Date(l.timestamp).toISOString()},${l.download},${l.upload},${l.ping}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speed-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const display = lastLog || current;

  return (
    <div className="container">
      <div className="header">
        <h1>Speed Check</h1>
        <p>WiFi &amp; Internet Speed Tracker</p>
      </div>

      <div className="status-bar">
        <span
          className={`status-dot ${testing ? 'testing' : autoRun ? 'running' : ''}`}
        />
        {testing
          ? phase || 'Testing...'
          : autoRun
          ? `Auto-testing every 2 min${countdown > 0 ? ` (next in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')})` : ''}`
          : `${logs.length} test${logs.length !== 1 ? 's' : ''} recorded`}
      </div>

      {testing && (
        <div className="progress-bar">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="speed-cards">
        <div className="speed-card download">
          <div className="label">Download</div>
          <div className="value">{display.download || '---'}</div>
          <div className="unit">Mbps</div>
        </div>
        <div className="speed-card upload">
          <div className="label">Upload</div>
          <div className="value">{display.upload || '---'}</div>
          <div className="unit">Mbps</div>
        </div>
        <div className="speed-card ping">
          <div className="label">Ping</div>
          <div className="value">{display.ping || '---'}</div>
          <div className="unit">ms</div>
        </div>
      </div>

      <div className="controls">
        <button
          className="btn primary"
          onClick={runTest}
          disabled={testing}
        >
          {testing ? 'Testing...' : 'Run Test'}
        </button>
        <button
          className={`btn ${autoRun ? 'active' : ''}`}
          onClick={() => setAutoRun(!autoRun)}
        >
          {autoRun ? 'Stop Auto' : 'Auto (2 min)'}
        </button>
        {logs.length > 0 && (
          <>
            <button className="btn" onClick={exportCSV}>
              Export CSV
            </button>
            <button className="btn danger" onClick={clearLogs}>
              Clear Logs
            </button>
          </>
        )}
      </div>

      {logs.length >= 2 && (
        <div className="section">
          <div className="section-title">Speed History (last 30 tests)</div>
          <div className="chart-container">
            <SpeedChart logs={logs} />
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span>Test Logs</span>
          {logs.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {logs.length} entries
            </span>
          )}
        </div>
        {logs.length === 0 ? (
          <div className="empty-state">
            No tests yet. Run a test or enable auto-testing to start tracking.
          </div>
        ) : (
          <div className="log-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Download</th>
                  <th>Upload</th>
                  <th>Ping</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().map((log, i) => {
                  const q = getQuality(log.download);
                  return (
                    <tr key={i}>
                      <td>{formatTime(log.timestamp)}</td>
                      <td style={{ color: 'var(--green)' }}>{log.download} Mbps</td>
                      <td style={{ color: 'var(--blue)' }}>{log.upload} Mbps</td>
                      <td style={{ color: 'var(--orange)' }}>{log.ping} ms</td>
                      <td>
                        <span className={`badge ${q.cls}`}>{q.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
