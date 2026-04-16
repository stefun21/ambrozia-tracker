import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const updateData = async (lat: number, lon: number) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=ragweed_pollen&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();
      
      const hour = new Date().getHours();
      setData({
        pollen: json.hourly?.ragweed_pollen?.[hour] || 0,
        temp: Math.round(json.current?.temperature_2m || 0),
        loc: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
      });
    } catch (e) {
      setError("Eroare la conectarea cu satelitul.");
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => updateData(p.coords.latitude, p.coords.longitude),
        () => updateData(44.43, 26.10) // Fallback București
      );
    } else {
      updateData(44.43, 26.10);
    }
  }, []);

  if (error) return <div style={{padding: '50px', color: 'red'}}>{error}</div>;
  if (!data) return <div style={{padding: '50px'}}>Se încarcă datele...</div>;

  // Culori dinamice în funcție de polen
  const getBg = (v: number) => {
    if (v < 1) return '#D1FAE5'; // Verde deschis
    if (v < 10) return '#FEF3C7'; // Galben
    return '#FEE2E2'; // Roșu pal
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: getBg(data.pollen), 
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem', opacity: 0.7 }}>Ambrozie Live</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '5rem', fontWeight: '900', lineHeight: 1 }}>{data.pollen.toFixed(1)}</div>
        <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '10px' }}>polen gr/m³</div>
      </div>

      <div style={{ fontSize: '2rem', fontWeight: '800' }}>{data.temp}°C</div>
      <div style={{ marginTop: '3rem', fontSize: '0.8rem', opacity: 0.5 }}>{data.loc}</div>
      
      <button 
        onClick={() => window.location.reload()}
        style={{ marginTop: '20px', padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'white', cursor: 'pointer' }}
      >
        Actualizează
      </button>
    </div>
  );
}

// Aceasta parte înlocuiește main.tsx-ul separat pentru a simplifica structura POC
const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

export default App;
