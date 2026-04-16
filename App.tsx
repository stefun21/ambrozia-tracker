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
      // Chemăm API-ul Meteo principal pentru temperatură (cel mai stabil)
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
      const weatherJson = await weatherRes.json();

      // Chemăm API-ul de Air Quality pentru Ambrozie
      const airRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=ragweed_pollen&timezone=auto`);
      const airJson = await airRes.json();
      
      const hour = new Date().getHours();
      
      setData({
        ambrozie: airJson.hourly?.ragweed_pollen?.[hour] ?? 0,
        temp: Math.round(weatherJson.current?.temperature_2m ?? 0)
      });
      
      await getCityName(lat, lon);
    } catch (e) {
      setError("Eroare la preluarea datelor live.");
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => updateData(p.coords.latitude, p.coords.longitude),
        () => updateData(44.43, 26.10),
        { enableHighAccuracy: true }
      );
    } else {
      updateData(44.43, 26.10);
    }
  }, []);

  if (error) return <div style={{padding: '50px', textAlign: 'center', color: 'red'}}>{error}</div>;
  if (!data) return <div style={{padding: '50px', textAlign: 'center', fontFamily: 'sans-serif'}}>Se conectează la satelit...</div>;

  const pollenLevel = data.ambrozie;
  const isSafe = pollenLevel < 1;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: isSafe ? '#ECFDF5' : '#FEF2F2', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      color: '#111827',
      transition: 'background-color 0.8s ease'
    }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>
          {city}
        </h1>
        <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: '600', letterSpacing: '1px' }}>TRACKER POLEN LIVE</div>
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
        border: `10px solid ${isSafe ? '#10B981' : '#EF4444'}`,
        position: 'relative'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9CA3AF', letterSpacing: '1px' }}>AMBROZIE</div>
        <div style={{ fontSize: '5.5rem', fontWeight: '900', lineHeight: 1, margin: '5px 0' }}>{pollenLevel.toFixed(1)}</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9CA3AF' }}>GR / M³</div>
      </div>

      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>🌡️</span>
          <span style={{ fontSize: '3rem', fontWeight: '900' }}>{data.temp}°C</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: 'bold', marginTop: '5px' }}>TEMPERATURĂ ACTUALĂ</div>
      </div>

      <button 
        onClick={() => window.location.reload()}
        style={{ 
          marginTop: '60px', 
          padding: '15px 35px', 
          borderRadius: '20px', 
          border: 'none', 
          background: '#111827', 
          color: 'white', 
          fontWeight: '900',
          fontSize: '0.9rem',
          cursor: 'pointer',
          boxShadow: '0 10px 15px rgba(0,0,0,0.2)',
          textTransform: 'uppercase'
        }}
      >
        Actualizează
      </button>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

export default App;