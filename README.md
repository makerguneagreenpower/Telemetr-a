# MakerGunea Racing Team · MGRT

Dos coches físicos (Coche 1 y Coche 2, nombres provisionales) participan en ambas categorías. Cada jornada sigue este orden: entrenamientos F24+, carrera F24+, entrenamientos F24 y carrera F24. Cada fase admite sesiones de los dos coches. La importación guarda coche, categoría, tipo de sesión y fecha de jornada por separado. Los filtros y los ejemplos representan las ocho combinaciones de coche/fase. La opción «Días de prácticas» permite registrar entrenamientos normales de cada coche por fecha, sin categoría F24/F24+ ni fases de carrera. El contexto de la sesión se guarda en D1; las sesiones anteriores conservan el contexto de jornada de carrera. Las sesiones previas se conservan en «Sin clasificar»; no se inventa su coche, fecha o tipo.

Panel en español con tema negro, rojo y blanco. Incluye portada, datos de ejemplo identificados, importación CSV/Excel/JSON, gráfico de velocidad GPS con media ponderada por tiempo, reproducción GPS, tabla y comparación de pilotos.

## Desarrollo

Node.js 22.13 o superior. Ejecuta `npm install` y `npm run dev`. `npm run db:generate` genera las migraciones; `npm run build` produce el Worker. El alojamiento provisiona D1 (`DB`) y R2 (`BUCKET`). Las muestras importadas se guardan en R2, con metadatos y propietario en D1. Cada cuenta solo puede consultar sus sesiones.

## Meter datos

La sección «Meter datos» ofrece documento o entrada manual. Ambos métodos crean una nueva sesión con fecha, coche y contexto. El documento se valida y muestra una vista previa antes de pulsar «Guardar sesión». La entrada manual permite añadir, editar y eliminar filas; los datos permanecen en el formulario si falla el guardado. Se utiliza la misma validación y almacenamiento D1/R2.

## Archivos

Descarga la plantilla CSV desde «Meter datos». Columnas obligatorias: `tiempo` (segundos desde inicio, único), `piloto`, `velocidad_gps` (km/h). Opcionales: `temperatura_motor`, `temperatura_bateria` (°C), `rpm_motor`, `rpm_rueda`, `latitud`, `longitud`. Máximo 5 MB y 10.000 muestras. CSV admite delimitador detectado automáticamente; Excel lee primera hoja; JSON acepta una lista o `{ "samples": [...] }`. El informe numérico no estima consumo eléctrico porque no se aportan corriente ni tensión.

## Funciones pendientes de conexión

- Google: la plataforma de Sites admite aquí autenticación de ChatGPT. No se ha implementado una sesión de Google falsa. Integrar Google requiere confirmar soporte del proveedor de OAuth en el alojamiento o migrar a un alojamiento autorizado que permita Google OAuth. Se necesitan client ID, secreto, URL de callback y verificación de identidad en servidor.
- IA: el usuario eligió habilitar OpenAI Developers más adelante. `/api/analyze` devuelve explícitamente un estado pendiente. No llama a una IA ni presenta cálculos como informes de IA. Al habilitarlo, configurar clave como secreto del servidor y añadir análisis por piloto sobre datos autorizados.
- Telemetría en directo: el panel reproduce archivos y no tiene conexión con hardware. El mapa de demostración es un recorrido simulado, no un circuito real.

El mapa base usa CARTO/OpenStreetMap; si la red falla, el recorrido sigue visible. Los datos privados no se guardan en localStorage. El sitio se publica privado por defecto.
