# Eilandrijk (werktitel)

Hexagon-bordspel voor jou tegen **2 of 3 AI-tegenstanders**, in de browser. Het is een PWA: op iPad en laptop te installeren op het beginscherm en daarna ook offline te spelen. Eigen naam en eigen visuele stijl; alleen de spelmechanica is overgenomen, geen tekst of artwork.

## Spelen

- **Zonder installatie:** open `index.html` in de browser (dubbelklik op het bestand).
- **Als app (iPad/iPhone):** zet de map op een https-adres (bijv. GitHub Pages), open het adres in Safari en kies Deel → *Zet op beginscherm*. De service worker (`sw.js`) bewaart dan alle bestanden voor offline gebruik.
- **Als app (Mac/Chrome/Edge):** open het https-adres en kies *Installeer Eilandrijk* in de adresbalk.

Bij een nieuwe versie: verhoog `VERSION` in `sw.js`, anders blijven bestaande installaties de oude bestanden tonen.

## Opbouw

| Bestand | Rol |
|---|---|
| `js/topology.js` | Hexgrid (axiale coördinaten), hoekpunten, randen, havenposities |
| `js/engine.js` | Alle spelregels voor 3–4 spelers als pure toestand + `EK.act(state, actie)` |
| `js/ai.js` | AI: heuristieken, Monte Carlo (rover), ruillogica, moeilijkheidsgraden |
| `js/render.js` | SVG-bord in vlakke geometrische stijl |
| `js/ui.js` | Interface, dialogen, spelverloop, opslaan (localStorage) |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: installeerbaar en offline |
| `artifact.html` | Variant zonder PWA-onderdelen voor het gepubliceerde Claude-artifact |
| `test/sim.js` | AI-tegen-AI simulaties met invarianten (Node) |

## AI

- **Heuristiek:** score per bouwplek (kans-punten × grondstofgewicht, diversiteit, havens, uitbreidingsruimte); kiest een bouwdoel en haalt dat zo nodig via de bank of een ruil met jou.
- **Monte Carlo:** voor de roverplaatsing simuleert de AI per kandidaat-tegel `sims` toekomsten van `horizon` rondes met een snelle greedy-bot. De handen van de anderen worden daarbij willekeurig herverdeeld, dus de AI kijkt niet in je kaarten. De rover gaat bij voorkeur naar de leider.
- **Ruilen:** grondstoffen krijgen een waarde op basis van wat de AI nodig heeft; elke AI reageert op jouw bod met ja, nee of een tegenbod. De AI's ruilen niet onderling; ze stellen alleen jou voorstellen voor en ruilen niet met spelers die bijna winnen.
- **Moeilijkheid:** Makkelijk (ruis, geen simulatie), Gemiddeld (40 simulaties), Moeilijk (200 simulaties + vooruitkijken bij de beginplaatsing).

## Testen (alleen voor ontwikkelaars)

```bash
node test/sim.js 30 3,2,2,2   # 30 spellen met 4 spelers: levels per speler
```

Controleert o.a. dat grondstoffen nooit verloren gaan, de afstandsregel niet geschonden wordt en dat elk spel eindigt.

## Ideeën voor later

- Supabase-koppeling om spelstanden op te slaan
- AI's die ook onderling ruilen
- Geluid en animaties bij opbrengst
