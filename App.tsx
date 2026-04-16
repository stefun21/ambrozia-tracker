import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const CACHE_KEY = 'ambrozia_final_balanced_v2';
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
    if (data?.score !== undefined) {
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
      
      // Am adaugat temperature_2m_min pentru ziua curenta
      const [wRes, aRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`)
      ]);
      
      const wJson = await wRes.json();
      const aJson = await aRes.json();
      const h = new Date().getHours();
      const nowVal = (aJson.hourly?.birch_pollen?.[h] || 0) + (aJson.hourly?.grass_pollen?.[h] || 0) + (aJson.hourly?.ragweed_pollen?.[h] || 0);
      const score = Math.min(nowVal / 15, 10);

      const payload = {
        score,
        tempNow: Math.round(wJson.current.temperature_2m),
        tempMax: Math.round(wJson.daily.temperature_2m_max[0]),
        tempMin: Math.round(wJson.daily.temperature_2m_min[0]),
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

  if (!data) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>Sincronizare...</div>;

  const theme = data.score < 3 ? { color: '#22c55e', bg: '#f0fdf4' } : 
                data.score < 7 ? { color: '#f59e0b', bg: '#fffbeb' } : 
                { color: '#ef4444', bg: '#fef2f2' };

  return (
    <div className="app-shell" style={{ 
      minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', 
      alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
      boxSizing: 'border-box', transition: 'all 0.5s ease'
    }}>
      <style>{`
        body { margin: 0; padding: 0; background-color: ${theme.bg}; }
        .app-shell { background-color: ${theme.bg}; color: #1e293b; }
        .main-card { background: white; color: #1e293b; }
        .glass-card { background: rgba(255, 255, 255, 0.5); color: #1e293b; }
        
        @media (prefers-color-scheme: dark) {
          body { background-color: #0f172a; }
          .app-shell { background-color: #0f172a; color: #f1f5f9; }
          .main-card { background: #1e293b !important; color: white !important; }
          .glass-card { background: rgba(30, 41, 59, 0.7) !important; color: white !important; }
          h1 { color: ${theme.color} !important; }
        }

        .container {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
      `}</style>

      <div className="container">
        <header style={{ marginBottom: '25px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, color: theme.color }}>{city.toUpperCase()}</h1>
          <p style={{ fontSize: '0.7rem', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px', marginTop: '5px' }}>POLLEN SCANNER PRO</p>
        </header>

        <div className="main-card" style={{ 
          width: '230px', height: '230px', borderRadius: '50%', display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center', border: `12px solid ${theme.color}`, 
          boxShadow: `0 20px 40px rgba(0,0,0,0.1)`, marginBottom: '25px'
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', opacity: 0.6 }}>INDICE</span>
          <span style={{ fontSize: '5rem', fontWeight: '950', lineHeight: 1 }}>{displayScore.toFixed(1)}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: theme.color }}>{data.score < 3 ? 'OPTIM' : data.score < 7 ? 'MODERAT' : 'PERICOL'}</span>
        </div>

        <div style={{ marginBottom: '25px' }}>
          <div style={{ fontSize: '3rem', fontWeight: '900', lineHeight: 1 }}>{data.tempNow}°C</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', opacity: 0.6, marginTop: '5px' }}>
             {data.tempMin}° / {data.tempMax}°
          </div>
          <div className="main-card" style={{ 
            padding: '10px 20px', borderRadius: '15px', 
            display: 'inline-block', fontSize: '0.85rem', fontWeight: '700', marginTop: '12px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
          }}>
            {data.advice}
          </div>
        </div>

        <div className="glass-card" style={{ 
          width: '100%', padding: '15px 10px', borderRadius: '24px', display: 'flex', justifyContent: 'space-around',
          marginBottom: '25px'
        }}>
          {data.forecast.map((f: any, i: number) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 'bold', opacity: 0.6, marginBottom: '5px' }}>{f.day.toUpperCase()}</div>
              <div style={{ fontSize: '1.2rem', marginBottom: '5px' }}>{f.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: '900' }}>{f.temp}°</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: '#1e293b', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}>ACTUALIZEAZĂ</button>
          <button onClick={() => {
            const t = `Polen în ${city}: ${data.score.toFixed(1)}. Temp: ${data.tempNow}°C (${data.tempMin}-${data.tempMax}°).`;
            window.open(`https://wa.me/?text=${encodeURIComponent(t)}`);
          }} style={{ padding: '14px 20px', borderRadius: '14px', border: 'none', background: theme.color, color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>📲</button>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);