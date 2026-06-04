# Ambrozie Scanner

## Structura

```txt
/
├── App.tsx
├── index.html
├── package.json
├── vite.config.ts
├── .env.example
└── api
    └── pollen.ts
```

## Vercel Environment Variables

În Vercel, mergi la Project > Settings > Environment Variables și adaugă:

```txt
GOOGLE_POLLEN_API_KEY=cheia_ta_google
AMBEE_API_KEY=cheia_ta_ambee
```

După ce le adaugi, fă redeploy cu Build Cache OFF.

## Prioritate API

1. Google Pollen API
2. Ambee Pollen API
3. Open-Meteo fallback

Frontend-ul cheamă `/api/pollen?lat=...&lon=...`, iar cheile rămân ascunse în Vercel Function.
