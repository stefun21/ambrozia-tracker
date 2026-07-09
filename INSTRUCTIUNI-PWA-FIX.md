# Fix PWA / Add to Home Screen

Copiaza aceste fisiere peste cele din repo:

- `App.tsx`
- `index.html`
- `public/manifest.webmanifest`
- `public/sw.js`

Nu sterge iconurile tale. Verifica sa ai in `public/` exact aceste fisiere imagine:

- `icon-192.png` - logo 192x192 PNG
- `icon-512.png` - logo 512x512 PNG
- `maskable-icon-512.png` - logo 512x512 PNG, cu margini/safe area
- `apple-touch-icon.png` - logo 180x180 PNG
- `favicon.ico`

Dupa deploy pe Vercel:

1. Sterge shortcut-ul vechi de pe Android.
2. In Chrome, deschide site-ul cu `?v=8` la finalul URL-ului.
3. Chrome -> Settings -> Site settings -> All sites -> domeniul tau -> Clear & reset, daca inca apare iconita veche.
4. Reincarca pagina de doua ori.
5. Apasa butonul mic `+ App` din aplicatie sau Chrome `⋮` -> `Install app` / `Add to Home screen`.

Butonul `+ App` apare acum si cand Chrome nu declanseaza promptul nativ. Daca promptul nativ nu este disponibil, butonul arata instructiuni manuale.
