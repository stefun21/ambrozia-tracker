import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";
const CACHE_KEY = "ambrozie_premium_mobile_v3_pwa_calibrated";
const CACHE_TIME_MS = 10 * 60 * 1000;

type DataSource = "Live" | "Estimare" | "Mixt";
type Trend = "↑" | "↓" | "→";

type ForecastDay = {
  label: string;
  score: number;
  source: DataSource;
};

type AppData = {
  score: number;
  source: DataSource;
  trend: Trend;
  level: string;
  message: string;
  detail: string;
  tempNow: number | null;
  tempMax: number | null;
  tempMin: number | null;
  humidity: number | null;
  wind: number | null;
  rain: number | null;
  pm10: number | null;
  rawRagweed: number;
  weatherCode: number | null;
  forecast: ForecastDay[];
  livePollen: boolean;
  liveWeather: boolean;
  updatedAt: string;
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
  if (code === null) return "☁️";
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "🌤️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

function getLevel(score: number) {
  if (score < 1) return "Foarte scăzut";
  if (score < 3) return "Scăzut";
  if (score < 5) return "Moderat";
  if (score < 7) return "Ridicat";
  return "Foarte ridicat";
}

function getSeasonFactor(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 1) return 0.08;
  if (month === 2) return 0.08;
  if (month === 3) return 0.12;
  if (month === 4) return 0.18;
  if (month === 5) return 0.28;
  if (month === 6) return 0.45;
  if (month === 7) return 0.68;
  if (month === 8) return 0.92;
  if (month === 9) return 0.96;
  if (month === 10) return day <= 15 ? 0.68 : 0.44;
  if (month === 11) return 0.22;
  return 0.1;
}

function getRegionFactor(lat: number, lon: number) {
  const romaniaArea = lat >= 43 && lat <= 49 && lon >= 20 && lon <= 30;
  const centralEastEurope = lat >= 42 && lat <= 52 && lon >= 14 && lon <= 32;
  const europe = lat >= 35 && lat <= 60 && lon >= -10 && lon <= 40;
  const northAmerica = lat >= 25 && lat <= 55 && lon >= -130 && lon <= -60;

  if (romaniaArea) return 1.08;
  if (centralEastEurope) return 0.98;
  if (europe) return 0.82;
  if (northAmerica) return 0.85;
  return 0.62;
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
  const wind = params.wind ?? 8;
  const rain = params.rain ?? 0;
  const pm10 = params.pm10 ?? 20;
  const pm25 = params.pm25 ?? 9;
  const dust = params.dust ?? 0;

  const tempFactor = clamp((temp - 8) / 20, 0.28, 1.15);
  const humidityFactor = humidity > 85 ? 0.55 : humidity > 70 ? 0.76 : humidity < 30 ? 0.88 : 1.0;
  const windFactor = wind < 3 ? 0.78 : wind <= 15 ? 1.04 : 0.84;
  const rainFactor = rain > 3 ? 0.32 : rain > 0.4 ? 0.58 : 1.0;
  const particlesFactor = clamp(0.85 + pm10 / 95 + pm25 / 160 + dust / 300, 0.85, 1.25);

  const raw = 12.5 * season * region * tempFactor * humidityFactor * windFactor * rainFactor * particlesFactor;
  let softMinimum = 0.55 * season * region;

  const isRomania = params.lat >= 43 && params.lat <= 49 && params.lon >= 20 && params.lon <= 30;
  const month = (params.date ?? new Date()).getMonth() + 1;

  if (isRomania && month >= 7 && month <= 10) {
    softMinimum = Math.max(softMinimum, 2.1);
  }

  return clamp(Math.max(raw, softMinimum), 0.2, 8.2);
}

function scoreFromLiveRagweed(raw: number) {
  if (raw <= 0) return 0;
  return clamp(10 * (1 - Math.exp(-raw / 55)), 0, 10);
}

function computeFinalScore(rawRagweed: number, estimatedScore: number) {
  const liveScore = scoreFromLiveRagweed(rawRagweed);

  if (rawRagweed > 0 && liveScore > 0) {
    return {
      score: clamp(liveScore * 0.7 + estimatedScore * 0.3, 0, 10),
      source: "Mixt" as DataSource,
    };
  }

  return {
    score: clamp(estimatedScore * 0.75, 0, 8.2),
    source: "Estimare" as DataSource,
  };
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

  const rawRagweed = safeNumber(
    air?.current?.ragweed_pollen,
    safeNumber(air?.hourly?.ragweed_pollen?.[airIndex], 0)
  );

  const tempNow = optionalNumber(weather?.current?.temperature_2m) ?? optionalNumber(weather?.hourly?.temperature_2m?.[weatherIndex]);
  const humidity = optionalNumber(weather?.hourly?.relative_humidity_2m?.[weatherIndex]);
  const wind = optionalNumber(weather?.current?.wind_speed_10m) ?? optionalNumber(weather?.hourly?.wind_speed_10m?.[weatherIndex]);
  const rain = optionalNumber(weather?.hourly?.rain?.[weatherIndex]) ?? optionalNumber(weather?.hourly?.precipitation?.[weatherIndex]);
  const pm10 = optionalNumber(air?.hourly?.pm10?.[airIndex]);
  const pm25 = optionalNumber(air?.hourly?.pm2_5?.[airIndex]);
  const dust = optionalNumber(air?.hourly?.dust?.[airIndex]);

  const estimatedScore = estimateRagweedScore({ lat, lon, temp: tempNow, humidity, wind, rain, pm10, pm25, dust });
  const final = computeFinalScore(rawRagweed, estimatedScore);
  const score = final.score;
  const source = final.source;

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
  const nextScore = computeFinalScore(nextRaw, nextEstimated).score;
  const trend: Trend = nextScore > score + 0.25 ? "↑" : nextScore < score - 0.25 ? "↓" : "→";

  const level = getLevel(score);
  const message = score >= 7 ? "Ține geamurile închise" : score >= 5 ? "Ai grijă la expunere" : score >= 3 ? "Nivel moderat azi" : "Aer prietenos azi";
  const detail = source === "Mixt" ? "Date live + model meteo calibrat" : "Estimare meteo/sezon calibrată";

  const dailyTimes: string[] = weather?.daily?.time ?? [];
  const forecast: ForecastDay[] = Array.from({ length: 4 }).map((_, index) => {
    const dailyTemp = optionalNumber(weather?.daily?.temperature_2m_max?.[index]) ?? tempNow;
    const dailyRain = optionalNumber(weather?.daily?.precipitation_sum?.[index]) ?? rain;
    const forecastDate = dailyTimes[index] ? new Date(dailyTimes[index]) : new Date(Date.now() + index * 86400000);
    const dayEstimate = estimateRagweedScore({ lat, lon, temp: dailyTemp, humidity, wind, rain: dailyRain, pm10, pm25, dust, date: forecastDate });
    const dayRaw = safeNumber(air?.hourly?.ragweed_pollen?.[airIndex + index * 24], 0);
    const dayFinal = computeFinalScore(dayRaw, dayEstimate);

    return {
      label: getDailyLabel(dailyTimes[index], index),
      score: dayFinal.score,
      source: dayFinal.source,
    };
  });

  return {
    score,
    source,
    trend,
    level,
    message,
    detail,
    tempNow,
    tempMax: optionalNumber(weather?.daily?.temperature_2m_max?.[0]),
    tempMin: optionalNumber(weather?.daily?.temperature_2m_min?.[0]),
    humidity,
    wind,
    rain,
    pm10,
    rawRagweed,
    weatherCode: optionalNumber(weather?.current?.weather_code),
    forecast,
    livePollen: Boolean(air),
    liveWeather: Boolean(weather),
    updatedAt: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("Locația ta");
  const [displayScore, setDisplayScore] = useState(0);
  const [notice, setNotice] = useState("Pornim scannerul...");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const theme = useMemo(() => {
    const score = data?.score ?? 0;
    if (score < 3) return { color: "#2dd4bf", glow: "rgba(45, 212, 191, 0.35)", soft: "rgba(45, 212, 191, 0.16)" };
    if (score < 7) return { color: "#fbbf24", glow: "rgba(251, 191, 36, 0.35)", soft: "rgba(251, 191, 36, 0.16)" };
    return { color: "#fb7185", glow: "rgba(251, 113, 133, 0.38)", soft: "rgba(251, 113, 133, 0.17)" };
  }, [data?.score]);

  useEffect(() => {
    if (!data) return;

    let frame = 0;
    let start = 0;
    const from = displayScore;
    const to = data.score;

    const animate = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / 650, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.score]);

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

  async function load(lat: number, lon: number, fallbackCity = DEFAULT_CITY, force = false) {
    try {
      setIsRefreshing(true);
      setNotice(data ? "Actualizăm datele..." : "Detectăm locația și nivelul de ambrozie...");

      const roundedLat = lat.toFixed(3);
      const roundedLon = lon.toFixed(3);
      const cacheRaw = localStorage.getItem(CACHE_KEY);

      if (!force && cacheRaw) {
        try {
          const cache = JSON.parse(cacheRaw);
          if (cache.lat === roundedLat && cache.lon === roundedLon && Date.now() - cache.ts < CACHE_TIME_MS) {
            setData(cache.data);
            setCity(cache.city);
            setNotice("Date actualizate recent");
            setIsRefreshing(false);
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
        `&forecast_days=4&timezone=auto`;

      const airUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=ragweed_pollen` +
        `&hourly=ragweed_pollen,pm10,pm2_5,dust` +
        `&forecast_days=4&timezone=auto`;

      const [weatherResult, airResult] = await Promise.allSettled([
        fetchJsonWithTimeout(weatherUrl),
        fetchJsonWithTimeout(airUrl),
      ]);

      const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
      const air = airResult.status === "fulfilled" ? airResult.value : null;

      if (!weather && !air) throw new Error("API unavailable");

      const computed = buildData(lat, lon, weather, air);
      setData(computed);
      setNotice(computed.source === "Estimare" ? "Estimare activă când datele live lipsesc" : "Date sincronizate");

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), lat: roundedLat, lon: roundedLon, city: cityName || fallbackCity, data: computed })
      );
    } catch (error) {
      console.error(error);
      setNotice("Conexiune instabilă. Afișăm o estimare sigură.");
      setCity(fallbackCity);
      setData(buildData(DEFAULT_LAT, DEFAULT_LON, null, null));
    } finally {
      setIsRefreshing(false);
    }
  }

  function startLocationFlow(force = false) {
    if (!navigator.geolocation) {
      setNotice("Browserul nu suportă geolocația. Folosim București.");
      load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY, force);
      return;
    }

    setNotice("Cerem acces la locație...");
    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude, DEFAULT_CITY, force),
      () => {
        setNotice("Locația nu este disponibilă. Folosim București.");
        load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY, force);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
    );
  }

  useEffect(() => {
    startLocationFlow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return <LoadingScreen text={notice} />;
  }

  const progress = clamp(data.score / 10, 0, 1);
  const circumference = 2 * Math.PI * 87;
  const dash = circumference * progress;

  return (
    <>
      <style>{styles}</style>
      <main className="screen" style={{ "--accent": theme.color, "--glow": theme.glow, "--soft": theme.soft } as React.CSSProperties}>
        <section className="phone-card">
          <div className="topbar">
            <div>
              <div className="eyebrow">Ambrozie Scanner</div>
              <div className="city">{city}</div>
            </div>
            <button className="refresh" onClick={() => startLocationFlow(true)} aria-label="Actualizează datele">
              {isRefreshing ? "⟳" : "↻"}
            </button>
          </div>

          <div className="hero">
            <div className="score-ring">
              <svg className="ring" viewBox="0 0 206 206" aria-hidden="true">
                <circle className="ring-track" cx="103" cy="103" r="87" />
                <circle
                  className="ring-progress"
                  cx="103"
                  cy="103"
                  r="87"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                />
              </svg>
              <div className="score-content">
                <div className="score-label">Indice</div>
                <div className="score-number">{displayScore.toFixed(1)}</div>
                <div className="score-scale">/10</div>
              </div>
            </div>

            <div className="hero-copy">
              <div className="status-pill">{data.source} · {data.trend}</div>
              <h1>{data.level}</h1>
              <p>{data.message}</p>
            </div>
          </div>

          <div className="mini-grid">
            <Metric label="Temp" value={data.tempNow === null ? "--" : `${Math.round(data.tempNow)}°`} />
            <Metric label="Umid" value={data.humidity === null ? "--" : `${Math.round(data.humidity)}%`} />
            <Metric label="Vânt" value={data.wind === null ? "--" : `${Math.round(data.wind)} km/h`} />
          </div>

          <div className="forecast-row">
            {data.forecast.map((day) => (
              <div className="forecast-card" key={day.label}>
                <span>{day.label}</span>
                <strong>{day.score.toFixed(1)}</strong>
              </div>
            ))}
          </div>

          <div className="bottom-card">
            <div>
              <strong>{weatherIcon(data.weatherCode)} {data.detail}</strong>
              <span>Actualizat {data.updatedAt}</span>
            </div>
            <div className="live-dots">
              <span className={data.livePollen ? "on" : ""}>Polen</span>
              <span className={data.liveWeather ? "on" : ""}>Meteo</span>
            </div>
          </div>

          <div className="notice">{notice}</div>
        </section>
      </main>
    </>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <>
      <style>{styles}</style>
      <main className="screen loading-screen">
        <section className="loading-card">
          <div className="loading-orb">✦</div>
          <h1>Pregătim scannerul</h1>
          <p>{text || "Sincronizăm datele pentru locația ta..."}</p>
          <div className="loading-bar"><span /></div>
        </section>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles = `
* { box-sizing: border-box; }
html, body, #root { width: 100%; min-height: 100%; margin: 0; }
body { margin: 0; overflow: hidden; background: #050816; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button { font: inherit; cursor: pointer; }
.screen { min-height: 100svh; width: 100vw; display: flex; align-items: center; justify-content: center; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); color: #f8fafc; background: radial-gradient(circle at 18% 12%, rgba(45, 212, 191, 0.18), transparent 30%), radial-gradient(circle at 85% 18%, rgba(168, 85, 247, 0.16), transparent 34%), linear-gradient(145deg, #050816 0%, #0f172a 48%, #111827 100%); overflow: hidden; }
.phone-card { position: relative; width: min(100%, 430px); height: min(100svh - 24px, 820px); max-height: 820px; padding: 18px; display: grid; grid-template-rows: auto 1fr auto auto auto auto; gap: 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 34px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.72)); box-shadow: 0 30px 90px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.12); backdrop-filter: blur(24px); }
.phone-card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(circle at 50% 27%, var(--glow), transparent 36%); opacity: 0.9; }
.topbar, .hero, .mini-grid, .forecast-row, .bottom-card, .notice { position: relative; z-index: 1; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(226,232,240,0.58); font-weight: 900; }
.city { margin-top: 3px; max-width: 285px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 950; }
.refresh { width: 44px; height: 44px; border: 0; border-radius: 18px; color: #f8fafc; background: rgba(255,255,255,0.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
.hero { display: grid; grid-template-columns: 206px 1fr; align-items: center; gap: 13px; min-height: 230px; }
.score-ring { position: relative; width: 206px; height: 206px; display: grid; place-items: center; }
.ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 24px var(--glow)); }
.ring-track { fill: rgba(255,255,255,0.04); stroke: rgba(255,255,255,0.09); stroke-width: 12; }
.ring-progress { fill: none; stroke: var(--accent); stroke-width: 12; stroke-linecap: round; transition: stroke-dasharray 0.7s ease; }
.score-content { width: 152px; height: 152px; border-radius: 999px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.045)); border: 1px solid rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
.score-label { font-size: 11px; color: rgba(226,232,240,0.62); font-weight: 950; text-transform: uppercase; letter-spacing: .12em; }
.score-number { margin-top: 2px; font-size: 58px; line-height: 0.92; font-weight: 1000; letter-spacing: -0.08em; }
.score-scale { margin-top: 3px; color: var(--accent); font-size: 15px; font-weight: 950; }
.hero-copy { text-align: left; min-width: 0; }
.status-pill { display: inline-flex; align-items: center; justify-content: center; padding: 7px 10px; border-radius: 999px; background: var(--soft); color: var(--accent); font-size: 12px; font-weight: 950; margin-bottom: 12px; }
.hero-copy h1 { margin: 0; font-size: clamp(26px, 8vw, 36px); line-height: 0.95; letter-spacing: -0.05em; }
.hero-copy p { margin: 10px 0 0; color: rgba(226,232,240,0.73); font-size: 14px; line-height: 1.25; font-weight: 700; }
.mini-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.metric, .forecast-card, .bottom-card { background: rgba(255,255,255,0.065); border: 1px solid rgba(255,255,255,0.09); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
.metric { border-radius: 20px; padding: 12px 8px; text-align: center; min-width: 0; }
.metric span { display: block; color: rgba(226,232,240,0.58); font-size: 11px; font-weight: 950; text-transform: uppercase; }
.metric strong { display: block; margin-top: 5px; font-size: 20px; font-weight: 1000; white-space: nowrap; }
.forecast-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.forecast-card { border-radius: 18px; padding: 10px 6px; text-align: center; }
.forecast-card span { display: block; color: rgba(226,232,240,0.58); font-size: 11px; font-weight: 950; }
.forecast-card strong { display: block; margin-top: 5px; font-size: 22px; font-weight: 1000; color: #fff; }
.bottom-card { border-radius: 22px; padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.bottom-card strong { display: block; font-size: 13px; }
.bottom-card span { display: block; margin-top: 3px; color: rgba(226,232,240,0.54); font-size: 12px; }
.live-dots { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
.live-dots span { position: relative; margin: 0; padding-left: 13px; font-size: 11px; font-weight: 950; color: rgba(226,232,240,0.45); }
.live-dots span::before { content: ""; position: absolute; left: 0; top: 5px; width: 7px; height: 7px; border-radius: 50%; background: rgba(148,163,184,0.55); }
.live-dots span.on { color: rgba(226,232,240,0.84); }
.live-dots span.on::before { background: #22c55e; box-shadow: 0 0 12px rgba(34,197,94,0.75); }
.notice { min-height: 17px; text-align: center; color: rgba(226,232,240,0.48); font-size: 12px; font-weight: 700; }
.loading-screen { padding: 22px; }
.loading-card { width: min(100%, 390px); min-height: 460px; border-radius: 36px; padding: 36px 28px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.7)); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 30px 90px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.12); }
.loading-orb { width: 92px; height: 92px; border-radius: 32px; display: grid; place-items: center; background: radial-gradient(circle at 30% 25%, #ffffff, #2dd4bf 38%, #0f766e 80%); color: #07111f; font-size: 34px; margin-bottom: 24px; box-shadow: 0 0 48px rgba(45,212,191,0.35); animation: float 1.8s ease-in-out infinite; }
.loading-card h1 { margin: 0; font-size: 32px; line-height: 1; letter-spacing: -0.05em; }
.loading-card p { margin: 14px 0 26px; color: rgba(226,232,240,0.66); line-height: 1.45; }
.loading-bar { width: 100%; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.08); }
.loading-bar span { display: block; height: 100%; width: 42%; border-radius: inherit; background: #2dd4bf; animation: loading 1.25s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes loading { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }
@media (max-width: 390px) { .phone-card { height: calc(100svh - 18px); padding: 14px; border-radius: 28px; gap: 9px; } .city { font-size: 16px; max-width: 230px; } .refresh { width: 40px; height: 40px; border-radius: 16px; } .hero { grid-template-columns: 178px 1fr; min-height: 194px; gap: 8px; } .score-ring { width: 178px; height: 178px; } .score-content { width: 132px; height: 132px; } .score-number { font-size: 50px; } .hero-copy h1 { font-size: 25px; } .hero-copy p { font-size: 12px; } .metric { padding: 10px 6px; border-radius: 17px; } .metric strong { font-size: 17px; } .forecast-card { padding: 8px 4px; border-radius: 15px; } .forecast-card strong { font-size: 19px; } .bottom-card { padding: 11px; border-radius: 18px; } .notice { font-size: 11px; } }
@media (max-height: 700px) { .phone-card { height: calc(100svh - 12px); padding: 12px; gap: 7px; border-radius: 24px; } .eyebrow { display: none; } .city { font-size: 15px; } .hero { grid-template-columns: 150px 1fr; min-height: 162px; } .score-ring { width: 150px; height: 150px; } .score-content { width: 112px; height: 112px; } .score-label { font-size: 9px; } .score-number { font-size: 42px; } .score-scale { font-size: 12px; } .hero-copy h1 { font-size: 22px; } .hero-copy p { margin-top: 6px; font-size: 11px; } .status-pill { margin-bottom: 7px; padding: 5px 8px; font-size: 10px; } .metric { padding: 8px 5px; } .metric span, .forecast-card span { font-size: 10px; } .metric strong { font-size: 16px; } .forecast-card { padding: 7px 4px; } .forecast-card strong { margin-top: 3px; font-size: 17px; } .bottom-card { padding: 9px 10px; } .bottom-card strong { font-size: 12px; } .bottom-card span, .live-dots span, .notice { font-size: 10px; } }
`;

registerServiceWorker();

export default App;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
