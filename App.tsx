import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [city, setCity] = useState<string>("Locație...");
  const [error, setError] = useState<string | null>(null);

  const getCityName = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`);
      const json = await res.json();
      setCity(json.city || json.locality || "Orașul tău");
    } catch (e) {
      setCity("Locația Ta");
    }
  };

  const updateData = async (lat: number, lon: number) => {
    try {
      // Luăm temperatura (Weather API)
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
      const weatherJson = await weatherRes.json();

      // Luăm TOATE tipurile de polen (Air Quality API)
      const airRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen,alder_pollen,mugwort_pollen,olive_pollen&timezone=auto`);
      const airJson = await airRes.json();
      
      const h = new Date().getHours();
      
      // Facem suma tuturor grăunțelor de polen detectate în aer acum
      const totalPollen = (
        (airJson.hourly?.birch_pollen?.[h] || 0) +
        (airJson.hourly?.grass_pollen?.[h] || 0) +
        (airJson.hourly?.ragweed_pollen?.[h] || 0) +
        (airJson.hourly?.alder_pollen?.[h] || 0) +
        (airJson.hourly?.mugwort_pollen?.[h] || 0) +
        (airJson.hourly?.olive_pollen?.[h] || 0)
      );
      
      setData({
        pollen: totalPollen,
        temp: Math.round(weatherJson.current?.temperature_2m ?? 0)
      });
      
      await getCityName(lat, lon);
    } catch (e) {
      setError("Eroare la conectarea cu satelitul.");
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => updateData(p.coords.latitude, p.coords.longitude),
        () => updateData(44.43, 26.10)
      );
    } else {
      updateData(44.43, 26.10);
    }
  }, []);

  if (error) return <div style={{padding: '50px', textAlign: 'center', color: 'red'}}>{error}</div>;
  if (!data) return <div style={{padding: '50px', textAlign: 'center', fontFamily: 'sans-serif'}}>Se calculează polenul din aer...</div>;

  // Logica de culori pentru Polul Total (limitele sunt mai mari la suma decat la ambrozie singura)
  const getTheme = (v: number) => {
    if (v < 10) return { bg: '#ECFDF5', border: '#10B981', label: 'SCĂZUT' };
    if (v < 50) return { bg: '#FEF3C7', border: '#F59E0B', label: 'MODERAT' };
    return { bg: '#FEF2F2', border: '#EF4444', label: 'RIDICAT' };
  };

  const theme = getTheme(data.pollen);

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: theme.bg, 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      color: '#111827',
      transition: 'all 0.5s ease'
    }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px' }}>
          {city}
        </h1>
        <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 'bold' }}>TRACKER POLEN LIVE</div>
      </header>
      
      <div style={{ 
        background: 'white', 
        width: '280px', 
        height: '280px', 
        borderRadius: '50%', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)',
        border: `12px solid ${theme.border}`,
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9CA3AF' }}>INDICE TOTAL</div>
        <div style={{ fontSize: '5rem', fontWeight: '900', lineHeight: 1, margin: '5px 0' }}>
          {data.pollen.toFixed(0)}
        </div>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: theme.border }}>{theme.label}</div>
      </div>

      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>🌡️</span>
          <span style={{ fontSize: '3rem', fontWeight: '900' }}>{data.temp}°C</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: 'bold' }}>TEMPERATURĂ ACTUALĂ</div>
      </div>

      <button 
        onClick={() => window.location.reload()}
        style={{ 
          marginTop: '50px', 
          padding: '12px 30px', 
          borderRadius: '15px', 
          border: 'none', 
          background: '#111827', 
          color: 'white', 
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        ACTUALIZEAZĂ
      </button>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

export default App;