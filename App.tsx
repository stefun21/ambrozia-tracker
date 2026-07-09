import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "Bucuresti";
const CACHE_KEY = "ambrozie_tracker_v3_pwa_calibrated";
const CACHE_TIME_MS = 10 * 60 * 1000;

type DataSource = "Live" | "Estimare" | "Mixt";
type Trend = "up" | "down" | "stable";

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

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
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
  if (code === null) return "◌";
  if (code === 0) return "☀";
  if (code >= 1 && code <= 3) return "◐";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "☔";
  if (code >= 71 && code <= 77) return "❄";
  if (code >= 95) return "⚡";
  return "☁";
}

function getLevel(score: number) {
  if (score < 1) return "Foarte scazut";
  if (score < 3) return "Scazut";
  if (score < 5) return "Moderat";
  if (score < 7) return "Ridicat";
  return "Foarte ridicat";
}

function getSeasonFactor(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month <= 2) return 0.06;
  if (month === 3) return 0.1;
  if (month === 4) return 0.16;
  if (month === 5) return 0.24;
  if (month === 6) return 0.38;
  if (month === 7) return 0.62;
  if (month === 8) return 0.88;
  if (month === 9) return 0.92;
  if (month === 10) return day <= 15 ? 0.62 : 0.38;
  if (month === 11) return 0.18;
  return 0.08;
}

function getRegionFactor(lat: number, lon: number) {
  const romaniaArea = lat >= 43 && lat <= 49 && lon >= 20 && lon <= 30;
  const centralEastEurope = lat >= 42 && lat <= 52 && lon >= 14 && lon <= 32;
  const europe = lat >= 35 && lat <= 60 && lon >= -10 && lon <= 40;
  const northAmerica = lat >= 25 && lat <= 55 && lon >= -130 && lon <= -60;
  if (romaniaArea) return 1.08;
  if (centralEastEurope) return 0.98;
  if (europe) return 0.78;
  if (northAmerica) return 0.82;
  return 0.58;
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

  const tempFactor = clamp((temp - 8) / 22, 0.24, 1.12);
  const humidityFactor = humidity > 85 ? 0.52 : humidity > 70 ? 0.74 : humidity < 30 ? 0.86 : 1.0;
  const windFactor = wind < 3 ? 0.78 : wind <= 15 ? 1.03 : 0.82;
  const rainFactor = rain > 3 ? 0.28 : rain > 0.4 ? 0.55 : 1.0;
  const particlesFactor = clamp(0.82 + pm10 / 110 + pm25 / 180 + dust / 340, 0.82, 1.22);
  const raw = 12.5 * season * region * tempFactor * humidityFactor * windFactor * rainFactor * particlesFactor;

  const isRomania = params.lat >= 43 && params.lat <= 49 && params.lon >= 20 && params.lon <= 30;
  const month = (params.date ?? new Date()).getMonth() + 1;
  const seasonalFloor = isRomania && month >= 7 && month <= 10 ? 2.1 : 0.35;

  return clamp(Math.max(raw, seasonalFloor * season), 0, 8.2);
}

function scoreFromLiveRagweed(raw: number) {
  if (raw <= 0) return 0;
  return clamp(10 * (1 - Math.exp(-raw / 55)), 0, 10);
}

function computeFinalScore(rawRagweed: number, estimatedScore: number) {
  const liveScore = scoreFromLiveRagweed(rawRagweed);
  if (rawRagweed > 0 && liveScore > 0) {
    return {
      score: clamp(liveScore * 0.72 + estimatedScore * 0.28, 0, 10),
      source: "Mixt" as DataSource,
    };
  }
  return {
    score: clamp(estimatedScore * 0.78, 0, 7.8),
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
  if (index === 1) return "Maine";
  return new Date(dateString).toLocaleDateString("ro-RO", { weekday: "short" });
}

function buildData(lat: number, lon: number, weather: WeatherPayload | null, air: AirPayload | null): AppData {
  const airTimes: string[] = air?.hourly?.time ?? [];
  const airIndex = pickNearestIndex(airTimes);
  const weatherTimes: string[] = weather?.hourly?.time ?? [];
  const weatherIndex = pickNearestIndex(weatherTimes);

  const rawRagweed = safeNumber(air?.current?.ragweed_pollen, safeNumber(air?.hourly?.ragweed_pollen?.[airIndex], 0));
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
  const trend: Trend = nextScore > score + 0.25 ? "up" : nextScore < score - 0.25 ? "down" : "stable";

  const level = getLevel(score);
  const message = score >= 7 ? "Tine geamurile inchise" : score >= 5 ? "Ai grija la expunere" : score >= 3 ? "Nivel moderat azi" : "Aer prietenos azi";
  const detail = source === "Mixt" ? "Date live calibrate + model meteo" : "Estimare meteo/sezon calibrata";

  const dailyTimes: string[] = weather?.daily?.time ?? [];
  const forecast: ForecastDay[] = Array.from({ length: 4 }).map((_, index) => {
    const dailyTemp = optionalNumber(weather?.daily?.temperature_2m_max?.[index]) ?? tempNow;
    const dailyRain = optionalNumber(weather?.daily?.precipitation_sum?.[index]) ?? rain;
    const forecastDate = dailyTimes[index] ? new Date(dailyTimes[index]) : new Date(Date.now() + index * 86400000);
    const dayEstimate = estimateRagweedScore({ lat, lon, temp: dailyTemp, humidity, wind, rain: dailyRain, pm10, pm25, dust, date: forecastDate });
    const dayRaw = safeNumber(air?.hourly?.ragweed_pollen?.[airIndex + index * 24], 0);
    const dayFinal = computeFinalScore(dayRaw, dayEstimate);
    return { label: getDailyLabel(dailyTimes[index], index), score: dayFinal.score, source: dayFinal.source };
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

function registerServiceWorker(onUpdate: () => void) {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate();
        });
      });
    }).catch(() => undefined);
  });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("Locatia ta");
  const [displayScore, setDisplayScore] = useState(0);
  const [notice, setNotice] = useState("Pornim scannerul...");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  const theme = useMemo(() => {
    const score = data?.score ?? 0;
    if (score < 3) return { color: "#2dd4bf", glow: "rgba(45, 212, 191, 0.35)", soft: "rgba(45, 212, 191, 0.16)" };
    if (score < 7) return { color: "#fbbf24", glow: "rgba(251, 191, 36, 0.35)", soft: "rgba(251, 191, 36, 0.16)" };
    return { color: "#fb7185", glow: "rgba(251, 113, 133, 0.38)", soft: "rgba(251, 113, 133, 0.17)" };
  }, [data?.score]);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      if (!isStandalone()) setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
  }, [data?.score]);

  async function getCity(lat: number, lon: number) {
    try {
      const json = await fetchJsonWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`, 5000);
      return json.city || json.locality || json.principalSubdivision || "Locatia ta";
    } catch {
      return "Locatia ta";
    }
  }

  async function load(lat: number, lon: number, fallbackCity = DEFAULT_CITY, force = false) {
    try {
      setIsRefreshing(true);
      setNotice(data ? "Actualizam datele..." : "Detectam locatia si nivelul de ambrozie...");
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

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&forecast_days=4&timezone=auto`;

      const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=ragweed_pollen` +
        `&hourly=ragweed_pollen,pm10,pm2_5,dust` +
        `&forecast_days=4&timezone=auto`;

      const [weatherResult, airResult] = await Promise.allSettled([fetchJsonWithTimeout(weatherUrl), fetchJsonWithTimeout(airUrl)]);
      const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
      const air = airResult.status === "fulfilled" ? airResult.value : null;
      if (!weather && !air) throw new Error("API unavailable");

      const computed = buildData(lat, lon, weather, air);
      setData(computed);
      setNotice(computed.source === "Estimare" ? "Estimare activa cand datele live lipsesc" : "Date sincronizate");
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), lat: roundedLat, lon: roundedLon, city: cityName || fallbackCity, data: computed }));
    } catch (error) {
      console.error(error);
      setNotice("Conexiune instabila. Afisam o estimare sigura.");
      setCity(fallbackCity);
      setData(buildData(DEFAULT_LAT, DEFAULT_LON, null, null));
    } finally {
      setIsRefreshing(false);
    }
  }

  function startLocationFlow(force = false) {
    if (!navigator.geolocation) {
      setNotice("Browserul nu suporta geolocatia. Folosim Bucuresti.");
      load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY, force);
      return;
    }
    setNotice("Cerem acces la locatie...");
    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude, DEFAULT_CITY, force),
      () => {
        setNotice("Locatia nu este disponibila. Folosim Bucuresti.");
        load(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY, force);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
    );
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
    setShowInstall(false);
  }

  useEffect(() => {
    startLocationFlow(false);
  }, []);

  if (!data) return <LoadingScreen text={notice} />;

  const progress = clamp(data.score / 10, 0, 1);
  const circumference = 2 * Math.PI * 87;
  const dash = circumference * progress;
  const trendSymbol = data.trend === "up" ? "↗" : data.trend === "down" ? "↘" : "→";

  return (
    <main className="app-shell">
      <style>{styles}</style>
      <section className="phone-card" style={{ ["--accent" as string]: theme.color, ["--glow" as string]: theme.glow, ["--soft" as string]: theme.soft }}>
        <div className="aurora aurora-one" />
        <div className="aurora aurora-two" />

        <header className="topbar">
          <div>
            <p className="eyebrow">Ambrozie Tracker</p>
            <h1>{city}</h1>
          </div>
          <button className="refresh" onClick={() => startLocationFlow(true)} aria-label="Actualizeaza datele">
            {isRefreshing ? "⟳" : "↻"}
          </button>
        </header>

        <section className="hero-card">
          <div className="ring-wrap" aria-label={`Indice ambrozie ${displayScore.toFixed(1)} din 10`}>
            <svg viewBox="0 0 220 220" className="score-ring" role="img">
              <circle cx="110" cy="110" r="87" className="ring-bg" />
              <circle cx="110" cy="110" r="87" className="ring-fg" strokeDasharray={`${dash} ${circumference - dash}`} />
            </svg>
            <div className="score-center">
              <span>Indice</span>
              <strong>{displayScore.toFixed(1)}</strong>
              <small>/10</small>
            </div>
          </div>

          <div className="hero-copy">
            <div className="source-pill">{data.source} · {trendSymbol}</div>
            <h2>{data.level}</h2>
            <p>{data.message}</p>
          </div>
        </section>

        <section className="forecast-grid">
          {data.forecast.map((day) => (
            <div className="day-card" key={day.label}>
              <span>{day.label}</span>
              <strong>{day.score.toFixed(1)}</strong>
            </div>
          ))}
        </section>

        <section className="metrics-grid">
          <Metric label="Meteo" value={`${weatherIcon(data.weatherCode)} ${data.tempNow === null ? "--" : Math.round(data.tempNow)}°C`} />
          <Metric label="Vant" value={data.wind === null ? "--" : `${Math.round(data.wind)} km/h`} />
          <Metric label="Umiditate" value={data.humidity === null ? "--" : `${Math.round(data.humidity)}%`} />
          <Metric label="PM10" value={data.pm10 === null ? "--" : `${Math.round(data.pm10)}`} />
        </section>

        <footer className="status-card">
          <div>
            <span>Polen · Meteo</span>
            <p>{notice}</p>
          </div>
          <small>{data.detail}<br />Actualizat {data.updatedAt}</small>
        </footer>

        {showInstall && installPrompt && (
          <button className="install-banner" onClick={installApp}>
            <span>Instaleaza aplicatia</span>
            <small>Se deschide fara bara de URL</small>
          </button>
        )}

        {updateReady && (
          <button className="update-banner" onClick={() => window.location.reload()}>
            Versiune noua disponibila · Actualizeaza
          </button>
        )}
      </section>
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="app-shell">
      <style>{styles}</style>
      <section className="phone-card loading-card">
        <div className="loader-mark">✦</div>
        <h1>Pregatim scannerul</h1>
        <p>{text || "Sincronizam datele pentru locatia ta..."}</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles = `
  :root {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #f8fafc;
    background: #050816;
    color-scheme: dark;
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body, #root { min-height: 100%; margin: 0; }
  body { overflow-x: hidden; background: radial-gradient(circle at top, #11251d 0%, #050816 42%, #020617 100%); }
  button { font: inherit; }

  .app-shell {
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
  }

  .phone-card {
    width: min(100%, 430px);
    min-height: min(920px, calc(100svh - 28px));
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 34px;
    padding: 24px 18px;
    background: linear-gradient(160deg, rgba(9, 21, 22, 0.96), rgba(3, 7, 18, 0.98));
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .aurora {
    position: absolute;
    border-radius: 999px;
    filter: blur(18px);
    opacity: 0.56;
    pointer-events: none;
  }
  .aurora-one { width: 210px; height: 210px; top: -66px; right: -78px; background: rgba(34, 197, 94, 0.22); }
  .aurora-two { width: 230px; height: 230px; bottom: 110px; left: -110px; background: var(--soft); }

  .topbar, .hero-card, .forecast-grid, .metrics-grid, .status-card, .install-banner, .update-banner { position: relative; z-index: 2; }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 18px;
  }
  .eyebrow { margin: 0 0 5px; color: rgba(226, 232, 240, 0.58); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 28px; line-height: 1.05; letter-spacing: -0.04em; }
  .refresh {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    color: #fff;
    background: rgba(255, 255, 255, 0.07);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  }

  .hero-card {
    padding: 20px 12px 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 30px;
    background: radial-gradient(circle at 50% 34%, var(--soft), transparent 56%), rgba(255, 255, 255, 0.055);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 20px 70px rgba(0,0,0,0.22);
  }

  .ring-wrap { width: 246px; height: 246px; margin: 0 auto; position: relative; display: grid; place-items: center; }
  .score-ring { width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }
  .ring-bg, .ring-fg { fill: none; stroke-width: 15; stroke-linecap: round; }
  .ring-bg { stroke: rgba(255, 255, 255, 0.075); }
  .ring-fg { stroke: var(--accent); filter: drop-shadow(0 0 18px var(--glow)); transition: stroke-dasharray 650ms cubic-bezier(.2,.8,.2,1); }
  .score-center { position: absolute; text-align: center; display: grid; place-items: center; }
  .score-center span { color: rgba(226, 232, 240, 0.58); font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
  .score-center strong { font-size: 72px; line-height: 0.95; letter-spacing: -0.08em; text-shadow: 0 0 34px var(--glow); }
  .score-center small { color: rgba(226, 232, 240, 0.6); font-size: 15px; }

  .hero-copy { text-align: center; margin-top: -5px; }
  .source-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 7px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.84);
    background: rgba(255, 255, 255, 0.07);
    font-size: 13px;
  }
  h2 { margin: 14px 0 6px; font-size: 30px; letter-spacing: -0.04em; }
  .hero-copy p { margin: 0; color: rgba(226, 232, 240, 0.72); font-size: 15px; }

  .forecast-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin: 14px 0; }
  .day-card, .metric-card, .status-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .day-card { border-radius: 20px; padding: 12px 8px; text-align: center; }
  .day-card span, .metric-card span, .status-card span { display: block; color: rgba(226, 232, 240, 0.58); font-size: 12px; }
  .day-card strong { display: block; margin-top: 5px; font-size: 20px; }

  .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
  .metric-card { min-height: 78px; border-radius: 22px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; }
  .metric-card strong { font-size: 22px; letter-spacing: -0.03em; }

  .status-card { border-radius: 24px; padding: 15px; display: flex; justify-content: space-between; gap: 14px; align-items: flex-end; }
  .status-card p { margin: 4px 0 0; color: rgba(248, 250, 252, 0.9); font-size: 14px; }
  .status-card small { color: rgba(226, 232, 240, 0.54); text-align: right; line-height: 1.45; }

  .install-banner, .update-banner {
    width: 100%;
    margin-top: 12px;
    border: 0;
    border-radius: 22px;
    padding: 14px 16px;
    color: #04111a;
    background: linear-gradient(135deg, #a3e635, #22c55e);
    box-shadow: 0 18px 50px rgba(34, 197, 94, 0.23);
    text-align: left;
    font-weight: 800;
  }
  .install-banner small { display: block; margin-top: 2px; font-weight: 600; opacity: 0.72; }
  .update-banner { text-align: center; }

  .loading-card { display: grid; place-items: center; align-content: center; text-align: center; gap: 10px; }
  .loader-mark { width: 82px; height: 82px; border-radius: 28px; display: grid; place-items: center; background: rgba(163, 230, 53, 0.12); color: #bef264; font-size: 36px; box-shadow: 0 0 50px rgba(163, 230, 53, 0.22); animation: pulse 1.4s infinite ease-in-out; }
  .loading-card p { margin: 0; color: rgba(226, 232, 240, 0.7); }

  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: .82; } 50% { transform: scale(1.06); opacity: 1; } }

  @media (max-width: 380px) {
    .phone-card { border-radius: 28px; padding: 20px 14px; }
    .ring-wrap { width: 222px; height: 222px; }
    .score-center strong { font-size: 64px; }
    h1 { font-size: 25px; }
    h2 { font-size: 27px; }
  }
`;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
