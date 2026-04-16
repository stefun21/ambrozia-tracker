import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [data, setData] = useState<any>(null);
  const [city, setCity] = useState<string>("Locație...");
  const [error, setError] = useState<string | null>(null);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "🌤️";
    if (code >= 45 && code <= 48) return "🌫️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 80 && code <= 82) return "🌦️";
    if (code >= 95) return "⛈️";
    return "☁️";
  };

  const getFunnyMessage = (temp: number, wind: number, rain: number) => {
    const messages = {
      heat: ["Curaj, încă puțin și ne topim ca înghețata.", "Oficial: asfaltul e acum o tigaie uriașă.", "O zi perfectă să te muți în congelator.", "Aerul condiționat e noul tău zeu.", "Dacă era mai cald, ieșeam în costum de baie."],
      cold: ["Frigul ăsta mușcă mai tare decât un maidanez.", "Dacă strănuți acum, îngheață în aer.", "E vremea aia când caloriferul e idolul tău.", "Pinguinii tocmai au cerut o pătură.", "Straturi, bre, straturi! Fii o ceapă umană."],
      rain: ["Perfect pentru spălat mașina pe gratis. Sau nu.", "Nu ești de zahăr, dar ia o umbrelă.", "Dacă vezi o arcă, urcă-te în ea.", "Broaștele sunt în extaz, noi nu.", "Atenție la bălți! Unele au cod poștal propriu."],
      wind: ["Ține-ți pălăria sau zi-i adio.", "Vântul ăsta îți face freză nouă gratis.", "Pune pietre în buzunare dacă ești slab.", "Zbori, puiule, zbori!", "Vânt bun pentru navigație, prost pentru gel."],
      perfect: ["Vreme de pus în ramă. Profită!", "Nici prea-prea, nici foarte-foarte.", "Dacă nici azi nu ieși, când mai ieși?", "E atât de bine că și factura a zâmbit.", "Vreme de stat la terasă."]
    };
    if (rain > 0.1) return messages.rain[Math.floor(Math.random() * 5)];
    if (wind > 25) return messages.wind[Math.floor(Math.random() * 5)];
    if (temp > 28) return messages.heat[Math.floor(Math.random() * 5)];
    if (temp < 12) return messages.cold[Math.floor(Math.random() * 5)];
    return messages.perfect[Math.floor(Math.random() * 5)];
  };

  const updateData = async (lat: number, lon: number) => {
    try {
      const cRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`);
      const cJson = await cRes.json();
      setCity(cJson.city || cJson.locality || "Orașul tău");

      const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,rain&daily=temperature_2m_max,weather_code&timezone=auto`);
      const wJson = await wRes.json();
      
      const aRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen&timezone=auto`);
      const aJson = await aRes.json();
      
      const h = new Date().getHours();
      const rawPollen = (aJson.hourly?.birch_pollen?.[h] || 0) + (aJson.hourly?.grass_pollen?.[h] || 0) + (aJson.hourly?.ragweed_pollen?.[h] || 0);
      let score = (rawPollen / 15); 
      if (score > 10) score = 10;
      if (score < 0.1 && rawPollen > 0) score = 0.5;

      const forecast = wJson.daily.time.slice(1, 7).map((t: string, i: number) => ({
        day: new Date(t).toLocaleDateString('ro-RO', { weekday: 'short' }),
        temp: Math.round(wJson.daily.temperature_2m_max[i + 1]),
        icon: getWeatherIcon(wJson.daily.weather_code[i + 1])
      }));

      setData({ score, temp: Math.round(wJson.current?.temperature_2m || 0), funny: getFunnyMessage(wJson.current?.temperature_2m, wJson.current?.wind_speed_10m, wJson.current?.rain), forecast });
    } catch (e) { setError("Satelitul e în pauză..."); }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => updateData(p.coords.latitude, p.coords.longitude), () => updateData(44.43, 26.10));
    } else { updateData(44.43, 26.10); }
  }, []);

  if (!data) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', backgroundColor: '#F9FAFB'}}>Se pregătește terenul...</div>;

  const theme = data.score < 3 ? { bg: '#F0FDF4', circle: '#22C55E', text: '#166534' } : 
                data.score < 7 ? { bg: '#FFFBEB', circle: '#F59E0B', text: '#92400E' } : 
                { bg: '#FEF2F2', circle: '#EF4444', text: '#991B1B' };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: theme.bg, 
      fontFamily: 'system-ui, -apple-system, sans-serif', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      padding: 'clamp(20px, 5vh, 60px) 20px', 
      transition: 'all 0.5s ease',
      boxSizing: 'border-box'
    }}>
      {/* Container principal care limiteaza latimea pe PC */}
      <div style={{ width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        <header style={{ marginBottom: 'clamp(20px, 4vh, 40px)', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: '900', color: theme.text, letterSpacing: '2px', margin: '0 0 5px 0' }}>
            {city.toUpperCase()}
          </h1>
          <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold', letterSpacing: '1px' }}>TRACKER POLEN LIVE</div>
        </header>
        
        {/* Cercul central - Scalabil */}
        <div style={{ 
          width: 'clamp(200px, 60vw, 280px)', 
          height: 'clamp(200px, 60vw, 280px)', 
          borderRadius: '50%', 
          background: 'white', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: `0 20px 40px ${theme.circle}25`, 
          border: `clamp(8px, 2vw, 14px) solid ${theme.circle}`, 
          marginBottom: 'clamp(20px, 4vh, 40px)'
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#94A3B8' }}>INDICE POLEN</div>
          <div style={{ fontSize: 'clamp(3.5rem, 15vw, 5.5rem)', fontWeight: '950', color: '#1E293B', lineHeight: 1 }}>{data.score.toFixed(1)}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: theme.circle }}>{data.score < 3 ? 'OK' : data.score < 7 ? 'ATENȚIE' : 'PERICOL'}</div>
        </div>

        {/* Temperatura si mesaj */}
        <div style={{ textAlign: 'center', marginBottom: 'clamp(20px, 5vh, 50px)', width: '100%' }}>
          <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: '900', color: '#1E293B', marginBottom: '10px' }}>{data.temp}°C</div>
          <div style={{ padding: '0 10px' }}>
            <p style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1rem)', fontWeight: '600', color: '#475569', fontStyle: 'italic', lineHeight: '1.5', margin: 0 }}>
              "{data.funny}"
            </p>
          </div>
        </div>

        {/* Prognoza pe 6 zile - Responsive Grid */}
        <div style={{ 
          width: '100%', 
          background: 'rgba(255,255,255,0.4)', 
          borderRadius: '24px', 
          padding: '20px 10px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(6, 1fr)', 
          gap: '5px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
        }}>
          {data.forecast.map((f: any, i: number) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>{f.day}</div>
              <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{f.icon}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#1E293B' }}>{f.temp}°</div>
            </div>
          ))}
        </div>

        <button 
          onClick={() => window.location.reload()} 
          style={{ 
            marginTop: 'clamp(25px, 5vh, 40px)', 
            padding: '12px 30px', 
            borderRadius: '16px', 
            border: 'none', 
            background: '#1E293B', 
            color: 'white', 
            fontWeight: 'bold', 
            cursor: 'pointer', 
            fontSize: '0.9rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            width: 'fit-content'
          }}
        >
          ACTUALIZEAZĂ
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
export default App;