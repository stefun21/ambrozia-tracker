# Update UI/UX Ambrozie Tracker

## Varianta recomandata
Copiaza peste proiectul tau fisierele din arhiva pastrand aceeasi structura.

## Daca vrei sa pastrezi sigur logo-ul tau
Inlocuieste doar:

```text
App.tsx
tsconfig.json
public/sw.js
```

Nu atinge restul din `public/` daca logo-ul tau este deja corect.

## Ce s-a schimbat
- scorul de ambrozie este acum elementul central al aplicatiei;
- layout-ul este mai apropiat de o aplicatie mobila premium;
- locatie, temperatura, vant, umiditate, ploaie, PM10 si sursa datelor raman vizibile;
- prognoza pe zile este mai usor de citit;
- au fost adaugate animatii subtile;
- `tsconfig.json` a fost reparat ca sa nu mai pice build-ul in Vercel;
- `public/sw.js` a fost schimbat pe network-first ca sa nu ramana blocat in cache vechi.

## Deploy
Dupa ce faci push pe GitHub, Vercel va redeploya automat.
Daca vezi inca design vechi pe telefon, deschide site-ul cu `?ui=v2` la final si da refresh.
