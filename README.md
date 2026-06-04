# Ambrozie Scanner Free

Varianta fara API keys, fara Google Cloud, fara Ambee si fara Environment Variables in Vercel.

## Structura GitHub

Pune fisierele direct in radacina repo-ului:

```txt
/
├── App.tsx
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
└── README.md
```

## Deploy Vercel

- Framework Preset: Vite
- Install Command: npm install
- Build Command: npm run build
- Output Directory: dist

Nu trebuie setata nicio variabila in Vercel.

## Cum calculeaza indicele

1. Incearca Open-Meteo Air Quality pentru `ragweed_pollen`.
2. Daca valoarea live este mai mare decat 0, foloseste un scor mixt: live + estimare.
3. Daca Open-Meteo intoarce 0 sau nu are date, calculeaza o estimare din sezon, locatie, temperatura, umiditate, ploaie, vant, PM10, PM2.5 si dust.
