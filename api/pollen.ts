type PollenProviderResult = {
  ok: boolean;
  source: string;
  score: number;
  rawRagweed: number | null;
  category: string;
  trend: "↑" | "↓" | "→";
  message: string;
  healthRecommendation: string;
  forecast: Array<{ date: string; score: number; raw: number | null; source: string }>;
  debug?: unknown;
};

type WeatherResult = {
  liveWeather: boolean;
  tempNow: number | null;
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function categoryFromScore(score: number) {
  if (score < 3) return "Scăzut";
  if (score < 7) return "Mediu";
  return "Ridicat";
}

function messageFromScore(score: number) {
  if (score >= 7) return "🛑 Nivel ridicat de ambrozie.";
  if (score >= 3) return "⚠️ Nivel mediu de ambrozie.";
  return "✅ Nivel scăzut de ambrozie.";
}

function trendFromValues(current: number, next: number): "↑" | "↓" | "→" {
  if (next > current) return "↑";
  if (next < current) return "↓";
  return "→";
}

function pickNearestHourlyValue(times: string[] = [], values: number[] = []) {
  if (!times.length || !values.length) return 0;

  const now = Date.now();
  let bestIndex = 0;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return safeNumber(values[bestIndex], 0);
}

function scoreFromGoogleUpi(upi: number) {
  return clamp((upi / 5) * 10, 0, 10);
}

function scoreFromRawRagweed(raw: number) {
  return clamp(raw, 0, 10);
}

function findRagweedPlant(plantInfo: any[] = []) {
  return plantInfo.find((plant) => {
    const haystack = JSON.stringify({
      code: plant?.code,
      displayName: plant?.displayName,
      plantDescription: plant?.plantDescription,
      inSeason: plant?.inSeason,
    }).toLowerCase();

    return haystack.includes("ragweed") || haystack.includes("ambrosia") || haystack.includes("ambrozie");
  });
}

function extractAmbeeRagweed(node: any): number | null {
  const values: number[] = [];

  function walk(value: any, path: string[] = []) {
    if (value === null || value === undefined) return;

    if (typeof value === "number") {
      const joined = path.join(".").toLowerCase();
      if (joined.includes("ragweed") || joined.includes("ambrosia")) {
        values.push(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }

    if (typeof value === "object") {
      const keys = Object.keys(value);
      const text = JSON.stringify(value).toLowerCase();

      if ((text.includes("ragweed") || text.includes("ambrosia")) && keys.length) {
        for (const key of keys) {
          const child = value[key];
          if (typeof child === "number") values.push(child);
        }
      }

      for (const key of keys) walk(value[key], [...path, key]);
    }
  }

  walk(node);
  return values.length ? Math.max(...values.map((v) => safeNumber(v))) : null;
}

async function fetchCity(lat: number, lon: number) {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ro`
    );
    if (!response.ok) return "Locația ta";

    const json = await response.json();
    return json.city || json.locality || json.principalSubdivision || "Locația ta";
  } catch {
    return "Locația ta";
  }
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather API error");

    const json = await response.json();

    return {
      liveWeather: true,
      tempNow: typeof json.current?.temperature_2m === "number" ? json.current.temperature_2m : null,
      tempMax: typeof json.daily?.temperature_2m_max?.[0] === "number" ? json.daily.temperature_2m_max[0] : null,
      tempMin: typeof json.daily?.temperature_2m_min?.[0] === "number" ? json.daily.temperature_2m_min[0] : null,
      weatherCode: typeof json.current?.weather_code === "number" ? json.current.weather_code : null,
    };
  } catch {
    return {
      liveWeather: false,
      tempNow: null,
      tempMax: null,
      tempMin: null,
      weatherCode: null,
    };
  }
}

async function fetchGooglePollen(lat: number, lon: number): Promise<PollenProviderResult | null> {
  const apiKey = process.env.GOOGLE_POLLEN_API_KEY;
  if (!apiKey) return null;

  try {
    const url =
      `https://pollen.googleapis.com/v1/forecast:lookup?key=${encodeURIComponent(apiKey)}` +
      `&location.latitude=${lat}` +
      `&location.longitude=${lon}` +
      `&days=5` +
      `&languageCode=ro` +
      `&plantsDescription=true`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const json = await response.json();
    const dailyInfo = Array.isArray(json.dailyInfo) ? json.dailyInfo : [];
    if (!dailyInfo.length) return null;

    const first = dailyInfo[0];
    const plant = findRagweedPlant(first.plantInfo || []);
    if (!plant?.indexInfo) return null;

    const upi = safeNumber(plant.indexInfo.value, 0);
    const score = scoreFromGoogleUpi(upi);

    const secondPlant = findRagweedPlant(dailyInfo[1]?.plantInfo || []);
    const nextUpi = safeNumber(secondPlant?.indexInfo?.value, upi);

    const forecast = dailyInfo
      .map((day: any) => {
        const p = findRagweedPlant(day.plantInfo || []);
        const value = p?.indexInfo?.value;
        if (typeof value !== "number") return null;

        const date = day.date
          ? `${day.date.year}-${String(day.date.month).padStart(2, "0")}-${String(day.date.day).padStart(2, "0")}`
          : new Date().toISOString().slice(0, 10);

        return {
          date,
          score: scoreFromGoogleUpi(value),
          raw: value,
          source: "Google Pollen",
        };
      })
      .filter(Boolean);

    return {
      ok: true,
      source: "Google Pollen",
      score,
      rawRagweed: upi,
      category: plant.indexInfo.category || categoryFromScore(score),
      trend: trendFromValues(upi, nextUpi),
      message: messageFromScore(score),
      healthRecommendation: plant.indexInfo.indexDescription || first.healthRecommendations?.[0] || "",
      forecast,
      debug: { provider: "google", upi },
    };
  } catch {
    return null;
  }
}

async function fetchAmbeePollen(lat: number, lon: number): Promise<PollenProviderResult | null> {
  const apiKey = process.env.AMBEE_API_KEY;
  if (!apiKey) return null;

  const urls = [
    `https://api.ambeedata.com/latest/pollen/by-lat-lng?lat=${lat}&lng=${lon}`,
    `https://api.ambeedata.com/latest/pollen/by-lat-lng?lat=${lat}&lon=${lon}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          "Content-type": "application/json",
        },
      });

      if (!response.ok) continue;

      const json = await response.json();
      const raw = extractAmbeeRagweed(json);
      if (raw === null) continue;

      const score = scoreFromRawRagweed(raw);

      return {
        ok: true,
        source: "Ambee",
        score,
        rawRagweed: raw,
        category: categoryFromScore(score),
        trend: "→",
        message: messageFromScore(score),
        healthRecommendation: "Date Ambee pentru ambrozie/ragweed, normalizate pe scară 0–10.",
        forecast: [{ date: new Date().toISOString().slice(0, 10), score, raw, source: "Ambee" }],
        debug: { provider: "ambee", raw },
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchOpenMeteoPollen(lat: number, lon: number): Promise<PollenProviderResult | null> {
  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=ragweed_pollen` +
      `&hourly=ragweed_pollen` +
      `&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const json = await response.json();
    const rawCurrent = json.current?.ragweed_pollen;
    const rawHourly = pickNearestHourlyValue(json.hourly?.time, json.hourly?.ragweed_pollen);
    const raw = safeNumber(rawCurrent, rawHourly);
    const score = scoreFromRawRagweed(raw);

    const hourlyValues = Array.isArray(json.hourly?.ragweed_pollen) ? json.hourly.ragweed_pollen : [];
    const next = safeNumber(hourlyValues[1], raw);

    return {
      ok: true,
      source: "Open-Meteo",
      score,
      rawRagweed: raw,
      category: categoryFromScore(score),
      trend: trendFromValues(raw, next),
      message: messageFromScore(score),
      healthRecommendation: "Open-Meteo este fallback gratuit; ambrozia poate fi limitată sezonier și regional.",
      forecast: [{ date: new Date().toISOString().slice(0, 10), score, raw, source: "Open-Meteo" }],
      debug: { provider: "open-meteo", raw },
    };
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ ok: false, message: "Lipsesc coordonatele lat/lon." });
    return;
  }

  const [city, weather] = await Promise.all([fetchCity(lat, lon), fetchWeather(lat, lon)]);

  const google = await fetchGooglePollen(lat, lon);
  const ambee = google ? null : await fetchAmbeePollen(lat, lon);
  const openMeteo = google || ambee ? null : await fetchOpenMeteoPollen(lat, lon);

  const pollen = google || ambee || openMeteo;

  if (!pollen) {
    res.status(503).json({
      ok: false,
      city,
      livePollen: false,
      ...weather,
      message: "Nu am putut încărca polenul. Verifică GOOGLE_POLLEN_API_KEY și AMBEE_API_KEY în Vercel.",
    });
    return;
  }

  res.status(200).json({
    ok: true,
    city,
    livePollen: true,
    ...weather,
    ...pollen,
  });
}
