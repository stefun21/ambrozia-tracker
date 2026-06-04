import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const CACHE_KEY = 'ambrozia_final_v4';
const CACHE_TIME = 15 * 60 * 1000;
const DEFAULT_LAT = 44.43;
const DEFAULT_LON = 26.1;

type ForecastDay = {
  day: string;
  temp: number;
  icon: string;
};

type AppData = {
  score: number;
  trend: '↑' | '↓' | '→';
  tempNow: number;
  tempMax: number;
  tempMin: number;
  advice: string;
  forecast: ForecastDay[];
};

const getWeatherIcon = (code: number) => {
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 3) return '🌤️';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 95) return '⛈️';
  return '☁️';
};

const safeNumber = (value: unknown, fallback = 0) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState('');
  const [displayScore, setDisplayScore] = useState(0);
  const [error, setError] = useState('');

  const theme = useMemo(() => {
    const score = data?.score ?? 0;
    if (score < 3) return { color: '#22c55e', bg: '#f0fdf4', label: 'Scăzut' };
    if (score < 7) return { color: '#f59e0b', bg: '#fffbeb', label: 'Mediu' };
    return { color: '#ef4444', bg: '#fef2f2', label: 'Ridicat' };
  }, [data?.score]);

  useEffect(() => {
    if (!data) return;

    let animationFrame = 0;
    let startTime = 0;

    const animate = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min((now - startTime) / 800, 1);
      setDisplayScore(progress * data.score);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [data]);

  const fetchData = async (lat: number, lon: number, namePrefix = '') => {
    try {
      setError('');

      const roundedLat = lat.toFixed(2);
      const roundedLon = lon.toFixed(2);
      const cached = localStorage.getItem(CACHE_KEY);

      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          Date.now() - parsed.ts < CACHE_TIME &&
          parsed.lat === roundedLat &&
          parsed.lon === roundedLon
        ) {
          setData(parsed.data);
          setCity(parsed.city);
          return;
        }
      }

      const cityResponse = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`
      );
      const cityJson = await cityResponse.json();
      const name =
        namePrefix +
        (cityJson.city || cityJson.locality || cityJson.principalSubdivision || 'Oraș');

      const [weatherResponse, pollenResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`
        ),
      ]);

      if (!weatherResponse.ok || !pollenResponse.ok) {
        throw new Error('API error');
      }

      const weatherJson = await weatherResponse.json();
      const pollenJson = await pollenResponse.json();

      const hourlyTimes: string[] = pollenJson.hourly?.time ?? [];
      const currentHour = new Date().toISOString().slice(0, 13);
      let hourIndex = hourlyTimes.findIndex((time) => time.startsWith(currentHour));
      if (hourIndex < 0) hourIndex = new Date().getHours();

      const birch = pollenJson.hourly?.birch_pollen ?? [];
      const grass = pollenJson.hourly?.grass_pollen ?? [];
      const ragweed = pollenJson.hourly?.ragweed_pollen ?? [];

      const nowVal =
        safeNumber(birch[hourIndex]) +
        safeNumber(grass[hourIndex]) +
        safeNumber(ragweed[hourIndex]);

      const nextVal =
        safeNumber(birch[hourIndex + 1]) +
        safeNumber(grass[hourIndex + 1]) +
        safeNumber(ragweed[hourIndex + 1]);

      const score = Math.min(Math.max(nowVal / 15, 0), 10);
      const trend: AppData['trend'] = nextVal > nowVal ? '↑' : nextVal < nowVal ? '↓' : '→';

      const payload: AppData = {
        score,
        trend,
        tempNow: Math.round(safeNumber(weatherJson.current?.temperature_2m)),
        tempMax: Math.round(safeNumber(weatherJson.daily?.temperature_2m_max?.[0])),
        tempMin: Math.round(safeNumber(weatherJson.daily?.temperature_2m_min?.[0])),
        advice:
          score > 7
            ? '🛑 Geamuri închise!'
            : score > 3
              ? '⚠️ Evită ieșirile lungi.'
              : '✅ Aer curat.',
        forecast: (weatherJson.daily?.time ?? []).slice(1, 7).map((time: string, index: number) => ({
          day: new Date(time).toLocaleDateString('ro-RO', { weekday: 'short' }),
          temp: Math.round(safeNumber(weatherJson.daily?.temperature_2m_max?.[index + 1])),
          icon: getWeatherIcon(safeNumber(weatherJson.daily?.weather_code?.[index + 1])),
        })),
      };

      setData(payload);
      setCity(name);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: payload, city: name, lat: roundedLat, lon: roundedLon })
      );
    } catch (err) {
      console.error(err);
      setError('Nu am putut încărca datele live. Am folosit București ca fallback.');
      if (lat !== DEFAULT_LAT || lon !== DEFAULT_LON) {
        fetchData(DEFAULT_LAT, DEFAULT_LON, '📍 ');
      }
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      fetchData(DEFAULT_LAT, DEFAULT_LON, '📍 ');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => fetchData(position.coords.latitude, position.coords.longitude),
      () => fetchData(DEFAULT_LAT, DEFAULT_LON, '📍 '),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  if (!data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Sincronizare...
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        boxSizing: 'border-box',
        transition: 'all 0.5s ease',
      }}
    >
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background-color: ${theme.bg};
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .app-shell {
          background-color: ${theme.bg};
          color: #1e293b;
        }

        .main-card {
          background: white;
          color: #1e293b;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.6);
          color: #1e293b;
        }

        @media (prefers-color-scheme: dark) {
          body { background-color: #0f172a; }
          .app-shell { background-color: #0f172a !important; color: #f1f5f9; }
          .main-card { background: #1e293b !important; color: white !important; }
          .glass-card { background: rgba(30, 41, 59, 0.75) !important; color: white !important; }
          .pill-divider { background: #475569 !important; }
        }

        .container {
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
      `}</style>

      <div className="container">
        <header style={{ marginBottom: 35 }}>
          <div
            className="main-card"
            style={{
              padding: '10px 20px',
              borderRadius: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 15px rgba(0,0,0,0.04)',
            }}
          >
            <span style={{ fontSize: '1rem' }}>📍</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.5px' }}>
              {city.toUpperCase()}
            </span>
            <span className="pill-divider" style={{ width: 1, height: 14, background: '#cbd5e1' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.6, letterSpacing: 1 }}>
              POLLEN SCANNER PRO
            </span>
          </div>
        </header>

        <div
          className="main-card"
          style={{
            width: 230,
            height: 230,
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `12px solid ${theme.color}`,
            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
            marginBottom: 30,
            transition: 'border 0.5s',
          }}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', opacity: 0.6 }}>INDICE</span>
          <span style={{ fontSize: '5rem', fontWeight: 950, lineHeight: 1 }}>
            {displayScore.toFixed(1)}
          </span>
          <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: theme.color }}>
            {theme.label} {data.trend}
          </span>
        </div>

        <div
          className="main-card"
          style={{
            width: '100%',
            borderRadius: 28,
            padding: 22,
            boxSizing: 'border-box',
            boxShadow: '0 20px 45px rgba(0,0,0,0.08)',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 12 }}>{data.advice}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: '0.7rem', fontWeight: 800 }}>ACUM</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{data.tempNow}°</div>
            </div>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: '0.7rem', fontWeight: 800 }}>MAX</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{data.tempMax}°</div>
            </div>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: '0.7rem', fontWeight: 800 }}>MIN</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{data.tempMin}°</div>
            </div>
          </div>
        </div>

        <div
          className="glass-card"
          style={{
            width: '100%',
            borderRadius: 24,
            padding: 16,
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
          }}
        >
          {data.forecast.map((item) => (
            <div key={item.day}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.65 }}>{item.day}</div>
              <div style={{ fontSize: '1.2rem', margin: '5px 0' }}>{item.icon}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 900 }}>{item.temp}°</div>
            </div>
          ))}
        </div>

        {error && <div style={{ marginTop: 16, fontSize: '0.8rem', opacity: 0.7 }}>{error}</div>}
      </div>
    </div>
  );
}

export default App;

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
