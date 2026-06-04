import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";

type AppData = {
  score: number;
  rawRagweed: number;
  trend: "↑" | "↓" | "→";
  tempNow: number | null;
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number | null;
  message: string;
  livePollen: boolean;
  liveWeather: boolean;
};

function safeNumber(v: unknown, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function scoreFromRagweed(raw: number) {
  return clamp(raw, 0, 10);
}

function weatherIcon(code: number | null) {
  if (code === null) return "🌫️";
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "🌤️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("Se detectează...");
  const [displayScore, setDisplayScore] = useState(0);

  const theme = useMemo(() => {
    const score = data?.score ?? 0;
    if (score < 3) return { color: "#22c55e", bg: "#0f172a", label: "Scăzut" };
    if (score < 7) return { color: "#f59e0b", bg: "#0f172a", label: "Mediu" };
    return { color: "#ef4444", bg: "#0f172a", label: "Ridicat" };
  }, [data]);

  useEffect(() => {
    if (!data) return;

    let frame = 0;
    let start = 0;

    const animate = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / 700, 1);
      setDisplayScore(progress * data.score);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [data]);

  async function getCity(lat: number, lon: number) {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`
      );
      const json = await res.json();
      return json.city || json.locality || json.principalSubdivision || "Locația ta";
    } catch {
      return "Locația ta";
    }
  }

  function pickNearestHourlyValue(times: string[] = [], values: number[] = []) {
    if (!times.length || !values.length) return 0;

    const now = Date.now();
    let bestIndex = 0;
    let bestDiff = Infinity;

    times.forEach((t, i) => {
      const diff = Math.abs(new Date(t).getTime() - now);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    });

    return safeNumber(values[bestIndex], 0);
  }

  async function load(lat: number, lon: number, fallbackCity = DEFAULT_CITY) {
    const realCity = await getCity(lat, lon);
    setCity(realCity || fallbackCity);

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=auto`;

    const pollenUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=ragweed_pollen` +
      `&hourly=ragweed_pollen` +
      `&timezone=auto`;

    const [weatherResult, pollenResult] = await Promise.allSettled([
      fetch(weatherUrl).then((r) => {
        if (!r.ok) throw new Error("Weather API error");
        return r.json();
      }),
      fetch(pollenUrl).then((r) => {
        if (!r.ok) throw new Error("Pollen API error");
        return r.json();
      }),
    ]);

    const weather =
      weatherResult.status === "fulfilled" ? weatherResult.value : null;

    const pollen =
      pollenResult.status === "fulfilled" ? pollenResult.value : null;

    const rawCurrent = pollen?.current?.ragweed_pollen;
    const rawHourly = pickNearestHourlyValue(
      pollen?.hourly?.time,
      pollen?.hourly?.ragweed_pollen
    );

    const rawRagweed = safeNumber(rawCurrent, rawHourly);
    const nextRagweed = safeNumber(pollen?.hourly?.ragweed_pollen?.[1], rawRagweed);
    const score = scoreFromRagweed(rawRagweed);

    const trend: "↑" | "↓" | "→" =
      nextRagweed > rawRagweed ? "↑" : nextRagweed < rawRagweed ? "↓" : "→";

    let message = "✅ Nivel scăzut de ambrozie.";
    if (score >= 7) message = "🛑 Nivel ridicat de ambrozie.";
    else if (score >= 3) message = "⚠️ Nivel mediu de ambrozie.";

    setData({
      score,
      rawRagweed,
      trend,
      tempNow: weather?.current?.temperature_2m ?? null,
      tempMax: weather?.daily?.temperature_2m_max?.[0] ?? null,
      tempMin: weather?.daily?.temperature_2m_min?.[0] ?? null,
      weatherCode: weather?.current?.weather_code ?? null,
      message,
      livePollen: Boolean(pollen),
      liveWeather: Boolean(weather),
    });
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        load(pos.coords.latitude, pos.coords.longitude, DEFAULT_CITY);
      },
      () => {
        load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
      }
    );
  }, []);

  if (!data) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif"
      }}>
        Sincronizare...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: theme.bg,
      color: "white",
      fontFamily: "system-ui, sans-serif",
      display: "flex",
      justifyContent: "center",
      padding: "24px",
      boxSizing: "border-box"
    }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "#1e293b",
          padding: "11px 20px",
          borderRadius: 999,
          marginBottom: 36,
          fontWeight: 900
        }}>
          <span>📍</span>
          <span>{city.toUpperCase()}</span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>AMBROZIE SCANNER</span>
        </div>

        <div style={{
          width: 230,
          height: 230,
          borderRadius: "50%",
          margin: "0 auto 30px",
          border: `12px solid ${theme.color}`,
          background: "#1e293b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 900 }}>
            INDICE AMBROZIE
          </div>
          <div style={{ fontSize: 78, fontWeight: 950, lineHeight: 1 }}>
            {displayScore.toFixed(1)}
          </div>
          <div style={{ color: theme.color, fontWeight: 900 }}>
            {theme.label} {data.trend}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>
            ragweed: {data.rawRagweed.toFixed(2)}
          </div>
        </div>

        <div style={{
          background: "#1e293b",
          borderRadius: 28,
          padding: 26,
          marginBottom: 24
        }}>
          <div style={{ fontSize: 20, fontWeight: 950, marginBottom: 26 }}>
            {data.message}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12
          }}>
            <div>
              <div style={{ opacity: 0.55, fontWeight: 900, fontSize: 12 }}>ACUM</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {weatherIcon(data.weatherCode)}{" "}
                {data.tempNow === null ? "--" : `${Math.round(data.tempNow)}°`}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.55, fontWeight: 900, fontSize: 12 }}>MAX</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {data.tempMax === null ? "--" : `${Math.round(data.tempMax)}°`}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.55, fontWeight: 900, fontSize: 12 }}>MIN</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {data.tempMin === null ? "--" : `${Math.round(data.tempMin)}°`}
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.45 }}>
          Polen live: {data.livePollen ? "DA" : "NU"} · Vreme live:{" "}
          {data.liveWeather ? "DA" : "NU"}
          <br />
          Scorul este calculat strict din ambrozie / ragweed_pollen.
        </div>
      </div>
    </div>
  );
}

export default App;

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
