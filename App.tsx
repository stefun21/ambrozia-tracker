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
    } catch (e) { setCity("Locația Ta"); }
  };

  const getFunnyMessage = (temp: number, wind: number, rain: number) => {
    const messages = {
      heat: [
        "Curaj, încă puțin și ne topim ca înghețata la soare.",
        "Dacă era mai cald, ieșeam cu prosopul pe stradă.",
        "Oficial: asfaltul e acum o tigaie uriașă.",
        "O zi perfectă să te muți în congelator.",
        "Aerul condiționat e noul tău cel mai bun prieten."
      ],
      cold: [
        "Frigul ăsta mușcă mai tare decât un maidanez flămând.",
        "Dacă strănuți acum, îngheață în aer. Mare grijă!",
        "E vremea aia când caloriferul e idolul tău.",
        "Pinguinii tocmai au cerut o pătură în plus.",
        "Straturi, Alex, straturi! Fii o ceapă umană azi."
      ],
      rain: [
        "Perfect pentru spălat mașina pe gratis. Sau nu.",
        "Nu ești de zahăr, dar o umbrelă n-ar strica deloc.",
        "Dacă vezi o arcă, urcă-te în ea fără să pui întrebări.",
        "Broaștele sunt în extaz, noi mai puțin.",
        "Atenție la bălți! Unele au propriul lor cod poștal."
      ],
      wind: [
        "Ține-ți pălăria sau zi-i adio, pleacă în alt județ.",
        "Vântul ăsta îți face freza nouă fără să ceri.",
        "Dacă ești slab, pune niște pietre în buzunare azi.",
        "Zbori, puiule, zbori! Sau măcar mergi înclinat.",
        "Vânt bun pentru navigație, prost pentru coafură."
      ],
      perfect: [
        "Vreme de pus în ramă. Profită cât durează!",
        "Nici prea-prea, nici foarte-foarte. Boierie!",
        "Dacă nici azi nu ieși, când mai ieși?",
        "E atât de bine că și factura la gaz a zâmbit.",
        "Vreme de stat la terasă și uitat de griji."
      ]
    };

    if (rain > 0.1) return messages.rain[Math.floor(Math.random() * 5)];
    if (wind > 25) return messages.wind[Math.floor(Math.random() * 5)];
    if (temp > 28) return messages.heat[Math.floor(Math.random() * 5)];
    if (temp < 12) return messages.cold[Math.floor(Math.random() * 5)];
    return messages.perfect[Math.floor(Math.random() * 5)];
  };

  const updateData = async (lat: number, lon: number) => {
    try {
      const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,rain&timezone=auto`);
      const wJson = await wRes.json();
      
      const aRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,grass_pollen,ragweed_pollen,alder_pollen&timezone=auto`);
      const aJson = await aRes.json();
      
      const h = new Date().getHours();
      const rawPollen = (aJson.hourly?.birch_pollen?.[h] || 0) + (aJson.hourly?.grass_pollen?.[h] || 0) + (aJson.hourly?.ragweed_pollen?.[h] || 0) + (aJson.hourly?.alder_pollen?.[h] || 0);
      
      // Scara 0-10: 150 total polen = Nota 10
      let score = (rawPollen / 15); 
      if (score > 10) score = 10;
      if (score < 0.1 && rawPollen > 0) score = 0.5;

      setData({
        score: score,
        temp: Math.round(wJson.current?.temperature_2m || 0),
        wind: wJson.current?.wind_speed_10m || 0,
        rain: wJson.current?.rain || 0,
        funny: getFunnyMessage(wJson.current?.temperature_2m, wJson.current?.wind_speed_10m, wJson.current?.rain)
      });
      await getCityName(lat, lon);
    } catch (e) { 
      setError("Satelitul e în pauză de masă..."); 
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => updateData(p.coords.latitude, p.coords.longitude), 
        () => updateData(44.43, 26.10),
        { timeout: 10000 }
      );
    } else { 
      updateData(44.43, 26.10); 
    }
  }, []);

  if (error) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px'}}>{error}</div>;
  if (!data) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif'}}>Se calculează zen-ul...</div>;

  const getColors = (v: number) => {
    if (v < 3) return { bg: '#F0FDF4', circle: '#22C55E', text: '#166534' };
    if (v < 7) return { bg: '#FFFBEB', circle: '#F59E0B', text: '#92400E' };
    return { bg: '#FEF2F2', circle: '#EF4444', text: '#991B1B' };
  };

  const theme = getColors(data.score);

  return (
    <div style={{ 
      minHeight: '100vh', backgroundColor: theme.bg, fontFamily: 'system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', transition: 'all 0.8s ease'
    }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: '900', color: theme.text, letterSpacing: '2px', marginBottom: '40px' }}>{city.toUpperCase()}</h1>
      
      <div style={{ 
        width: '260px', height: '260px', borderRadius: '5