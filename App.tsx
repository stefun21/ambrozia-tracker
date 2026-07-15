import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CloudRain,
  Droplets,
  Gauge,
  Leaf,
  LocateFixed,
  LucideIcon,
  MapPin,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wind,
} from "lucide-react";

const DEFAULT_LAT = 44.4268;
const DEFAULT_LON = 26.1025;
const DEFAULT_CITY = "București";
const CACHE_KEY = "ambrozie_tracker_v6_reference_calibration";
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

type WeatherPayload = any;
type AirPayload = any;

type RiskMeta = {
  tone: "low" | "medium" | "high";
  accent: string;
  accentStrong: string;
  soft: string;
  glow: string;
  title: string;
  subtitle: string;
  action: string;
  badgeIcon: LucideIcon;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function alignScoreToReference(score: number) {
  const base = clamp(score, 0, 10);
  if (base <= 0.25) return base;

  // Calibrare nouă: ridică zona 4-6 spre valorile afișate de aplicația de referință,
  // fără să transforme artificial nivelurile foarte mici în alerte mari.
  // Exemplu practic: 4.8 devine aproximativ 7.0.
  const midRangeLift = smoothstep(2.2, 5.8, base);
  const remainingHeadroom = Math.pow((10 - base) / 10, 1.05);
  const calibrated = base + 5.4 * midRangeLift * remainingHeadroom;

  return clamp(calibrated, 0, 9.7);
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

function getWeatherLabel(code: number | null) {
  if (code === null) return "meteo indisponibil";
  if (code === 0) return "senin";
  if (code >= 1 && code <= 3) return "parțial noros";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "ploi";
  if (code >= 71 && code <= 77) return "ninsoare";
  if (code >= 95) return "furtună";
  return "noros";
}

function getLevel(score: number) {
  if (score < 1) return "Foarte scăzut";
  if (score < 3) return "Scăzut";
  if (score < 5) return "Moderat";
  if (score < 7) return "Ridicat";
  return "Foarte ridicat";
}

function getRiskMeta(score: number): RiskMeta {
  if (score < 3) {
    return {
      tone: "low",
      accent: "#34d399",
      accentStrong: "#a7f3d0",
      soft: "rgba(52, 211, 153, 0.16)",
      glow: "rgba(52, 211, 153, 0.34)",
      title: "Nivel prietenos azi",
      subtitle: "Expunerea la ambrozie pare redusă în zona ta.",
      action: "Poți ieși normal. Verifică din nou dacă se schimbă vântul sau vremea.",
      badgeIcon: CheckCircle2,
    };
  }

  if (score < 7) {
    return {
      tone: "medium",
      accent: "#fbbf24",
      accentStrong: "#fde68a",
      soft: "rgba(251, 191, 36, 0.17)",
      glow: "rgba(251, 191, 36, 0.34)",
      title: "Atenție la expunere",
      subtitle: "Nivelul poate deranja persoanele sensibile.",
      action: "Evită aerisirea lungă și monitorizează simptomele dacă ești alergic.",
      badgeIcon: AlertTriangle,
    };
  }

  return {
    tone: "high",
    accent: "#fb7185",
    accentStrong: "#fecdd3",
    soft: "rgba(251, 113, 133, 0.18)",
    glow: "rgba(251, 113, 133, 0.38)",
    title: "Expunere ridicată",
    subtitle: "Ambrozia este la un nivel care merită tratat cu prudență.",
    action: "Ține geamurile închise, evită plimbările lungi și schimbă hainele după ieșit.",
    badgeIcon: ShieldAlert,
  };
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
    const blendedScore = clamp(liveScore * 0.7 + estimatedScore * 0.3, 0, 10);
    return {
      score: alignScoreToReference(blendedScore),
      source: "Mixt" as DataSource,
    };
  }

  const estimatedOnlyScore = clamp(estimatedScore * 0.82, 0, 8.4);
  return {
    score: alignScoreToReference(estimatedOnlyScore),
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
  const message = score >= 7 ? "Protecție recomandată" : score >= 5 ? "Expunere de urmărit" : score >= 3 ? "Nivel moderat azi" : "Aer mai prietenos";
  const detail = source === "Mixt" ? "Date live + calibrare referință" : "Estimare calibrată pe referință";

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
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => undefined);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate();
          });
        });
      })
      .catch(() => undefined);
  });
}

function formatRound(value: number | null, unit = "") {
  return value === null ? "--" : `${Math.round(value)}${unit}`;
}

function formatRain(value: number | null) {
  if (value === null) return "--";
  if (value < 0.1) return "0 mm";
  return `${value.toFixed(1)} mm`;
}

function formatRawPollen(value: number) {
  if (value <= 0) return "--";
  if (value < 1) return value.toFixed(1);
  return Math.round(value).toString();
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [city, setCity] = useState("Locația ta");
  const [displayScore, setDisplayScore] = useState(0);
  const [notice, setNotice] = useState("Pornim scannerul...");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  const risk = useMemo(() => getRiskMeta(data?.score ?? 0), [data?.score]);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    if (!data) return;
    let frame = 0;
    let start = 0;
    const from = displayScore;
    const to = data.score;
    const animate = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / 820, 1);
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
      setNotice(computed.source === "Estimare" ? "Estimare activă când datele live lipsesc" : "Date sincronizate");
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), lat: roundedLat, lon: roundedLon, city: cityName || fallbackCity, data: computed }));
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
  }, []);

  if (!data) return <LoadingScreen text={notice} />;

  const themeVars = {
    "--accent": risk.accent,
    "--accent-strong": risk.accentStrong,
    "--accent-soft": risk.soft,
    "--accent-glow": risk.glow,
  } as React.CSSProperties;

  const trendMeta = getTrendMeta(data.trend);
  const TrendIcon = trendMeta.icon;
  const RiskIcon = risk.badgeIcon;

  const topMetrics = [
    {
      icon: Thermometer,
      label: "Temperatură",
      value: formatRound(data.tempNow, "°C"),
      detail: data.tempMin === null || data.tempMax === null ? getWeatherLabel(data.weatherCode) : `${Math.round(data.tempMin)}° / ${Math.round(data.tempMax)}°`,
    },
    {
      icon: Droplets,
      label: "Umiditate",
      value: formatRound(data.humidity, "%"),
      detail: data.humidity !== null && data.humidity > 70 ? "poate reduce polenul" : "condiții normale",
    },
    {
      icon: Wind,
      label: "Vânt",
      value: formatRound(data.wind, " km/h"),
      detail: data.wind !== null && data.wind > 15 ? "dispersie mai mare" : "dispersie moderată",
    },
    {
      icon: CloudRain,
      label: "Ploaie",
      value: formatRain(data.rain),
      detail: data.rain !== null && data.rain > 0.4 ? "curăță aerul" : "fără efect major",
    },
  ];

  return (
    <main className="app-shell">
      <style>{styles}</style>
      <section className="app-card" style={themeVars}>
        <div className="background-grid" />
        <div className="glow glow-top" />
        <div className="glow glow-bottom" />
        <PollenField />

        <header className="app-header reveal reveal-delay-1">
          <div className="brand-lockup">
            <div className="brand-icon"><Leaf size={19} /></div>
            <div>
              <span>Ambrozie Tracker</span>
              <small>monitorizare locală</small>
            </div>
          </div>
          <button className="icon-button" onClick={() => startLocationFlow(true)} disabled={isRefreshing} aria-label="Actualizează datele">
            <RefreshCw size={20} className={isRefreshing ? "spin" : ""} />
          </button>
        </header>

        <section className="hero-panel reveal reveal-delay-2" aria-label="Nivelul actual de ambrozie">
          <div className="hero-topline">
            <div className="location-chip">
              <MapPin size={15} />
              <span>{city}</span>
            </div>
            <div className="updated-chip">
              <Clock3 size={14} />
              <span>{data.updatedAt}</span>
            </div>
          </div>

          <div className="score-stage">
            <ScoreDial score={displayScore} />
            <div className="score-copy">
              <div className={`risk-badge risk-${risk.tone}`}>
                <RiskIcon size={16} />
                <span>{data.level}</span>
              </div>
              <h1>{risk.title}</h1>
              <p>{risk.subtitle}</p>
            </div>
          </div>

          <div className="risk-scale" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, index) => (
              <span key={index} className={index < Math.ceil(data.score) ? "active" : ""} />
            ))}
          </div>

          <div className="advice-card">
            <div className="advice-icon"><ShieldAlert size={18} /></div>
            <div>
              <span>Recomandare rapidă</span>
              <p>{risk.action}</p>
            </div>
          </div>
        </section>

        <section className="quick-row reveal reveal-delay-3" aria-label="Date meteo rapide">
          <div className="weather-now">
            <span className="weather-symbol">{weatherIcon(data.weatherCode)}</span>
            <div>
              <strong>{formatRound(data.tempNow, "°C")}</strong>
              <small>{getWeatherLabel(data.weatherCode)}</small>
            </div>
          </div>
          <div className="trend-pill">
            <TrendIcon size={16} />
            <div>
              <span>{trendMeta.label}</span>
              <small>{data.source}</small>
            </div>
          </div>
        </section>

        <section className="forecast-panel reveal reveal-delay-4">
          <SectionTitle title="Prognoză ambrozie" note="scor /10" />
          <div className="forecast-list">
            {data.forecast.map((day) => (
              <ForecastCard key={day.label} day={day} />
            ))}
          </div>
        </section>

        <section className="metrics-panel reveal reveal-delay-5">
          <SectionTitle title="Context meteo" note="acum" />
          <div className="metrics-grid">
            {topMetrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </section>

        <section className="data-panel reveal reveal-delay-6">
          <div className="data-row">
            <DataStatus icon={Activity} label="Polen live" value={data.livePollen ? "activ" : "estimare"} active={data.livePollen} />
            <DataStatus icon={LocateFixed} label="Meteo" value={data.liveWeather ? "sincronizat" : "fallback"} active={data.liveWeather} />
          </div>
          <div className="insight-row">
            <div>
              <span>Model</span>
              <strong>{data.detail}</strong>
            </div>
            <div>
              <span>Ragweed brut</span>
              <strong>{formatRawPollen(data.rawRagweed)}</strong>
            </div>
            <div>
              <span>PM10</span>
              <strong>{data.pm10 === null ? "--" : Math.round(data.pm10)}</strong>
            </div>
          </div>
        </section>

        <footer className="app-footer reveal reveal-delay-7">
          <Sparkles size={16} />
          <span>{notice}</span>
        </footer>

        {updateReady && (
          <button className="update-banner" onClick={() => window.location.reload()}>
            Versiune nouă disponibilă · Actualizează
          </button>
        )}
      </section>
    </main>
  );
}

function getTrendMeta(trend: Trend): { icon: LucideIcon; label: string } {
  if (trend === "up") return { icon: TrendingUp, label: "în creștere" };
  if (trend === "down") return { icon: TrendingDown, label: "în scădere" };
  return { icon: Minus, label: "stabil" };
}

function ScoreDial({ score }: { score: number }) {
  const progress = clamp(score / 10, 0, 1);
  const circumference = 2 * Math.PI * 92;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="score-dial" aria-label={`Indice ambrozie ${score.toFixed(1)} din 10`}>
      <svg viewBox="0 0 240 240" className="dial-svg" role="img">
        <defs>
          <linearGradient id="scoreGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-strong)" />
            <stop offset="48%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="92" className="dial-track" />
        <circle
          cx="120"
          cy="120"
          r="92"
          className="dial-progress"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="dial-glass" />
      <div className="score-value">
        <span>Nivel ambrozie</span>
        <strong>{score.toFixed(1)}</strong>
        <small>din 10</small>
      </div>
    </div>
  );
}

function ForecastCard({ day }: { day: ForecastDay }) {
  const width = `${clamp(day.score * 10, 0, 100)}%`;
  return (
    <article className="forecast-card">
      <div>
        <span>{day.label}</span>
        <small>{day.source}</small>
      </div>
      <strong>{day.score.toFixed(1)}</strong>
      <div className="mini-bar"><i style={{ width }} /></div>
    </article>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon"><Icon size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function DataStatus({ icon: Icon, label, value, active }: { icon: LucideIcon; label: string; value: string; active: boolean }) {
  return (
    <div className={`data-status ${active ? "is-active" : ""}`}>
      <Icon size={16} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <span>{note}</span>
    </div>
  );
}

function PollenField() {
  return (
    <div className="pollen-field" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, index) => <span key={index} />)}
    </div>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="app-shell">
      <style>{styles}</style>
      <section className="app-card loading-card">
        <div className="background-grid" />
        <div className="loading-orb"><Leaf size={34} /></div>
        <h1>Pregătim scannerul</h1>
        <p>{text || "Sincronizăm datele pentru locația ta..."}</p>
      </section>
    </main>
  );
}

const styles = `
  :root {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #f8fafc;
    background: #020617;
    color-scheme: dark;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body, #root { min-height: 100%; margin: 0; }
  body {
    overflow-x: hidden;
    background:
      radial-gradient(circle at 50% -10%, rgba(49, 196, 141, 0.22), transparent 34%),
      radial-gradient(circle at 10% 18%, rgba(132, 204, 22, 0.11), transparent 28%),
      linear-gradient(180deg, #07130f 0%, #020617 52%, #020617 100%);
  }
  button { font: inherit; }

  .app-shell {
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom));
  }

  .app-card {
    width: min(100%, 440px);
    min-height: min(930px, calc(100svh - 24px));
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 38px;
    padding: 18px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.025)),
      linear-gradient(155deg, rgba(9, 25, 22, 0.98) 0%, rgba(3, 7, 18, 0.99) 58%, rgba(2, 6, 23, 1) 100%);
    box-shadow:
      0 36px 110px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      inset 0 -1px 0 rgba(255, 255, 255, 0.035);
    isolation: isolate;
  }

  .background-grid {
    position: absolute;
    inset: 0;
    z-index: -4;
    background-image:
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: radial-gradient(circle at top, black 0%, transparent 72%);
    opacity: .45;
  }

  .glow {
    position: absolute;
    z-index: -3;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(28px);
  }
  .glow-top {
    width: 240px;
    height: 240px;
    top: -92px;
    right: -86px;
    background: var(--accent-soft, rgba(52, 211, 153, .18));
    animation: breathe 6s ease-in-out infinite;
  }
  .glow-bottom {
    width: 300px;
    height: 300px;
    left: -126px;
    bottom: 170px;
    background: rgba(16, 185, 129, .11);
    animation: breathe 7.5s ease-in-out infinite reverse;
  }

  .pollen-field {
    position: absolute;
    inset: 0;
    z-index: -2;
    pointer-events: none;
    overflow: hidden;
  }
  .pollen-field span {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--accent-strong, #a7f3d0);
    box-shadow: 0 0 14px var(--accent-glow, rgba(52,211,153,.3));
    opacity: .48;
    animation: floatPollen 8s ease-in-out infinite;
  }
  .pollen-field span:nth-child(1) { top: 15%; left: 17%; animation-delay: -.4s; transform: scale(.75); }
  .pollen-field span:nth-child(2) { top: 24%; left: 83%; animation-delay: -1.2s; transform: scale(.45); }
  .pollen-field span:nth-child(3) { top: 39%; left: 8%; animation-delay: -2.1s; transform: scale(.62); }
  .pollen-field span:nth-child(4) { top: 52%; left: 88%; animation-delay: -3.3s; transform: scale(.52); }
  .pollen-field span:nth-child(5) { top: 64%; left: 15%; animation-delay: -4.2s; transform: scale(.38); }
  .pollen-field span:nth-child(6) { top: 75%; left: 76%; animation-delay: -5.1s; transform: scale(.7); }
  .pollen-field span:nth-child(7) { top: 18%; left: 56%; animation-delay: -3.8s; transform: scale(.42); }
  .pollen-field span:nth-child(8) { top: 45%; left: 58%; animation-delay: -1.8s; transform: scale(.5); }
  .pollen-field span:nth-child(9) { top: 84%; left: 38%; animation-delay: -.9s; transform: scale(.36); }
  .pollen-field span:nth-child(10) { top: 9%; left: 70%; animation-delay: -6.3s; transform: scale(.5); }
  .pollen-field span:nth-child(11) { top: 31%; left: 36%; animation-delay: -7.4s; transform: scale(.45); }
  .pollen-field span:nth-child(12) { top: 58%; left: 48%; animation-delay: -4.7s; transform: scale(.4); }

  .app-header,
  .hero-panel,
  .quick-row,
  .forecast-panel,
  .metrics-panel,
  .data-panel,
  .app-footer,
  .update-banner {
    position: relative;
    z-index: 2;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .brand-icon {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: var(--accent-strong, #a7f3d0);
    background: linear-gradient(145deg, rgba(255,255,255,.11), rgba(255,255,255,.035));
    border: 1px solid rgba(255,255,255,.11);
    box-shadow: 0 16px 36px rgba(0,0,0,.22), 0 0 24px var(--accent-glow, rgba(52,211,153,.2));
  }
  .brand-lockup span {
    display: block;
    color: rgba(248, 250, 252, .96);
    font-weight: 800;
    letter-spacing: -.02em;
  }
  .brand-lockup small {
    display: block;
    margin-top: 2px;
    color: rgba(226, 232, 240, .54);
    font-size: 12px;
  }

  .icon-button {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 17px;
    color: rgba(255,255,255,.92);
    background: rgba(255,255,255,.07);
    box-shadow: 0 16px 34px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.08);
    cursor: pointer;
    transition: transform .18s ease, border-color .18s ease, background .18s ease;
  }
  .icon-button:active { transform: scale(.95); }
  .icon-button:hover { border-color: rgba(255,255,255,.2); background: rgba(255,255,255,.1); }
  .icon-button:disabled { opacity: .76; cursor: wait; }
  .spin { animation: spin 1s linear infinite; }

  .hero-panel {
    padding: 14px 14px 16px;
    border-radius: 32px;
    border: 1px solid rgba(255,255,255,.12);
    background:
      radial-gradient(circle at 50% 30%, var(--accent-soft, rgba(52,211,153,.16)), transparent 56%),
      linear-gradient(180deg, rgba(255,255,255,.095), rgba(255,255,255,.04));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.12),
      0 24px 72px rgba(0,0,0,.26),
      0 0 80px rgba(0,0,0,.14);
  }

  .hero-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .location-chip,
  .updated-chip,
  .trend-pill,
  .risk-badge {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(2,6,23,.34);
    backdrop-filter: blur(14px);
  }
  .location-chip {
    max-width: 68%;
    gap: 7px;
    min-height: 34px;
    padding: 7px 10px;
    border-radius: 999px;
    color: rgba(248,250,252,.9);
    font-size: 13px;
    font-weight: 700;
  }
  .location-chip span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .updated-chip {
    gap: 6px;
    min-height: 34px;
    padding: 7px 10px;
    border-radius: 999px;
    color: rgba(226,232,240,.66);
    font-size: 12px;
  }

  .score-stage {
    display: grid;
    place-items: center;
    gap: 4px;
    padding-top: 2px;
  }

  .score-dial {
    width: 272px;
    height: 272px;
    position: relative;
    display: grid;
    place-items: center;
    margin: 2px auto -2px;
  }
  .dial-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    overflow: visible;
    filter: drop-shadow(0 18px 34px rgba(0,0,0,.24));
  }
  .dial-track,
  .dial-progress {
    fill: none;
    stroke-width: 17;
    stroke-linecap: round;
  }
  .dial-track { stroke: rgba(255,255,255,.08); }
  .dial-progress {
    stroke: url(#scoreGradient);
    filter: drop-shadow(0 0 18px var(--accent-glow, rgba(52,211,153,.34)));
    transition: stroke-dashoffset 820ms cubic-bezier(.2,.85,.2,1);
  }
  .dial-glass {
    position: absolute;
    width: 192px;
    height: 192px;
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 26%, rgba(255,255,255,.12), transparent 44%),
      linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.018));
    border: 1px solid rgba(255,255,255,.07);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.08), inset 0 -18px 50px rgba(0,0,0,.2);
    animation: glassPulse 4.6s ease-in-out infinite;
  }
  .score-value {
    position: absolute;
    text-align: center;
    display: grid;
    place-items: center;
    transform: translateY(2px);
  }
  .score-value span {
    color: rgba(226,232,240,.62);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .score-value strong {
    margin-top: 6px;
    color: #fff;
    font-size: 86px;
    line-height: .86;
    letter-spacing: -.09em;
    text-shadow: 0 0 36px var(--accent-glow, rgba(52,211,153,.34));
  }
  .score-value small {
    margin-top: 10px;
    color: rgba(226,232,240,.58);
    font-size: 14px;
    font-weight: 700;
  }

  .score-copy {
    width: 100%;
    text-align: center;
    margin-top: -4px;
  }
  .risk-badge {
    gap: 7px;
    min-height: 34px;
    padding: 7px 12px;
    border-radius: 999px;
    color: var(--accent-strong, #a7f3d0);
    font-weight: 850;
    font-size: 13px;
    box-shadow: 0 0 34px var(--accent-glow, rgba(52,211,153,.22));
  }
  .score-copy h1 {
    margin: 13px 0 5px;
    color: #fff;
    font-size: clamp(28px, 7vw, 36px);
    line-height: .98;
    letter-spacing: -.055em;
  }
  .score-copy p {
    max-width: 310px;
    margin: 0 auto;
    color: rgba(226,232,240,.7);
    font-size: 14px;
    line-height: 1.45;
  }

  .risk-scale {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 5px;
    margin: 15px 4px 12px;
  }
  .risk-scale span {
    height: 7px;
    border-radius: 999px;
    background: rgba(255,255,255,.09);
    overflow: hidden;
  }
  .risk-scale span.active {
    background: linear-gradient(90deg, var(--accent-strong, #a7f3d0), var(--accent, #34d399));
    box-shadow: 0 0 16px var(--accent-glow, rgba(52,211,153,.25));
    animation: scalePop .5s ease both;
  }

  .advice-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 11px;
    align-items: center;
    padding: 12px;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(2,6,23,.3);
  }
  .advice-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: var(--accent-strong, #a7f3d0);
    background: var(--accent-soft, rgba(52,211,153,.16));
  }
  .advice-card span,
  .metric-card span,
  .data-status span,
  .insight-row span,
  .section-title span {
    display: block;
    color: rgba(226,232,240,.55);
    font-size: 12px;
    font-weight: 750;
    letter-spacing: .02em;
  }
  .advice-card p {
    margin: 3px 0 0;
    color: rgba(248,250,252,.9);
    font-size: 13px;
    line-height: 1.36;
  }

  .quick-row {
    display: grid;
    grid-template-columns: 1.25fr .95fr;
    gap: 10px;
    margin: 12px 0;
  }
  .weather-now,
  .trend-pill {
    min-height: 72px;
    border-radius: 24px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.058);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
  }
  .weather-now {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  .weather-symbol {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: rgba(255,255,255,.075);
    font-size: 24px;
  }
  .weather-now strong {
    display: block;
    color: #fff;
    font-size: 30px;
    line-height: 1;
    letter-spacing: -.05em;
  }
  .weather-now small,
  .trend-pill small,
  .forecast-card small,
  .metric-card small {
    display: block;
    margin-top: 3px;
    color: rgba(226,232,240,.55);
    font-size: 12px;
  }
  .trend-pill {
    gap: 9px;
    justify-content: center;
    padding: 12px;
    color: var(--accent-strong, #a7f3d0);
  }
  .trend-pill span {
    display: block;
    color: rgba(248,250,252,.93);
    font-weight: 800;
    font-size: 13px;
  }

  .forecast-panel,
  .metrics-panel,
  .data-panel {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 28px;
    background: rgba(255,255,255,.045);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
  }
  .forecast-panel,
  .metrics-panel { padding: 14px; }
  .metrics-panel { margin-top: 12px; }
  .data-panel { margin-top: 12px; padding: 12px; }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }
  .section-title h2 {
    margin: 0;
    color: rgba(248,250,252,.96);
    font-size: 16px;
    letter-spacing: -.02em;
  }
  .section-title span {
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .forecast-list {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .forecast-card {
    min-width: 0;
    padding: 11px 9px 10px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,.085);
    background: rgba(2,6,23,.25);
  }
  .forecast-card span {
    display: block;
    color: rgba(248,250,252,.9);
    font-size: 13px;
    font-weight: 850;
    text-transform: capitalize;
  }
  .forecast-card strong {
    display: block;
    margin-top: 10px;
    color: #fff;
    font-size: 22px;
    letter-spacing: -.045em;
  }
  .mini-bar {
    height: 5px;
    margin-top: 8px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    overflow: hidden;
  }
  .mini-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent-strong, #a7f3d0), var(--accent, #34d399));
    box-shadow: 0 0 12px var(--accent-glow, rgba(52,211,153,.22));
    animation: growBar .8s cubic-bezier(.2,.85,.2,1) both;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .metric-card {
    min-height: 112px;
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 11px;
    padding: 13px;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,.085);
    background: rgba(2,6,23,.25);
    overflow: hidden;
  }
  .metric-card:after {
    content: "";
    position: absolute;
    inset: auto -30px -34px auto;
    width: 88px;
    height: 88px;
    border-radius: 999px;
    background: var(--accent-soft, rgba(52,211,153,.13));
    filter: blur(6px);
    opacity: .55;
  }
  .metric-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: var(--accent-strong, #a7f3d0);
    background: rgba(255,255,255,.07);
  }
  .metric-card strong {
    display: block;
    margin-top: 7px;
    color: #fff;
    font-size: 24px;
    line-height: 1;
    letter-spacing: -.045em;
  }

  .data-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 9px;
  }
  .data-status {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px;
    border: 1px solid rgba(255,255,255,.085);
    border-radius: 18px;
    background: rgba(2,6,23,.24);
    color: rgba(226,232,240,.72);
  }
  .data-status.is-active { color: var(--accent-strong, #a7f3d0); }
  .data-status strong {
    display: block;
    margin-top: 2px;
    color: rgba(248,250,252,.92);
    font-size: 13px;
    text-transform: lowercase;
  }
  .insight-row {
    display: grid;
    grid-template-columns: 1.4fr .72fr .58fr;
    gap: 8px;
    margin-top: 9px;
  }
  .insight-row > div {
    min-width: 0;
    padding: 11px;
    border-radius: 18px;
    background: rgba(255,255,255,.045);
  }
  .insight-row strong {
    display: block;
    margin-top: 5px;
    overflow: hidden;
    color: rgba(248,250,252,.92);
    font-size: 13px;
    line-height: 1.25;
    text-overflow: ellipsis;
  }

  .app-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 4px 0;
    color: rgba(226,232,240,.6);
    font-size: 12px;
    line-height: 1.35;
  }

  .update-banner {
    width: 100%;
    margin-top: 12px;
    border: 0;
    border-radius: 22px;
    padding: 14px 16px;
    color: #04111a;
    background: linear-gradient(135deg, #d9f99d, #22c55e);
    box-shadow: 0 18px 50px rgba(34, 197, 94, 0.23);
    text-align: center;
    font-weight: 900;
    cursor: pointer;
  }

  .loading-card {
    min-height: min(720px, calc(100svh - 24px));
    display: grid;
    place-items: center;
    align-content: center;
    gap: 12px;
    text-align: center;
  }
  .loading-orb {
    width: 92px;
    height: 92px;
    display: grid;
    place-items: center;
    border-radius: 31px;
    color: #bef264;
    background: rgba(163, 230, 53, 0.12);
    border: 1px solid rgba(255,255,255,.1);
    box-shadow: 0 0 58px rgba(163, 230, 53, 0.22);
    animation: loaderPulse 1.4s infinite ease-in-out;
  }
  .loading-card h1 {
    margin: 8px 0 0;
    font-size: 28px;
    letter-spacing: -.04em;
  }
  .loading-card p {
    max-width: 280px;
    margin: 0;
    color: rgba(226,232,240,.68);
    line-height: 1.45;
  }

  .reveal {
    opacity: 0;
    transform: translateY(14px) scale(.985);
    animation: revealUp .65s cubic-bezier(.2,.82,.2,1) forwards;
  }
  .reveal-delay-1 { animation-delay: .02s; }
  .reveal-delay-2 { animation-delay: .08s; }
  .reveal-delay-3 { animation-delay: .15s; }
  .reveal-delay-4 { animation-delay: .22s; }
  .reveal-delay-5 { animation-delay: .29s; }
  .reveal-delay-6 { animation-delay: .36s; }
  .reveal-delay-7 { animation-delay: .43s; }

  @keyframes revealUp {
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes breathe {
    0%, 100% { transform: scale(1); opacity: .75; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  @keyframes floatPollen {
    0%, 100% { margin-top: 0; margin-left: 0; opacity: .25; }
    50% { margin-top: -18px; margin-left: 10px; opacity: .68; }
  }
  @keyframes glassPulse {
    0%, 100% { transform: scale(1); opacity: .88; }
    50% { transform: scale(1.025); opacity: 1; }
  }
  @keyframes scalePop {
    0% { transform: scaleX(.35); opacity: .4; }
    100% { transform: scaleX(1); opacity: 1; }
  }
  @keyframes growBar {
    from { width: 0; }
  }
  @keyframes loaderPulse {
    0%, 100% { transform: scale(1); opacity: .82; }
    50% { transform: scale(1.06); opacity: 1; }
  }

  @media (max-width: 390px) {
    .app-shell { padding-left: 10px; padding-right: 10px; }
    .app-card { border-radius: 30px; padding: 14px; }
    .score-dial { width: 242px; height: 242px; }
    .dial-glass { width: 170px; height: 170px; }
    .score-value strong { font-size: 76px; }
    .score-copy h1 { font-size: 29px; }
    .forecast-list { gap: 6px; }
    .forecast-card { padding: 10px 7px; }
    .metrics-grid { gap: 8px; }
    .metric-card { min-height: 104px; padding: 11px; }
  }

  @media (max-width: 350px) {
    .quick-row,
    .metrics-grid,
    .data-row {
      grid-template-columns: 1fr;
    }
    .forecast-list {
      grid-template-columns: repeat(2, 1fr);
    }
    .insight-row {
      grid-template-columns: 1fr;
    }
    .score-dial { width: 228px; height: 228px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: .001ms !important;
    }
  }
`;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
