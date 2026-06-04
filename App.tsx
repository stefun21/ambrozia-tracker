import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";
const CACHE_KEY = "ambrozie_free_v1";
const CACHE_TIME_MS = 10 * 60 * 1000;

type DataSource = "Live" | "Estimare" | "Mixt";

type ForecastDay = {
  label: string;
  score: number;
  source: DataSource;
};

type AppData = {
  score: number;
  rawRagweed: number;
  source: DataSource;
  trend: "↑" | "↓" | "→";
  tempNow: number | null;
  tempMax: number | null;
  tempMin: number | null;
  humidity: number | null;
  wind: number | null;
  rain: number | null;
  pm10: number | null;
  pm25: number | null;
  dust: number | null;
  weatherCode: number | null;
  message: string;
  explanation: string;
  forecast: ForecastDay[];
  livePollen: boolean;
  liveWeather: boolean;
};

type WeatherPayload = any;
type AirPayload = any;

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

function getSeasonFactor(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);

  // Ambrozia este de obicei relevantă din iulie până în octombrie,
  // cu vârf frecvent la final de august / septembrie.
  if (month < 6 || month > 11) return 0.15;
  if (month === 6) return 0.35;
  if (month === 7) return 0.65;
  if (month === 8) return 0.9;
  if (month === 9) return 1.0;
  if (month === 10) return day <= 15 ? 0.7 : 0.45;
  if (month === 11) return 0.25;

  // Fallback gaussian în jurul zilei 250.
  const peak = 250;
  const sigma = 38;
  return clamp(Math.exp(-Math.pow(dayOfYear - peak, 2) / (2 * sigma * sigma)), 0.15, 1);
}

function getRegionFactor(lat: number, lon: number) {
  // România + Balcani / Europa Centrală au risc natural mai mare pentru ambrozie.
  const inRomaniaLikeArea = lat >= 43 && lat <= 49 && lon >= 20 && lon <= 30;
  const centralEastEurope = lat >= 42 && lat <= 52 && lon >= 14 && lon <= 32;
  const europe = lat >= 35 && lat <= 60 && lon >= -10 && lon <= 40;

  if (inRomaniaLikeArea) return 1.15;
  if (centralEastEurope) return 1.0;
  if (europe) return 0.75;
  return 0.55;
}

function estimateRagweedScore(params: {
  lat: number;
  lon: number;
  temp: number | null;
  humidity: number | null;
  wind: number | null;
  rain: number | null;
  pm10: number | null;
  pm25: number | null;
  dust: number | null;
  date?: Date;
}) {
  const season = getSeasonFactor(params.date);
  const region = getRegionFactor(params.lat, params.lon);
  const temp = params.temp ?? 24;
  const humidity = params.humidity ?? 55;
  const wind = params.wind ?? 9;
  const rain = params.rain ?? 0;
  const pm10 = params.pm10 ?? 18;
  const pm25 = params.pm25 ?? 9;
  const dust = params.dust ?? 0;

  const tempFactor = clamp((temp - 10) / 18, 0.25, 1.15);
  const humidityFactor = humidity > 80 ? 0.55 : humidity > 65 ? 0.78 : humidity < 30 ? 0.85 : 1.0;
  const windFactor = wind < 4 ? 0.75 : wind < 16 ? 1.0 : 0.82;
  const rainFactor = rain > 2 ? 0.35 : rain > 0.2 ? 0.62 : 1.0;
  const particlesFactor = clamp(0.8 + (pm10 / 80) + (pm25 / 120) + (dust / 250), 0.8, 1.35);

  // Bază calibrată pentru Popești-Leordeni / București: în sezon slab-mediu ajunge des în zona 2-4/10.
  const raw = 3.1 * season * region * tempFactor * humidityFactor * windFactor * rainFactor * particlesFactor;
  return clamp(raw, 0, 10);
}

function scoreFromLiveRagweed(raw: number) {
  // Open-Meteo returnează concentrații modelate. Pentru UI 0-10 folosim o conversie lină,
  // nu raw direct, ca să nu sară instant la 10 când apar valori mari.
  if (raw <= 0) return 0;
  return clamp(10 * (1 - Math.exp(-raw / 35)), 0, 10);
}

function pickNearestIndex(times: string[] = []) {
  if (!times.length) return 0;
  const now = Date.now();
  let bestIndex = 0;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const parsed = new Date(time).getTime();
    if (!Number.isFinite(parsed)) return;
    const diff = Math.abs(parsed - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getDailyLabel(dateString: string, index: number) {
  if (!dateString) return index === 0 ? "Azi" : `Ziua ${index + 1}`;
  if (index === 0) return "Azi";
  if (index === 1) return "Mâine";
  return new Date(dateString).toLocaleDateString("ro-RO", { weekday: "short" });
}

function buildData(lat: number, lon: number, weather: WeatherPayload | null, air: AirPayload | null): AppData {
  const airTimes: string[] = air?.hourly?.time ?? [];
  const airIndex = pickNearestIndex(airTimes);

  const weatherTimes: string[] = weather?.hourly?.time ?? [];
  const weatherIndex = pickNearestIndex(weatherTimes);

  const rawRagweed = safeNumber(air?.current?.ragweed_pollen, safeNumber(air?.hourly?.ragweed_pollen?.[airIndex], 0));
  const hasUsefulLivePollen = Boolean(air) && rawRagweed > 0;

  const tempNow = optionalNumber(weather?.current?.temperature_2m) ?? optionalNumber(weather?.hourly?.temperature_2m?.[weatherIndex]);
  const humidity = optionalNumber(weather?.hourly?.relative_humidity_2m?.[weatherIndex]);
  const wind = optionalNumber(weather?.current?.wind_speed_10m) ?? optionalNumber(weather?.hourly?.wind_speed_10m?.[weatherIndex]);
  const rain = optionalNumber(weather?.hourly?.rain?.[weatherIndex]) ?? optionalNumber(weather?.hourly?.precipitation?.[weatherIndex]);
  const pm10 = optionalNumber(air?.hourly?.pm10?.[airIndex]);
  const pm25 = optionalNumber(air?.hourly?.pm2_5?.[airIndex]);
  const dust = optionalNumber(air?.hourly?.dust?.[airIndex]);

  const estimatedScore = estimateRagweedScore({ lat, lon, temp: tempNow, humidity, wind, rain, pm10, pm25, dust });
  const liveScore = scoreFromLiveRagweed(rawRagweed);

  let score = estimatedScore;
  let source: DataSource = "Estimare";

  if (hasUsefulLivePollen) {
    score = clamp(liveScore * 0.7 + estimatedScore * 0.3, 0, 10);
    source = "Mixt";
  }

  const nextRaw = safeNumber(air?.hourly?.ragweed_pollen?.[airIndex + 1], rawRagweed);
  const nextEstimated = estimateRagweedScore({
    lat,
    lon,
    temp: optionalNumber(weather?.hourly?.temperature_2m?.[weatherIndex + 1]) ?? tempNow,
    humidity: optionalNumber(weather?.hourly?.relative_humidity_2m?.[weatherIndex + 1]) ?? humidity,
    wind: optionalNumber(weather?.hourly?.wind_speed_10m?.[weatherIndex + 1]) ?? wind,
    rain: optionalNumber(weather?.hourly?.rain?.[weatherIndex + 1]) ?? rain,
    pm10: optionalNumber(air?.hourly?.pm10?.[airIndex + 1]) ?? pm10,
    pm25: optionalNumber(air?.hourly?.pm2_5?.[airIndex + 1]) ?? pm25,
    dust: optionalNumber(air?.hourly?.dust?.[airIndex + 1]) ?? dust,
  });
  const nextScore = hasUsefulLivePollen ? clamp(scoreFromLiveRagweed(nextRaw) * 0.7 + nextEstimated * 0.3, 0, 10) : nextEstimated;

  const trend: "↑" | "↓" | "→" = nextScore > score + 0.25 ? "↑" : nextScore < score - 0.25 ? "↓" : "→";

  let message = "✅ Nivel scăzut de ambrozie.";
  if (score >= 7) message = "🛑 Nivel ridicat de ambrozie.";
  else if (score >= 3) message = "⚠️ Nivel mediu de ambrozie.";

  const explanation =
    source === "Mixt"
      ? "Calcul mixt: ambrozie live + estimare meteo/sezon."
      : "Estimare free: sezon + vreme + particule, pentru că API-ul live dă 0/indisponibil.";

  const dailyTimes: string[] = weather?.daily?.time ?? [];
  const forecast: ForecastDay[] = Array.from({ length: 5 }).map((_, index) => {
    const dailyTemp = optionalNumber(weather?.daily?.temperature_2m_max?.[index]) ?? tempNow;
    const dailyRain = optionalNumber(weather?.daily?.precipitation_sum?.[index]) ?? rain;
    const forecastDate = dailyTimes[index] ? new Date(dailyTimes[index]) : new Date(Date.now() + index * 86400000);
    const dayEstimate = estimateRagweedScore({
      lat,
      lon,
      temp: dailyTemp,
      humidity,
      wind,
      rain: dailyRain,
      pm10,
      pm25,
      dust,
      date: forecastDate,
    });
    const dayRaw = safeNumber(air?.hourly?.ragweed_pollen?.[airIndex + index * 24], 0);
    const useLive = dayRaw > 0;
    return {
      label: getDailyLabel(dailyTimes[index], index),
      score: useLive ? clamp(scoreFromLiveRagweed(dayRaw) * 0.7 + dayEstimate * 0.3, 0, 10) : dayEstimate,
      source: useLive ? "Mixt" : "Estimare",
    };
  });

  return {
    score,
    rawRagweed,
    source,
    trend,
    tempNow,
    tempMax: optionalNumber(weather?.daily?.temperature_2m_max?.[0]),
    tempMin: optionalNumber(weather?.daily?.temperature_2m_min?.[0]),
    humidity,
    wind,
    rain,
    pm10,
    pm25,
    dust,
    weatherCode: optionalNumber(weather?.current?.weather_code),
    message,
    explanation,
    forecast,
    livePollen: Boolean(air),
    liveWeather: Boolean(weather),
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8500) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("Se detectează...");
  const [displayScore, setDisplayScore] = useState(0);
  const [notice, setNotice] = useState("");

  const theme = useMemo(() => {
    const score = data?.score ?? 0;
    if (score < 3) return { color: "#22c55e", label: "Scăzut" };
    if (score < 7) return { color: "#f59e0b", label: "Mediu" };
    return { color: "#ef4444", label: "Ridicat" };
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
      const json = await fetchJsonWithTimeout(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`,
        5000
      );
      return json.city || json.locality || json.principalSubdivision || "Locația ta";
    } catch {
      return "Locația ta";
    }
  }

  async function load(lat: number, lon: number, fallbackCity = DEFAULT_CITY) {
    try {
      setNotice("");
      const roundedLat = lat.toFixed(3);
      const roundedLon = lon.toFixed(3);
      const cacheRaw = localStorage.getItem(CACHE_KEY);

      if (cacheRaw) {
        try {
          const cache = JSON.parse(cacheRaw);
          if (cache.lat === roundedLat && cache.lon === roundedLon && Date.now() - cache.ts < CACHE_TIME_MS) {
            setData(cache.data);
            setCity(cache.city);
            return;
          }
        } catch {
          localStorage.removeItem(CACHE_KEY);
        }
      }

      const cityName = await getCity(lat, lon);
      setCity(cityName || fallbackCity);

      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&forecast_days=5&timezone=auto`;

      const airUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=ragweed_pollen` +
        `&hourly=ragweed_pollen,pm10,pm2_5,dust` +
        `&forecast_days=5&timezone=auto`;

      const [weatherResult, airResult] = await Promise.allSettled([
        fetchJsonWithTimeout(weatherUrl),
        fetchJsonWithTimeout(airUrl),
      ]);

      const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
      const air = airResult.status === "fulfilled" ? airResult.value : null;

      if (!weather && !air) {
        throw new Error("Nu s-au putut încărca API-urile free.");
      }

      const computed = buildData(lat, lon, weather, air);
      setData(computed);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), lat: roundedLat, lon: roundedLon, city: cityName || fallbackCity, data: computed })
      );
    } catch (error) {
      console.error(error);
      setNotice("Nu am putut încărca datele live. Afișez o estimare pentru București.");
      setCity(DEFAULT_CITY);
      const computed = buildData(DEFAULT_LAT, DEFAULT_LON, null, null);
      setData(computed);
    }
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setNotice("Browserul nu suportă geolocația. Folosesc București ca fallback.");
      load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude, DEFAULT_CITY),
      () => {
        setNotice("Nu am primit acces la locație. Folosesc București ca fallback.");
        load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        Sincronizare...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "white", fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 430, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#1e293b", padding: "11px 20px", borderRadius: 999, marginBottom: 34, fontWeight: 900, boxShadow: "0 18px 45px rgba(0,0,0,0.22)" }}>
          <span>📍</span>
          <span>{city.toUpperCase()}</span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span style={{ fontSize: 11, opacity: 0.62 }}>AMBROZIE SCANNER</span>
        </div>

        <div style={{ width: 235, height: 235, borderRadius: "50%", margin: "0 auto 28px", border: `12px solid ${theme.color}`, background: "#1e293b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: `0 24px 70px ${theme.color}22` }}>
          <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 900 }}>INDICE AMBROZIE</div>
          <div style={{ fontSize: 78, fontWeight: 950, lineHeight: 1 }}>{displayScore.toFixed(1)}</div>
          <div style={{ color: theme.color, fontWeight: 950 }}>{theme.label} {data.trend}</div>
          <div style={{ fontSize: 12, opacity: 0.74, marginTop: 8 }}>Sursă: {data.source}</div>
        </div>

        <div style={{ background: "#1e293b", borderRadius: 28, padding: 24, marginBottom: 16, boxShadow: "0 22px 55px rgba(0,0,0,0.20)" }}>
          <div style={{ fontSize: 20, fontWeight: 950, marginBottom: 8 }}>{data.message}</div>
          <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.45, marginBottom: 22 }}>{data.explanation}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Info label="ACUM" value={`${weatherIcon(data.weatherCode)} ${data.tempNow === null ? "--" : `${Math.round(data.tempNow)}°`}`} />
            <Info label="MAX" value={data.tempMax === null ? "--" : `${Math.round(data.tempMax)}°`} />
            <Info label="MIN" value={data.tempMin === null ? "--" : `${Math.round(data.tempMin)}°`} />
          </div>
        </div>

        <div style={{ background: "#111827", borderRadius: 22, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {data.forecast.map((day) => (
              <div key={day.label} style={{ background: "#1e293b", borderRadius: 16, padding: "12px 6px" }}>
                <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 900 }}>{day.label}</div>
                <div style={{ fontSize: 19, fontWeight: 950, marginTop: 6 }}>{day.score.toFixed(1)}</div>
                <div style={{ fontSize: 10, opacity: 0.5 }}>{day.source}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.55 }}>
          Polen API: {data.livePollen ? "DA" : "NU"} · Vreme API: {data.liveWeather ? "DA" : "NU"}
          <br />
          Ragweed live brut: {data.rawRagweed.toFixed(2)} · PM10: {data.pm10 === null ? "--" : data.pm10.toFixed(1)}
          {notice && <><br />{notice}</>}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.055)", borderRadius: 18, padding: 14 }}>
      <div style={{ opacity: 0.55, fontWeight: 900, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 950 }}>{value}</div>
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
