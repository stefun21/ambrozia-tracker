import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";

type ApiForecastDay = {
  date: string;
  score: number;
  raw: number | null;
  source: string;
};

type ApiResponse = {
  ok: boolean;
  city?: string;
  source?: string;
  score?: number;
  rawRagweed?: number | null;
  category?: string;
  trend?: "↑" | "↓" | "→";
  livePollen?: boolean;
  liveWeather?: boolean;
  message?: string;
  healthRecommendation?: string;
  tempNow?: number | null;
  tempMax?: number | null;
  tempMin?: number | null;
  weatherCode?: number | null;
  forecast?: ApiForecastDay[];
  debug?: unknown;
};

type AppData = Required<Pick<ApiResponse, "score" | "category" | "trend" | "livePollen" | "liveWeather">> & {
  source: string;
  rawRagweed: number | null;
  message: string;
  healthRecommendation: string;
  tempNow: number | null;
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number | null;
  forecast: ApiForecastDay[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const [status, setStatus] = useState("Sincronizare...");
  const [error, setError] = useState("");

  const theme = useMemo(() => {
    const score = data?.score ?? 0;

    if (score < 3) return { color: "#22c55e", label: "Scăzut" };
    if (score < 7) return { color: "#f59e0b", label: "Mediu" };
    return { color: "#ef4444", label: "Ridicat" };
  }, [data?.score]);

  useEffect(() => {
    if (!data) return;

    let frame = 0;
    let start = 0;

    const animate = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / 750, 1);
      setDisplayScore(progress * data.score);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [data]);

  async function load(lat: number, lon: number) {
    setStatus("Se încarcă datele live...");
    setError("");

    try {
      const response = await fetch(`/api/pollen?lat=${lat}&lon=${lon}`);
      const json: ApiResponse = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Nu am putut încărca datele.");
      }

      const score = clamp(safeNumber(json.score), 0, 10);

      setCity(json.city || DEFAULT_CITY);
      setData({
        score,
        rawRagweed: json.rawRagweed ?? null,
        category: json.category || (score < 3 ? "Scăzut" : score < 7 ? "Mediu" : "Ridicat"),
        trend: json.trend || "→",
        source: json.source || "Necunoscut",
        livePollen: Boolean(json.livePollen),
        liveWeather: Boolean(json.liveWeather),
        message:
          json.message ||
          (score >= 7
            ? "🛑 Nivel ridicat de ambrozie."
            : score >= 3
              ? "⚠️ Nivel mediu de ambrozie."
              : "✅ Nivel scăzut de ambrozie."),
        healthRecommendation: json.healthRecommendation || "",
        tempNow: json.tempNow ?? null,
        tempMax: json.tempMax ?? null,
        tempMin: json.tempMin ?? null,
        weatherCode: json.weatherCode ?? null,
        forecast: json.forecast || [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Eroare necunoscută.";
      setError(message);
      setCity("Date indisponibile");
      setData({
        score: 0,
        rawRagweed: null,
        category: "Indisponibil",
        trend: "→",
        source: "Niciun API",
        livePollen: false,
        liveWeather: false,
        message: "Date indisponibile momentan.",
        healthRecommendation: "Verifică API keys în Vercel Environment Variables și redeploy.",
        tempNow: null,
        tempMax: null,
        tempMin: null,
        weatherCode: null,
        forecast: [],
      });
    } finally {
      setStatus("");
    }
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      load(DEFAULT_LAT, DEFAULT_LON);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => load(position.coords.latitude, position.coords.longitude),
      () => load(DEFAULT_LAT, DEFAULT_LON),
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 10 * 60 * 1000,
      }
    );
  }, []);

  if (!data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0f172a",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 800,
        }}
      >
        {status || "Sincronizare..."}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 430, textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "#1e293b",
            padding: "11px 20px",
            borderRadius: 999,
            marginBottom: 36,
            fontWeight: 950,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          }}
        >
          <span>📍</span>
          <span>{city.toUpperCase()}</span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span style={{ fontSize: 11, opacity: 0.62, letterSpacing: 1 }}>AMBROZIE SCANNER</span>
        </div>

        <div
          style={{
            width: 230,
            height: 230,
            borderRadius: "50%",
            margin: "0 auto 30px",
            border: `12px solid ${theme.color}`,
            background: "#1e293b",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 22px 55px rgba(0,0,0,0.22)`,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 950 }}>INDICE AMBROZIE</div>
          <div style={{ fontSize: 78, fontWeight: 950, lineHeight: 1 }}>{displayScore.toFixed(1)}</div>
          <div style={{ color: theme.color, fontWeight: 950 }}>
            {data.category || theme.label} {data.trend}
          </div>
          <div style={{ fontSize: 13, opacity: 0.78, marginTop: 8 }}>
            sursă: {data.source}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
            raw: {data.rawRagweed === null ? "n/a" : data.rawRagweed.toFixed(2)}
          </div>
        </div>

        <div
          style={{
            background: "#1e293b",
            borderRadius: 28,
            padding: 26,
            marginBottom: 18,
            boxShadow: "0 18px 45px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 950, marginBottom: 24 }}>{data.message}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div>
              <div style={{ opacity: 0.55, fontWeight: 950, fontSize: 12 }}>ACUM</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {weatherIcon(data.weatherCode)} {data.tempNow === null ? "--" : `${Math.round(data.tempNow)}°`}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.55, fontWeight: 950, fontSize: 12 }}>MAX</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {data.tempMax === null ? "--" : `${Math.round(data.tempMax)}°`}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.55, fontWeight: 950, fontSize: 12 }}>MIN</div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>
                {data.tempMin === null ? "--" : `${Math.round(data.tempMin)}°`}
              </div>
            </div>
          </div>
        </div>

        {data.healthRecommendation && (
          <div style={{ background: "rgba(30,41,59,0.72)", borderRadius: 18, padding: 14, marginBottom: 18, fontSize: 13, opacity: 0.9 }}>
            {data.healthRecommendation}
          </div>
        )}

        {data.forecast.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.forecast.length, 5)}, 1fr)`, gap: 8, marginBottom: 18 }}>
            {data.forecast.slice(0, 5).map((day) => (
              <div key={day.date} style={{ background: "#1e293b", borderRadius: 16, padding: "10px 6px" }}>
                <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 900 }}>
                  {new Date(day.date).toLocaleDateString("ro-RO", { weekday: "short" })}
                </div>
                <div style={{ fontSize: 20, fontWeight: 950 }}>{safeNumber(day.score).toFixed(1)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.45 }}>
          Polen live: {data.livePollen ? "DA" : "NU"} · Vreme live: {data.liveWeather ? "DA" : "NU"}
          <br />
          Prioritate API: Google Pollen → Ambee → Open-Meteo.
          {error && <><br />Eroare: {error}</>}
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
