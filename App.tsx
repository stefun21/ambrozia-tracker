import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const [city, setCity] = useState<string>("Locație...");
  const [error, setError] = useState<string | null>(null);

  // Funcție pentru animația cifrelor
  useEffect(() => {
    if (data?.score !== undefined) {
      let start = 0;
      const end = data.score;
      const duration = 1000;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentScore = progress * end;
        setDisplayScore(currentScore);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [data?.score]);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "🌤️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 95) return "⛈️";
    return "☁️";
  };

  const getAdvice = (score: number) => {
    if (score < 3) return "✅ Aer curat. Poți lăsa geamurile deschise.";
    if (score < 7) return "⚠️ Nivel moderat. Evită activitățile intense afară.";
    return "🛑 Pericol! Poartă mască și ține geamurile închise.";
  };

  const updateData = async (lat: number, lon: number) => {
    try {
      // Verificăm Cache (15 min)
      const cached = localStorage.getItem('pollen_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 900000 && parsed.lat === lat.toFixed(2)) {
          setData(parsed.data);
          setCity(parsed.city);
          return;
        }
      }

      const cRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`);
      const cJson = await cRes.json();
      const cityName = cJson.city || cJson.locality || "Orașul tău";

      const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,rain&daily=temperature_2m_max,weather_code&timezone=auto`);
      const wJson = await wRes.json();
      
      const aRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`);
      const aJson = await aRes.json();
      
      const h = new Date().getHours();
      const getPollenAt = (hour: number) => (aJson.hourly?.birch_pollen?.[hour] || 0) + (aJson.hourly?.grass_pollen?.[hour] || 0) + (aJson.hourly?.ragweed_pollen?.[hour] || 0);
      
      const rawNow = getPollenAt(h);
      const rawNext = getPollenAt(h + 1);
      
      let score = rawNow / 15;
      if (score > 10) score = 10;

      const forecast = wJson.daily.time.slice(1, 7).map((t: string, i: number) => ({
        day: new Date(t).toLocaleDateString('ro-RO', { weekday: 'short' }),
        temp: Math.round(wJson.daily.temperature_2m_max[i + 1]),
        icon: getWeatherIcon(wJson.daily.weather_code[i + 1])
      }));

      const finalData = {
        score,
        trend: rawNext > rawNow ? "↑" : "↓",
        temp: Math.round(wJson.current?.temperature_2m || 0),
        advice: getAdvice(score),
        forecast
      };

      setData(finalData);
      setCity(cityName);
      localStorage.setItem('pollen_data', JSON.stringify({ ts: Date.now(), data: finalData, city: cityName, lat: lat.toFixed(2) }));
    } catch (e) { setError("Eroare de conexiune..."); }
  };

  useEffect(() => {
    navigator.geolocation.getCurrentPosition((p) => updateData(p.coords.latitude, p.coords.longitude), () => updateData(44.43, 26.10));
  }, []);

  if (!data) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f8fafc'}}>
    <div className="pulse">Analizăm aerul...</div>
  </div>;

  const theme = data.score < 3 ? { bg: '#f0fdf4', darkBg: '#064e3b', circle: '#22c55e', text: '#166534' } : 
                data.score < 7 ? { bg: '#fffbeb', darkBg: '#78350f', circle: '#f59e0b', text: '#92400e' } : 
                { bg: '#fef2f2', darkBg: '#7f1d1d', circle: '#ef4444', text: '#991b1b' };

  return (
    <div style={{ 
      minHeight: '100vh', backgroundColor: theme.bg, color: '#1e293b',
      fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', 
      padding: '40px 20px', transition: 'all 0.5s ease'
    }}>
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        <header style={{ marginBottom: '30px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '900', color: theme.text, margin: 0 }}>{city.toUpperCase()}</h1>
          <p style={{ fontSize: '0.7rem', fontWeight: 'bold', opacity: 0.6, letterSpacing: '1px' }}>POLLEN SCANNER PRO</p>
        </header>

        <div style={{ 
          width: '260px', height: '260px', borderRadius: '50%', background: 'white', 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 25px 50px -12px ${theme.circle}40`, border: `14px solid ${theme.circle}`,
          position: 'relative'
        }}>
          <div style={{ position: 'absolute', top: '40px', fontSize: '0.7rem', fontWeight: 'bold', color: '#94a3b8' }}>INDICE</div>
          <div style={{ fontSize: '5.5rem', fontWeight: '950', lineHeight: 1 }}>{displayScore.toFixed(1)}</div>
          <div style={{ position: 'absolute', bottom: '45px', fontSize: '1.2rem', fontWeight: 'bold', color: theme.circle }}>
            {data.trend} {data.score < 3 ? 'OPTIM' : data.score < 7 ? 'MEDIU' : 'CRITIC'}
          </div>
        </div>

        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', fontWeight: '900' }}>{data.temp}°C</div>
          <div style={{ 
            background: 'white', padding: '12px 20px', borderRadius: '15px', 
            fontSize: '0.9rem', fontWeight: '700', marginTop: '15px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
          }}>
            {data.advice}
          </div>
        </div>

        <div style={{ 
          marginTop: '40px', width: '100%', background: 'rgba(255,255,255,0.5)', 
          borderRadius: '20px', padding: '15px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)'
        }}>
          {data.forecast.map((f: any, i: number) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 'bold', color: '#64748b' }}>{f.day}</div>
              <div style={{ fontSize: '1.2rem', margin: '5px 0' }}>{f.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: '900' }}>{f.temp}°</div>
            </div>
          ))}
        </div>

        <button onClick={() => {localStorage.clear(); window.location.reload();}} style={{
          marginTop: '40px', background: '#1e293b', color: 'white', border: 'none',
          padding: '12px 25px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer'
        }}>REÎNCARCĂ DATELE</button>

      </div>
      <style>{`
        .pulse { animation: pulse 2s infinite; font-weight: bold; color: #64748b; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @media (prefers-color-scheme: dark) {
          body { background-color: #0f172a !important; }
        }
      `}</style>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
export default App;