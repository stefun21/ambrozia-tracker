import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// --- UTILS ---
const CACHE_KEY = 'ambrozia_final_v1';
const CACHE_TIME = 15 * 60 * 1000;

const getWeatherIcon = (code: number) => {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "🌤️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 95) return "⛈️";
  return "☁️";
};

function App() {
  const [data, setData] = useState<any>(null);
  const [city, setCity] = useState<string>("");
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (data?.score) {
      let startTime: number;
      const animate = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min((now - startTime) / 800, 1);
        setDisplayScore(progress * data.score);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [data?.score]);

  const fetchData = async (lat: number, lon: number, namePrefix = "") => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const p = JSON.parse(cached);
        if (Date.now() - p.ts < CACHE_TIME && p.lat === lat.toFixed(2)) {
          setData(p.data); setCity(p.city); return;
        }
      }

      const cRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`);
      const cJson = await cRes.json();
      const name = namePrefix + (cJson.city || cJson.locality || "Oraș");

      const [wRes, aRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,weather_code&timezone=auto`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`)
      ]);

      const wJson = await wRes.json();
      const aJson = await aRes.json();
      const h = new Date().getHours();

      const nowVal = (aJson.hourly?.birch_pollen?.[h] || 0) + (aJson.hourly?.grass_pollen?.[h] || 0) + (aJson.hourly?.ragweed_pollen?.[h] || 0);
      const score = Math.min(nowVal / 15, 10);

      const payload = {
        score,
        temp: Math.round(wJson.current.temperature_2m),
        advice: score > 7 ? "🛑 Geamuri închise!" : score > 3 ? "⚠️ Evită ieșirile." : "✅ Aer curat.",
        forecast: wJson.daily.time.slice(1, 7).map((t: any, i: number) => ({
          day: new Date(t).toLocaleDateString('ro-RO', { weekday: 'short' }),
          temp: Math.round(wJson.daily.temperature_2m_max[i + 1]),
          icon: getWeatherIcon(wJson.daily.weather_code[i + 1])
        }))
      };

      setData(payload); setCity(name);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: payload, city: name, lat: lat.toFixed(2) }));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (p) => fetchData(p.coords.latitude, p.coords.longitude),
      () => fetchData(44.43, 26.10, "📍 ")
    );
  }, []);

  if (!data) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontWeight: 'bold' }}>Sincronizare satelit...</div>;

  const theme = data.score < 3 ? { color: '#22c55e', bg: '#f0fdf4' } : 
                data.score < 7 ? { color: '#f59e0b', bg: '#fffbeb' } : 
                { color: '#ef4444', bg: '#fef2f2' };

  return (
    <div style={{ 
      height: '100vh', width: '100vw', backgroundColor: theme.bg, color: '#1e293b', 
      fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', 
      alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top) 20px env(safe-area-inset-bottom)',
      boxSizing: 'border-box', overflow: 'hidden'
    }}>
      {/* Stiluri globale pentru resetare margini si scroll */}
      <style>{`
        body { margin: 0; padding: 0; overflow: hidden; width: 100vw; height: 100vh; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #0f172a; }
          .circle-bg { background: #1e293b !important; color: white !important; }
          .card-bg { background: rgba(30, 41, 59, 0.7) !important; color: white !important; }
          .app-wrapper { background-color: #0f172a !important; color: #f1f5f9 !important; }
        }
      `}</style>

      <header style={{ marginTop: '2vh', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 5vw, 1.3rem)', fontWeight: '900', margin: 0, color: theme.color }}>{city.toUpperCase()}</h1>
        <p style={{ fontSize: '0.65rem', fontWeight: '800', opacity: 0.5, letterSpacing: '1px', margin: 0 }}>POLLEN SCANNER PRO</p>
      </header>

      <div className="circle-bg" style={{ 
        width: 'clamp(180px, 55vh, 260px)', height: 'clamp(180px, 55vh, 260px)', 
        borderRadius: '50%', background: 'white', display: 'flex', flexDirection: 'column', 
        alignItems: 'center', justifyContent: 'center', border: `clamp(8px, 2vh, 12px) solid ${theme.color}`, 
        boxShadow: `0 15px 35px ${theme.color}33`, position: 'relative'
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#94a3b8' }}>INDICE</span>
        <span style={{ fontSize: 'clamp(3rem, 12vh, 5rem)', fontWeight: '950', lineHeight: 1 }}>{displayScore.toFixed(1)}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: theme.color }}>{data.score < 3 ? 'OPTIM' : data.score < 7 ? 'MODERAT' : 'PERICOL'}</span>
      </div>

      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: 'clamp(2rem, 8vh, 3rem)', fontWeight: '900', lineHeight: 1 }}>{data.temp}°C</div>
        <div className="card-bg" style={{ 
          background: 'white', padding: '10px 20px', borderRadius: '15px', 
          display: 'inline-block', fontSize: '0.85rem', fontWeight: '700', marginTop: '10px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.03)'
        }}>
          {data.advice}
        </div>
      </div>

      <div className="card-bg" style={{ 
        width: '100%', maxWidth: '400px', background: 'rgba(255,255,255,0.4)', 
        padding: '12px 5px', borderRadius: '20px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
        marginBottom: '2vh'
      }}>
        {data.forecast.map((f: any, i: number) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 'bold', opacity: 0.6 }}>{f.day}</div>
            <div style={{ fontSize: '1.1rem', margin: '2px 0' }}>{f.icon}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: '900' }}>{f.temp}°</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '2vh', display: 'flex', gap: '10px', width: '100%', maxWidth: '400px' }}>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#1e293b', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>REFRESH</button>
        <button onClick={() => {
          const t = `Polen în ${city}: ${data.score.toFixed(1)}. Temp: ${data.temp}°C.`;
          window.open(`https://wa.me/?text=${encodeURIComponent(t)}`);
        }} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', background: theme.color, color: 'white', cursor: 'pointer' }}>📲</button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);