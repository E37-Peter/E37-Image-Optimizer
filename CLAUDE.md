# E37 Image Optimizer — CLAUDE.md

## Vad är det här?
Ett klientbaserat webbverktyg för att batch-optimera produktbilder för e-handel (E37-plattformen och Google Merchant). All bildbearbetning sker lokalt i webbläsaren via Canvas API — ingen data skickas till externa tjänster.

## Teknikstack
- Vanilla JS, HTML, CSS — inga ramverk, ingen byggprocess
- Canvas API / OffscreenCanvas för bildbearbetning
- Web Workers för off-thread bearbetning (kräver HTTP-server, ej `file://`)
- JSZip (CDN) för ZIP-export
- Google Fonts: Inter + IBM Plex Mono
- Fyra filer: `index.html`, `styles.css`, `app.js`, `worker.js`

## Arkitektur

### State (app.js, globala variabler)
```js
let items = [];          // Array av bildobjekt
let targetSize = 1500;   // Längsta sida i px
let outputFormat = 'image/jpeg';
let quality = 0.85;
let ratio = '1:1';       // '1:1' | '4:5' | 'custom'
let customW, customH;
let bgColor = 'transparent'; // Bakgrund för PNG
let sharpness = 0;       // 0–100
let autoCrop = false;
```

### Item-objekt
```js
{
  id,           // Unikt nummer
  file,         // File-objekt (originalet)
  name,         // Originalfilnamn
  outName,      // Utgående filnamn (kan ändras via rename)
  originalSize, // Bytes
  originalW, originalH,
  blob,         // Optimerad bild (Blob), null om ej processad
  newSize,      // Bytes efter optimering
  status,       // 'pending' | 'processing' | 'done' | 'error'
  rotation,     // 0 | 90 | 180 | 270
  srcX, srcY, srcW, srcH,  // Källbeskärning (auto-crop)
  drawW, drawH, // Dimensioner på canvas (efter skalning + rotation)
}
```

### Bildflöde

**Worker-path (standard, kräver HTTP-server):**
1. `processAll()` skapar en worker-pool (`Math.min(antal, hardwareConcurrency, 8)` slots)
2. Varje slot kör `processItemWorker()` parallellt
3. Filen läses som `ArrayBuffer` och transfereras (noll-kopia) till en `Worker`
4. `worker.js` kör `createImageBitmap()`, `OffscreenCanvas`, `detectCropBounds()`, `applySharpen()`, `convertToBlob()`
5. Resultatet transfereras tillbaka som `ArrayBuffer` → `finalizeCard()` uppdaterar UI
6. Fallback till main-thread om workern misslyckas

**Main-thread fallback (vid `file://`-protokoll eller worker-fel):**
1. Ladda File till `<img>`
2. Kör `detectCropBounds()` om `autoCrop` är på
3. Beräkna canvas-dimensioner via `getCanvasDims()`
4. Rita till canvas med rotation (ctx.save/rotate/restore)
5. Kör `applySharpen()` om sharpness > 0
6. `canvas.toBlob()` → `finalizeCard()` uppdaterar UI

**`finalizeCard(item, blob, cw, ch, ext)`** — delas av båda paths, uppdaterar kort, download-länk och statusrad.

## Viktiga konventioner
- **Ändra bara det som explicit efterfrågas** — inga oombedda refaktoringar
- **Inga nya beroenden** utan godkännande
- CSS-variabler matchar E37 Feed Lab (samma design-tokens): `--bg`, `--panel`, `--soft`, `--line`, `--text`, `--good`, `--warn`, `--bad`, `--sans`, `--mono`
- Inställningar sparas i `localStorage` under nyckeln `imgOptSettings`
- Svenska UI-texter genomgående

## Implementerade funktioner
- Drag & drop, filväljare, urklipp (Ctrl+V), testbilder (Lorem Picsum)
- Format: JPG, WebP, PNG
- Storlek: 1200/1500/2000 eller egna mått
- Proportioner: 1:1, 4:5 eller eget
- Bakgrundsfärg för PNG (transparent/vit/svart/grå/anpassad)
- Kvalitetsslider (50–95%)
- Avancerat-accordion: skärpefilter, förstora aldrig, auto-beskärning
- Drag-to-sort i bildgrid med grip-handle
- Rotera 90° per bild (från kortet)
- Ta bort enstaka bild från jobbet
- Batch-rename modal med artikelnummer och a/v-prefix
- ZIP-nedladdning med eget filnamn
- Per-bild-nedladdning från kortet
- Lightbox med before/after-slider (original vs optimerad)
- RGB-histogram i lightbox
- Lågupplöst-varning (>1.5× uppskalning)
- Proportionsvarning (<65% canvas-täckning)
- Statistiksammanfattning efter optimering
- Mörkt/ljust tema
- Mobilvarning
- localStorage-persistens för inställningar
- **Parallell bearbetning** med Web Workers (OffscreenCanvas) + main-thread-fallback
- Framstegsindikator i Optimera-knappen ("Optimerar X/N…")

## Kvar att bygga (prioritetslista)
- 9. Vattenstämpel / logotyp
- 10. AVIF-export
- 11. Padding-kontroll (luft runt produkt)
- 12. Inställningsprofiler
- 13. Bekräftelse innan omoptimering
