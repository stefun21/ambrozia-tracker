import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const updateData = async (lat: number, lon: number) => {
    try {
      // Cerem Ambrozie, Iarba si Mesteacan (Mesteacanul e activ acum, in Aprilie!)
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();
      
      const hour = new Date().getHours();
      
      setData({
        ambrozie: json.hourly?.ragweed_pollen?.[hour] || 0,
        iarba: json.hourly?.grass_pollen?.[hour] || 0,
        mesteacan: json.hourly?.birch_pollen?.[hour] || 0,
        temp: Math.round(json.current?.temperature_2m || 0),
        loc: `Lat: ${lat.toFixed(2)} Lon: ${lon.toFixed(2)}`
      });
    } catch (e) {
      setError("Eroare la conectarea cu sursa de date.");
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

  if (error) return <div style={{padding: '50px', textAlign: 'center'}}>{error}</div>;
  if (!data) return <div style={{padding: '50px', textAlign: 'center'}}>Se citesc senzorii...</div>;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#F9FAFB', 
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      color: '#111827'
    }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '2rem', fontWeight: '800' }}>Tracker Polen Live</h1>
      
      {/* Sectiunea Ambrozie (Ținta ta principală) */}
      <div style={{ background: 'white', padding: '30px', borderRadius: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '300px', textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#6B7280', textTransform: 'uppercase' }}>Ambrozie</div>
        <div style={{ fontSize: '4rem', fontWeight: '900', color: data.ambrozie > 1 ? '#EF4444' : '#10B981' }}>{data.ambrozie.toFixed(1)}</div>
      </div>

      {/* Alte tipuri active acum (Probabil asta vede aplicatia ta de pe telefon) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', width: '100%', maxWidth: '300px' }}>
        <div style={{ background: 'white', padding: '15px', borderRadius: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>Mesteacăn</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.mesteacan.toFixed(0)}</div>
        </div>
        <div style={{ background: 'white', padding: '15px', borderRadius: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>Iarbă</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.iarba.toFixed(0)}</div>
        </div>
      </div>

      <div style={{ marginTop: '30px', fontSize: '1.5rem', fontWeight: '700' }}>🌡️ {data.temp}°C</div>
      <div style={{ marginTop: '10px', fontSize: '0.7rem', color: '#9CA3AF' }}>{data.loc}</div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

export default App;