import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const CACHE_KEY = "ambrozie_app_working_v1";
const CACHE_TIME = 15 * 60 * 1000;

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";

type ForecastDay = {
  day: string;
  temp: number;
  icon: string;
};

type AppData = {
  score: number;
  trend: "↑" | "↓" | "→";
  pollenNow: number;
  tempNow: number;
  tempMax: number;
  tempMin: number;
  weatherIcon: string;
  advice: string;
  forecast: ForecastDay[];
};

function getWeatherIcon(code: number) {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "🌤️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function getUserPosition(): Promise<{ lat: number; lon: number; cityFallback: string; usedFallback: boolean }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, cityFallback: DEFAULT_CITY, usedFallback: true });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          cityFallback: "Locația ta",
          usedFallback: false,
        });
      },
      () => {
        resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, cityFallback: DEFAULT_CITY, usedFallback: true });
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
      }
    );
  });
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("");
  const [displayScore, setDisplayScore] = useState(0);
  const [status, setStatus] = useState("Sincronizare...");
  const [notice, setNotice] = useState("");

  const theme = useMemo(() => {
    const score = data?.score ?? 0;

    if (score < 3) return { color: "#22c55e", bg: "#f0fdf4", label: "Scăzut" };
    if (score < 7) return { color: "#f59e0b", bg: "#fffbeb", label: "Mediu" };
    return { color: "#ef4444", bg: "#fef2f2", label: "Ridicat" };
  }, [data]);

  useEffect(() => {
    if (!data) return;

    let frame = 0;
    let startTime = 0;

    const animate = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min((now - startTime) / 800, 1);
      setDisplayScore(progress * data.score);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [data]);

  async function getCityName(lat: number, lon: number, fallback: string) {
    try {
      const json = await fetchJsonWithTimeout(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`,
        7000
      );

      return json.city || json.locality || json.principalSubdivision || fallback;
    } catch {
      return fallback;
    }
  }

  async function loadData(lat: number, lon: number, fallbackCity: string, usedFallbackLocation: boolean) {
    const roundedLat = lat.toFixed(2);
    const roundedLon = lon.toFixed(2);

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (
          Date.now() - parsed.ts < CACHE_TIME &&
          parsed.lat === roundedLat &&
          parsed.lon === roundedLon
        ) {
          setData(parsed.data);
          setCity(parsed.city);
          setNotice(parsed.notice || "");
          return;
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    setStatus("Detectez orașul...");
    const cityName = await getCityName(lat, lon, fallbackCity);

    setStatus("Încarc vremea...");

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=auto`;

    const pollenUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=birch_pollen,grass_pollen,ragweed_pollen` +
      `&timezone=auto`;

    const weatherJson = await fetchJsonWithTimeout(weatherUrl, 12000);

    let pollenJson: any = null;
    let pollenNotice = "";

    try {
      setStatus("Încarc datele de polen...");
      pollenJson = await fetchJsonWithTimeout(pollenUrl, 12000);
    } catch {
      pollenNotice = "Datele live de polen nu sunt disponibile momentan. Am afișat vremea și indice 0.";
    }

    const hourlyTimes: string[] = pollenJson?.hourly?.time ?? [];
    const now = new Date();
    const currentHour = now.toISOString().slice(0, 13);
    let hourIndex = hourlyTimes.findIndex((time) => time.startsWith(currentHour));

    if (hourIndex < 0) {
      hourIndex = Math.min(now.getHours(), Math.max(hourlyTimes.length - 1, 0));
    }

    const birch = pollenJson?.hourly?.birch_pollen ?? [];
    const grass = pollenJson?.hourly?.grass_pollen ?? [];
    const ragweed = pollenJson?.hourly?.ragweed_pollen ?? [];

    const pollenNow =
      safeNumber(birch[hourIndex]) + safeNumber(grass[hourIndex]) + safeNumber(ragweed[hourIndex]);

    const pollenNext =
      safeNumber(birch[hourIndex + 1]) +
      safeNumber(grass[hourIndex + 1]) +
      safeNumber(ragweed[hourIndex + 1]);

    const score = Math.min(Math.max(pollenNow / 15, 0), 10);
    const trend: AppData["trend"] = pollenNext > pollenNow ? "↑" : pollenNext < pollenNow ? "↓" : "→";

    const currentWeatherCode = safeNumber(weatherJson.current?.weather_code);

    const payload: AppData = {
      score,
      trend,
      pollenNow,
      tempNow: Math.round(safeNumber(weatherJson.current?.temperature_2m)),
      tempMax: Math.round(safeNumber(weatherJson.daily?.temperature_2m_max?.[0])),
      tempMin: Math.round(safeNumber(weatherJson.daily?.temperature_2m_min?.[0])),
      weatherIcon: getWeatherIcon(currentWeatherCode),
      advice:
        score > 7
          ? "🛑 Geamuri închise! Nivel ridicat de polen."
          : score > 3
            ? "⚠️ Nivel moderat. Evită ieșirile lungi."
            : "✅ Nivel scăzut. Aerul este ok.",
      forecast: (weatherJson.daily?.time ?? []).slice(1, 7).map((time: string, index: number) => ({
        day: new Date(time).toLocaleDateString("ro-RO", { weekday: "short" }),
        temp: Math.round(safeNumber(weatherJson.daily?.temperature_2m_max?.[index + 1])),
        icon: getWeatherIcon(safeNumber(weatherJson.daily?.weather_code?.[index + 1])),
      })),
    };

    const finalNotice = usedFallbackLocation
      ? "Locația nu a fost permisă. Am folosit București ca fallback."
      : pollenNotice;

    setData(payload);
    setCity(cityName);
    setNotice(finalNotice);

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        lat: roundedLat,
        lon: roundedLon,
        city: cityName,
        data: payload,
        notice: finalNotice,
      })
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setStatus("Cer permisiunea pentru locație...");
        const position = await getUserPosition();
        if (cancelled) return;

        await loadData(position.lat, position.lon, position.cityFallback, position.usedFallback);
      } catch (error) {
        console.error(error);

        if (cancelled) return;

        setNotice("Nu am putut încărca date live. Verifică internetul/API-urile și reîncearcă.");
        setData({
          score: 0,
          trend: "→",
          pollenNow: 0,
          tempNow: 0,
          tempMax: 0,
          tempMin: 0,
          weatherIcon: "☁️",
          advice: "Date indisponibile momentan.",
          forecast: [],
        });
        setCity("Offline");
      }
    }

    start();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          background: "#0f172a",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontSize: "1.2rem", fontWeight: 900 }}>{status}</div>
        <div style={{ opacity: 0.7, fontSize: "0.9rem" }}>Acceptă locația ca aplicația să meargă pentru orașul tău.</div>
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background-color: ${theme.bg};
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .app-shell {
          background-color: ${theme.bg};
          color: #1e293b;
        }

        .main-card {
          background: white;
          color: #1e293b;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          color: #1e293b;
        }

        @media (prefers-color-scheme: dark) {
          body { background-color: #0f172a; }
          .app-shell { background-color: #0f172a !important; color: #f1f5f9; }
          .main-card { background: #1e293b !important; color: white !important; }
          .glass-card { background: rgba(30, 41, 59, 0.75) !important; color: white !important; }
          .pill-divider { background: #475569 !important; }
        }

        .container {
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
      `}</style>

      <div className="container">
        <header style={{ marginBottom: 35 }}>
          <div
            className="main-card"
            style={{
              padding: "10px 20px",
              borderRadius: 40,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 8px 15px rgba(0,0,0,0.04)",
            }}
          >
            <span style={{ fontSize: "1rem" }}>📍</span>
            <span style={{ fontSize: "0.9rem", fontWeight: 900, letterSpacing: "0.5px" }}>{city.toUpperCase()}</span>
            <span className="pill-divider" style={{ width: 1, height: 14, background: "#cbd5e1" }} />
            <span style={{ fontSize: "0.65rem", fontWeight: 800, opacity: 0.6, letterSpacing: 1 }}>AMBROZIE SCANNER</span>
          </div>
        </header>

        <div
          className="main-card"
          style={{
            width: 230,
            height: 230,
            borderRadius: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: `12px solid ${theme.color}`,
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            marginBottom: 30,
          }}
        >
          <span style={{ fontSize: "0.7rem", fontWeight: "bold", opacity: 0.6 }}>INDICE POLEN</span>
          <span style={{ fontSize: "5rem", fontWeight: 950, lineHeight: 1 }}>{displayScore.toFixed(1)}</span>
          <span style={{ fontSize: "0.95rem", fontWeight: "bold", color: theme.color }}>
            {theme.label} {data.trend}
          </span>
          <span style={{ fontSize: "0.75rem", marginTop: 6, opacity: 0.65 }}>polen: {data.pollenNow.toFixed(1)}</span>
        </div>

        <div
          className="main-card"
          style={{
            width: "100%",
            borderRadius: 28,
            padding: 22,
            boxSizing: "border-box",
            boxShadow: "0 20px 45px rgba(0,0,0,0.08)",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: "1.1rem", fontWeight: 900, marginBottom: 12 }}>{data.advice}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: "0.7rem", fontWeight: 800 }}>ACUM</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>{data.weatherIcon} {data.tempNow}°</div>
            </div>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: "0.7rem", fontWeight: 800 }}>MAX</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>{data.tempMax}°</div>
            </div>
            <div className="glass-card" style={{ padding: 14, borderRadius: 18 }}>
              <div style={{ opacity: 0.6, fontSize: "0.7rem", fontWeight: 800 }}>MIN</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>{data.tempMin}°</div>
            </div>
          </div>
        </div>

        {data.forecast.length > 0 && (
          <div
            className="glass-card"
            style={{
              width: "100%",
              borderRadius: 24,
              padding: 16,
              boxSizing: "border-box",
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 8,
            }}
          >
            {data.forecast.map((item, index) => (
              <div key={`${item.day}-${index}`}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, opacity: 0.65 }}>{item.day}</div>
                <div style={{ fontSize: "1.2rem", margin: "5px 0" }}>{item.icon}</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 900 }}>{item.temp}°</div>
              </div>
            ))}
          </div>
        )}

        {notice && <div style={{ marginTop: 16, fontSize: "0.82rem", opacity: 0.75 }}>{notice}</div>}
      </div>
    </div>
  );
}

export default App;

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
