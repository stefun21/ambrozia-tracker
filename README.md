Ambrozie Tracker
Ambrozie Tracker este o aplicatie web moderna, optimizata pentru mobil, care estimeaza rapid nivelul local de ambrozie pe o scara de la 0 la 10. Aplicatia combina date meteo, particule in aer si disponibilitatea datelor de polen pentru a oferi un indice clar, usor de inteles si potrivit pentru decizii rapide in zilele cu risc alergic.
Highlights
Indice ambrozie 0-10 cu interpretare vizuala instantanee
Estimare locala pe baza geolocatiei utilizatorului
Date live + model calibrat pentru rezultate mai echilibrate si mai apropiate de aplicatiile de referinta
Forecast pe 4 zile pentru planificarea expunerii
PWA ready: instalabila pe telefon, cu shortcut pe ecran
Experienta app-like: deschidere in mod standalone, fara bara de URL
Offline fallback prin Service Worker si cache local
Fara API keys si fara variabile de mediu necesare
Deploy rapid pe Vercel cu preset Vite
Tech Stack
React
TypeScript
Vite
Open-Meteo Forecast API
Open-Meteo Air Quality API
BigDataCloud Reverse Geocoding
Progressive Web App standards: Web App Manifest + Service Worker
Cum functioneaza
Aplicatia foloseste doua componente principale pentru calculul indicelui:
Date live de polen, atunci cand sunt disponibile pentru zona utilizatorului.
Model meteo/sezonier calibrat, care ia in calcul sezonalitatea, regiunea, temperatura, umiditatea, vantul, ploaia si particulele din aer.
Formula este gandita sa evite valori artificial extreme. In loc sa impinga rapid scorul catre 10/10, aplicatia foloseste o calibrare mai temperata, astfel incat rezultatul sa fie mai apropiat de aplicatiile de referinta si mai util in utilizarea zilnica.
Structura proiectului
```text
/
├── App.tsx
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── README.md
└── public/
    ├── apple-touch-icon.png
    ├── favicon.ico
    ├── icon.svg
    ├── icon-192.png
    ├── icon-512.png
    ├── maskable-icon-512.png
    ├── manifest.webmanifest
    └── sw.js
```
Instalare locala
```bash
npm install
npm run dev
```
Build productie
```bash
npm run build
npm run preview
```
Deploy pe Vercel
Setari recomandate:
Framework Preset: Vite
Install Command: `npm install`
Build Command: `npm run build`
Output Directory: `dist`
Environment Variables: nu sunt necesare
PWA
Aplicatia include toate fisierele necesare pentru instalare pe mobil:
`manifest.webmanifest`
`sw.js`
icon-uri PNG pentru Android/iOS
favicon
maskable icon pentru Android
meta tag-uri Apple si Android in `index.html`
Dupa deploy, aplicatia poate fi instalata din browser folosind optiunea Add to Home Screen / Instaleaza aplicatia. Dupa instalare, se deschide ca o aplicatie nativa, fara bara de URL.
Disclaimer
Ambrozie Tracker ofera o estimare informativa, bazata pe date publice si modelare locala. Nu inlocuieste sfatul medical si nu trebuie folosita ca unica sursa pentru decizii medicale.
Autor
Creat si optimizat ca aplicatie mobila PWA pentru monitorizarea rapida a nivelului de ambrozie.