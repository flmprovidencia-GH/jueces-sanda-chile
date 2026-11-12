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

1. Entrar a https://console.firebase.google.com con la cuenta de Gmail → **Agregar proyecto**
   (nombre sugerido: `juecessandachile`). Google Analytics no es necesario.
2. **Compilación → Authentication → Comenzar → Anónimo → Habilitar.**
3. **Compilación → Firestore Database → Crear base de datos** → ubicación `southamerica-east1` (São Paulo) →
   modo producción.
4. **Configuración del proyecto (⚙️) → Tus apps → Web (`</>`)** → registrar la app → copiar el bloque
   `firebaseConfig` y pegarlo en `js/firebase-config.js`.
5. Publicar (en un computador con Node.js):

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

Queda en `https://<proyecto>.web.app`. Las reglas de seguridad (`firestore.rules`) hacen que solo la mesa
que creó un combate pueda modificarlo; los jueces solo pueden escribir su propia tarjeta mientras el round está abierto.
