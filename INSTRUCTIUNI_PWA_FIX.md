# Fix PWA / Add to Home Screen

## Ce inlocuiesti

Inlocuieste aceste fisiere in repo:

```text
App.tsx
index.html
public/manifest.webmanifest
public/sw.js
```

Nu este obligatoriu sa inlocuiesti iconurile daca deja ai pus logo-ul tau, dar Android foloseste EXACT aceste fisiere din manifest:

```text
public/icon-192.png
public/icon-512.png
public/maskable-icon-512.png
public/apple-touch-icon.png
public/favicon.ico
```

Daca ai schimbat doar `icon.png`, nu ajunge. Pentru PWA trebuie sa fie schimbate fisierele de mai sus.

## Dupa deploy pe Vercel

1. Sterge shortcut-ul vechi de pe telefon.
2. In Chrome Android deschide site-ul cu `?v=8` la finalul URL-ului.
3. Da refresh de 2 ori.
4. Meniu Chrome ⋮ > Add to Home screen / Instaleaza aplicatia.

## Ce s-a reparat

- service worker-ul se inregistreaza corect chiar daca evenimentul `load` a trecut deja;
- butonul mic `App` apare in UI cand aplicatia nu e instalata;
- daca promptul nativ nu e disponibil, butonul afiseaza instructiuni manuale;
- manifestul are cache-busting `?v=8` pentru iconuri;
- service worker-ul nu mai tine blocat manifestul/iconurile vechi in cache.
