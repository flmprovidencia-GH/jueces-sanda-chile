# Jueces Sanda Chile — Puntuación en línea

App web para puntuar combates de Wushu Sanda (reglamento IWUF 2024) desde celulares.

## Cómo funciona

1. **Administrador** (por ejemplo, el jefe de jueces) crea los usuarios: `nombre.apellido` + PIN de 6 dígitos,
   con roles *Juez de línea*, *Mesa central* y/o *Administrador*.
2. Crea el **torneo** (hasta 3 plataformas), arma los **paneles** de jueces y pega el **programa** desde Google Sheets.
3. Cada **juez** entra con su usuario y PIN desde el celular y queda esperando.
4. La **mesa central** de cada plataforma asigna los puestos (Juez 1 a 5) o carga un panel con un clic.
   El celular del juez cambia solo a los botones ROJO / AZUL y sigue solo al siguiente combate.
5. Al terminar, queda el **acta** con el puntaje de cada juez y se pueden descargar los resultados en CSV.

| Pantalla | Enlace | Quién la usa |
|---|---|---|
| Inicio | `#/` | Torneos y accesos según el rol |
| Usuarios | `#/usuarios` | Administrador |
| Torneo | `#/torneo/ID` | Administrador: programa, paneles, resultados |
| Mesa de plataforma | `#/plataforma/ID/N` | Juez principal: puestos, programa, cronómetro, penalizaciones |
| Juez de línea | `#/juez` | Cada juez desde su celular |
| Pantalla pública | `#/pantalla/ID/N` | TV o proyector (no requiere usuario) |
| Acta | `#/acta/CÓDIGO` | Imprimible / PDF |

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

## Pruebas

- Reglas y lectura del programa: `node --test tests/*.test.mjs`
- Flujo completo con emuladores de Firebase: `bash tests/e2e/run.sh` (la app con `?emu=1` usa los emuladores).
- Reglas de seguridad: se generan con `python3 tools/build_rules.py` → `database.rules.json`.

## Publicar en línea con Firebase (cuenta juecessandachile@gmail.com)

Proyecto: `juecessandachile-1fe23`. Base de datos: **Realtime Database** (su plan gratuito no cobra por
lectura; alcanza para más de 120 combates diarios).

1. **Authentication → Método de acceso → Correo electrónico/contraseña → Habilitar.**
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
- Cualquier usuario con rol *Mesa central* puede manejar cualquier plataforma (si se cae un equipo, se entra desde otro).
- El PIN debe tener 6 dígitos (mínimo que exige Firebase). El administrador puede restablecerlo.
