# Jueces Sanda Chile — Puntuación en línea

App web para puntuar combates de Wushu Sanda (reglamento IWUF 2024) desde celulares.

| Pantalla | Enlace | Quién la usa |
|---|---|---|
| Inicio | `#/` | Crear combates y ver el historial |
| Mesa central | `#/mesa/CÓDIGO` | Juez principal: cronómetro, penalizaciones, puntajes en vivo, cierre |
| Juez de línea | `#/juez/CÓDIGO/N` | Cada juez (1 a 5) desde su celular: botón ROJO / AZUL |
| Pantalla pública | `#/pantalla/CÓDIGO` | TV o proyector para el público |

## Reglas implementadas (`js/logic.js`)

- Juez de línea: 1 toque = 1 punto; para 2 puntos se toca 2 veces. Botón deshacer.
- La mesa central registra amonestación (+1 al rival), advertencia (+2), conteo forzado (+2),
  salida de plataforma (+2), no ataca en 5 s / no se levanta en 3 s (+1) y, en Adulto light, exceso de contacto
  (cuenta como advertencia). Esos puntos se suman automáticamente a la tarjeta de cada juez.
- Ganador del round: mayoría de jueces. Empate de un juez: menos advertencias → menos amonestaciones → menor peso.
- 2 conteos forzados o 2 salidas en un round: el rival gana el round.
- 3 advertencias en el combate: descalificación. 3 conteos forzados: victoria absoluta.
- 12 o más puntos de diferencia en todos los jueces (con 3 o con 5): se ofrece la victoria absoluta.
- 2 rounds ganados: gana el combate (salvo Super lucha, donde se pelean siempre los 3 rounds).
- Empate en rounds: todos contra todos → empate; eliminación → menos advertencias → menos amonestaciones → round extra.
- La mesa central puede corregir el ganador del round antes de anunciarlo (Art. 16.3.4) y reabrir un combate cerrado.

Pruebas: `node --test tests/logic.test.mjs`

## Probar en un computador (modo local)

Sin Firebase configurado, la app funciona en **modo local**: todas las pestañas de un mismo navegador
se sincronizan entre sí (sirve para practicar, no entre celulares distintos).

```bash
python3 -m http.server 8000
```

Abrir http://localhost:8000

## Publicar en línea con Firebase (cuenta juecessandachile@gmail.com)

Proyecto: `juecessandachile-1fe23`. Base de datos: **Realtime Database** (su plan gratuito no cobra por
lectura; alcanza para más de 120 combates diarios).

1. **Authentication → Método de acceso → Anónimo → Habilitar.**
2. **Realtime Database → Crear base de datos** → ubicación Estados Unidos → modo bloqueado.
3. Pestaña **Reglas** → pegar el contenido de `database.rules.json` → **Publicar**.
4. La URL de la base (`https://...firebaseio.com`) va en `databaseURL` dentro de `js/firebase-config.js`.
   Sin `databaseURL`, la app funciona en modo local.

La página se publica con GitHub Pages (Settings → Pages → rama `main`, carpeta `/ (root)`)
o con `firebase deploy --only hosting`.

Las reglas hacen que solo la mesa que creó un combate pueda modificarlo, y que los jueces (1 a 5) solo puedan
escribir su tarjeta mientras el round está abierto.

### Límites del plan gratuito (Spark)

- Realtime Database: 100 conexiones simultáneas, 1 GB guardado y 10 GB descargados al mes.
- Cada dispositivo abierto (mesa, jueces, pantalla) es una conexión: con 7 por tatami alcanza para varias plataformas.
- La mesa central debe usar el mismo navegador durante todo el combate (la sesión anónima identifica al dueño).
