# Trampolin – en hyldest til *Walaber's Trampoline*

Et trampolinspil til browseren, der også kører på iPhone og Android. Spillet er skrevet i ren HTML5 Canvas og JavaScript uden byggetrin og uden eksterne afhængigheder.

## Kør spillet

- **Hurtigst:** åbn `trampoline/index.html` direkte i browseren.
- **Som app på mobilen:** læg mappen på en HTTPS-server, fx GitHub Pages, Netlify eller Cloudflare Pages. Åbn siden på telefonen, og vælg *Føj til hjemmeskærm*. Så kører spillet i fuld skærm og virker også offline (PWA med service worker).
- **Lokalt med server:** `python3 -m http.server -d trampoline 8080` og åbn http://localhost:8080.

## Styring

| | Tastatur | Mobil |
|---|---|---|
| Sats (tryk når ringen bliver gul) | Mellemrum | SATS |
| Lad rotation op (hold) – slip for at bruge | ← → | ◀ ▶ |
| Strakt (hold) | F | STRAKT |
| Lukket (tuck) | S | LUKKET |
| Hoftebøjet (pike) | D | HOFTE |
| Skrue – ½ skrue pr. tryk (strakt, eller lukket med S + ↓) | ↓ | SKRUE |
| Stop på dugen | ↑ | STOP |
| Pause | Esc / P | ❚❚ |

Gamepad virker også (A = sats, X = lukket, Y = hoftebøjet, skulderknapper = skrue).

## Styring af rotation

- **Arkade (standard, som i Walaber's Trampoline):** hold ← eller → for at lade rotation op – også mens du er i luften. Slip for at bruge ladningen: i næste afsæt, eller med det samme, hvis du holdt pilen gennem afsættet. I luften holder du en position for at rotere: strakt (F), hoftebøjet (D), lukket (S) eller skrue (↓ – hvert tryk giver ½ skrue; strakt eller lukket med S + ↓). Slip alle knapper (åbn), så bremser rotationen brat (ca. 0,1 s) ned til højst ca. 125°/s og glider derefter ned mod ca. 55°/s frem mod landing – uanset niveau – målt fra en video af Walaber's Trampoline.
- **Realistisk:** rotationen tages med fra dugen ved at vippe, og impulsmomentet er bevaret i luften. Vælges under *Spiller*.

## Hvad er nyt i forhold til originalen

- **Tre positioner:** strakt, **hoftebøjet** og lukket.
- **Landing på ryg og mave:** rygfald og mavefald, og videre derfra, fx til fødderne, ball-out, cody og kaboom.
- **Timing af satsen:** et kort tryk er nok, og vinduet for en perfekt sats er bredt (ca. 0,35 s før til 0,15 s efter dugens bund). En ring på dugen viser, hvornår man skal trykke SATS, og man får at vide, om satsen var perfekt, god, for tidlig eller for sen. Perfekt timing giver mest højde.
- **Rotationsmåler:** viser, hvor meget rotation du lægger i fra dugen, og hvor mange saltoer det cirka rækker til i strakt og lukket.
- **Skruer i strakt og lukket position** (lukket skrue: ↓ + S). Skruehastigheden følger kroppens inertimoment, så strakt skruer hurtigst (ca. 1,8 skruer/s uden træning).
- **Skæve landinger:** lander du skævt på fødderne (op til ca. 60°), kan du springe videre med et lavt afsæt og vandring til siden – for meget, og du ryger ud over kanten.
- **Realistiske højder i roligt tempo:** tyngdepunktet løftes ca. 3,6 m (flyvetid ~1,7 s) uden træning og ~5,3 m (~2,1 s) med fuld Kraft – som hos eliten. Højden holdes med gode satser og falder kun ved dårlig timing eller landing væk fra midten (op til 25 % ved kanten). Spillet kører i 70 % tempo, og kameraet følger med op.
- **FIG-mål:** dug 4,28 × 2,14 m, ramme 5,05 × 2,91 m, 1,15 m over gulvet.
- **Rigtig fysik:** impulsmomentet er bevaret i luften, så man roterer hurtigere, når man lukker. Dugen er en fjeder, der bøjer ned under fødderne.
- **Grafik: Neon-spor (standard)** – springeren tegnes som en glødende silhuet, og dugen pulserer ved landing. Hver bane har sine egne neonfarver. Den klassiske grafik kan vælges under Spiller → Grafik.
- **3D-krop tegnet fra siden:** skruer kan ses ordentligt (forfra/bagfra), og lemmerne tegnes i dybderækkefølge.
- **Pointsystem som i FIG-trampolin:** D (sværhedsgrad), E (udførelse med fradrag), T (flyvetid) og H (placering). Springene får FIG-koder, fx `8 2 0 o` for en hel-ind lukket, og rigtige navne som Barani, Rudi, Randy, Miller og Triffus.
- **Spiltyper:** fri leg med kombinationer, 60 sekunders tidsløb, konkurrence med 10 elementer og 25 udfordringer fordelt på 4 baner (Klubhallen, Solnedgang, Nordlys og VM-finalen), også med rygfald, ball-out og cody.
- **Fri leg fuldt trænet:** en knap i menuen giver alle færdigheder på max i fri leg (uden XP og rekord), så man kan prøve de store spring.
- **Realistisk antal saltoer:** uden træning en enkeltsalto (strakt kræver fuld ladning), dobbelt fra ca. niveau 2–3, tripel lukket fuldt trænet – og firdobbelt hoftebøjet kun lige akkurat med fuld træning, fuld ladning og perfekte satser (som en OL-atlet).
- **Færdigheder:** XP og stjerner giver point til Kraft, Rotation, Skrue, Smidighed, Luftkontrol og Landing.
- **Udfordr en ven:** del et link efter et tidsløb, en rutine eller et spring. Al data ligger i linket, så det kræver ingen server.

## Kode

| Fil | Indhold |
|---|---|
| `js/body.js` | Leddelt krop, positioner, massemidtpunkt og inertimomenter |
| `js/athlete.js` | Fysik: dug, flugt, skruer, landing og styrt |
| `js/tricks.js` | Genkendelse af spring, FIG-koder, navne og sværhedsgrad |
| `js/scoring.js` | Bedømmelse (D/E/T/H) og point |
| `js/challenges.js` | Baner og udfordringer |
| `js/game.js` | Spilløkke, spiltyper og demo-bot |
| `js/render.js`, `js/arenas.js` | Grafik |
| `js/ui.js`, `js/input.js`, `js/audio.js`, `js/share.js` | Menuer, input, lyd og udfordringslinks |

Tests: `npm run test:trampolin` (fra roden af repoet).
