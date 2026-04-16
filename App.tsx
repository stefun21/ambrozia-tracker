import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [city, setCity] = useState<string>("Locație necunoscută");
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
      // Luam datele de Air Quality si Weather intr-o singura cerere
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=temperature_2m,ragweed_pollen&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const json = await res.json();
      
      setData({
        ambrozie: json.current?.ragweed_pollen ?? 0,
        temp: Math.round(json.current?.temperature_2m ?? 0)
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
        () => updateData(44.43, 26.10)
      );
    } else {
      updateData(44.43, 26.10);
    }
  }, []);

  if (error) return <div style={{padding: '50px', textAlign: 'center', color: 'red'}}>{error}</div>;
  if (!data) return <div style={{padding: '50px', textAlign: 'center', fontFamily: 'sans-serif'}}>Se caută semnal în {city}...</div>;

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
      transition: 'background-color 0.5s ease'
    }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>
          {city}
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6B7280', margin: 0 }}>Tracker Polen Live</p>
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
        boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
        border: `8px solid ${isSafe ? '#10B981' : '#EF4444'}`
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#9CA3AF', marginBottom: '5px' }}>AMBROZIE</div>
        <div style={{ fontSize: '5rem', fontWeight: '900', lineHeight: 1 }}>{pollenLevel.toFixed(1)}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#9CA3AF', marginTop: '5px' }}>gr / m³</div>
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>{data.temp}°C</div>
        <div style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '600' }}>Temperatura actuală</div>
      </div>

      <button 
        onClick={() => window.location.reload()}
        style={{ 
          marginTop: '50px', 
          padding: '12px 25px', 
          borderRadius: '15px', 
          border: 'none', 
          background: '#111827', 
          color: 'white', 
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
        }}
      >
        Actualizează Datele
      </button>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

export default App;