# Video "Guía rápida · Jueces de línea" (~1 minuto)

Resultado: `docs/guia-jueces-de-linea.mp4` (1920×1080, 59 s, sin audio; textos en pantalla).

Para regenerarlo si cambia la app:
1. `capture.cjs` — con la app servida en `http://127.0.0.1:8766` y los emuladores de Firebase
   (ver `tests/e2e/run.sh`), captura las pantallas reales del celular del juez en `shots/`.
2. `slides.html` — las 15 escenas (texto y círculo de "toca aquí"). Servir esta carpeta en el puerto 8777
   y ejecutar `render.cjs` para obtener `frames/s00.png … s14.png`.
3. Unir con ffmpeg (fundidos de 0,35 s; duraciones por escena en el script de armado del historial de cambios):
   `ffmpeg -loop 1 -t … -i frames/s00.png … -filter_complex "…xfade…" -c:v libx264 -crf 20 guia-jueces-de-linea.mp4`
