import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- CONFIGURARI SI UTILS ---
const CACHE_KEY = 'ambrozia_pro_cache';
const CACHE_TIME = 15 * 60 * 1000; // 15 minute

const getWeatherIcon = (code: number) => {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "🌤️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 95) return "⛈️";
  return "☁️";
};

// --- COMPONENTE MICI (REFACTORING) ---
const Skeleton = () => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px' }}>
    <div className="skeleton" style={{ width: '150px', height: '24px', marginBottom: '40px', borderRadius: '12px' }} />
    <div className="skeleton" style={{ width: '260px', height: '260px', borderRadius: '50%', marginBottom: '40px' }} />
    <div className="skeleton" style={{ width: '100px', height: '40px', marginBottom: '20px' }} />
    <div className="skeleton" style={{ width: '80%', height: '60px', borderRadius: '15px' }} />
    <style>{`
      .skeleton { background: linear-gradient(90deg, #ececec 25%, #f5f5f5 50%, #ececec 75%); background-size: 200% 100%; animation: loading 1.5s infinite; }
      @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    `}</style>
  </div>
);

// --- COMPONENTA PRINCIPALA ---
function App() {
  const [data, setData] = useState<any>(null);
  const [city, setCity] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [displayScore, setDisplayScore] = useState(0);

  // Efect pentru numărarea scorului (Count-up animation)
  useEffect(() => {
    if (data?.score) {
      let start = 0;
      const end = data.score;
      const duration = 800;
      let startTime: number;

      const animate = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        setDisplayScore(progress * end);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [data?.score]);

  const fetchData = async (lat: number, lon: number, isDefault = false) => {
    setIsLoading(true);
    try {
      // 1. Caching Check
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const p = JSON.parse(cached);
        if (Date.now() - p.ts < CACHE_TIME && p.lat === lat.toFixed(2)) {
          setData(p.data);
          setCity(p.city);
          setIsLoading(false);
          return;
        }
      }

      // 2. Fetch City Name
      const cRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`);
      const cJson = await cRes.json();
      const name = cJson.city || cJson.locality || "Locație necunoscută";

      // 3. Fetch Weather & Air Quality
      const [wRes, aRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,rain&daily=temperature_2m_max,weather_code&timezone=auto`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen,alder_pollen&timezone=auto`)
      ]);

      const wJson = await wRes.json();
      const aJson = await aRes.json();
      const h = new Date().getHours();

      const getPollenAt = (hour: number) => 
        (aJson.hourly?.birch_pollen?.[hour] || 0) + 
        (aJson.hourly?.grass_pollen?.[hour] || 0) + 
        (aJson.hourly?.ragweed_pollen?.[hour] || 0);

      const nowVal = getPollenAt(h);
      const nextVal = getPollenAt(h + 1);
      const score = Math.min(nowVal / 15, 10);

      const payload = {
        score,
        trend: nextVal > nowVal ? '↑' : '↓',
        temp: Math.round(wJson.current.temperature_2m),
        advice: score > 7 ? "🛑 Geamuri închise obligatoriu!" : score > 3 ? "⚠️ Evită ieșirile lungi." : "✅ Aer safe pentru plimbări.",
        forecast: wJson.daily.time.slice(1, 7).map((t: any, i: number) => ({
          day: new Date(t).toLocaleDateString('ro-RO', { weekday: 'short' }),
          temp: Math.round(wJson.daily.temperature_2m_max[i + 1]),
          icon: getWeatherIcon(wJson.daily.weather_code[i + 1])
        }))
      };

      setData(payload);
      setCity(isDefault ? "București (Implicit)" : name);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: payload, city: name, lat: lat.toFixed(2) }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setLocationStatus('granted'); fetchData(p.coords.latitude, p.coords.longitude); },
        () => { setLocationStatus('denied'); fetchData(44.43, 26.10, true); }
      );
    }
  }, []);

  if (isLoading) return <Skeleton />;

  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = data.score < 3 ? { color: '#22c55e', bg: '#f0fdf4' } : 
                data.score < 7 ? { color: '#f59e0b', bg: '#fffbeb' } : 
                { color: '#ef4444', bg: '#fef2f2' };

  return (
    <div className="app-container" style={{ 
      minHeight: '100vh', 
      backgroundColor: theme.bg, 
      color: '#1e293b', 
      fontFamily: 'system-ui, sans-serif',
      padding: '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      transition: 'background 0.5s ease'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        
        {locationStatus === 'denied' && (
          <div style={{ background: '#334155', color: 'white', padding: '10px', borderRadius: '12px', fontSize: '0.7rem', textAlign: 'center', marginBottom: '20px' }}>
            📍 Folosim locația implicită. Permite accesul pentru date exacte.
          </div>
        )}

        <header style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, color: theme.color }}>{city.toUpperCase()}</h1>
          <p style={{ fontSize: '0.7rem', fontWeight: '800', opacity: 0.5, letterSpacing: '1px' }}>POLLEN SCANNER PRO</p>
        </header>

        <div className="main-circle" style={{ 
          width: '260px', height: '260px', borderRadius: '50%', background: 'white', margin: '0 auto 40px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: `12px solid ${theme.color}`, boxShadow: `0 20px 40px ${theme.color}33`, position: 'relative'
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#94a3b8' }}>INDICE LIVE</span>
          <span style={{ fontSize: '5.5rem', fontWeight: '950', lineHeight: 1 }}>{displayScore.toFixed(1)}</span>
          <span style={{ fontSize: '1rem', fontWeight: 'bold', color: theme.color }}>{data.trend} {data.score < 3 ? 'SCĂZUT' : data.score < 7 ? 'MODERAT' : 'PERICOL'}</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '3rem', fontWeight: '900' }}>{data.temp}°C</div>
          <div style={{ background: 'white', padding: '15px', borderRadius: '18px', marginTop: '15px', fontWeight: '700', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
            {data.advice}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', background: 'rgba(255,255,255,0.5)', padding: '15px', borderRadius: '20px', gap: '5px' }}>
          {data.forecast.map((f: any, i: number) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 'bold', opacity: 0.6 }}>{f.day}</div>
              <div style={{ fontSize: '1.2rem', margin: '4px 0' }}>{f.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: '900' }}>{f.temp}°</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '40px' }}>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ flex: 2, padding: '15px', borderRadius: '15px', border: 'none', background: '#1e293b', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ACTUALIZEAZĂ</button>
          <button onClick={() => {
            const text = `Polen în ${city}: ${data.score.toFixed(1)} (${data.score < 3 ? 'Safe' : 'Atenție'}). Temp: ${data.temp}°C.`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
          }} style={{ flex: 1, padding: '15px', borderRadius: '15px', border: 'none', background: theme.color, color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>📲</button>
        </div>

      </div>

      <style>{`
        @media (prefers-color-scheme: dark) {
          .app-container { background-color: #0f172a !important; color: #f1f5f9 !important; }
          .main-circle { background-color: #1e293b !important; }
          .main-circle span:nth-child(2) { color: white !important; }
          div[style*="background: white"] { background-color: #1e293b !important; color: white !important; }
          div[style*="background: rgba(255,255,255,0.5)"] { background-color: rgba(30, 41, 59, 0.5) !important; }
        }
      `}</style>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);