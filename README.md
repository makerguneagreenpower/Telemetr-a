# MakerGunea Racing Team · MGRT

Dos coches físicos (Coche 1 y Coche 2, nombres provisionales) participan en ambas categorías. Cada jornada sigue este orden: entrenamientos F24+, carrera F24+, entrenamientos F24 y carrera F24. Cada fase admite sesiones de los dos coches. La importación guarda coche, categoría, tipo de sesión y fecha de jornada por separado. Los filtros y los ejemplos representan las ocho combinaciones de coche/fase. La opción «Días de prácticas» permite registrar entrenamientos normales de cada coche por fecha, sin categoría F24/F24+ ni fases de carrera. El contexto de la sesión se guarda en D1; las sesiones anteriores conservan el contexto de jornada de carrera. Las sesiones previas se conservan en «Sin clasificar»; no se inventa su coche, fecha o tipo.

Panel en español con tema negro, rojo y blanco. Incluye portada, datos de ejemplo identificados, importación CSV/Excel/JSON, gráfico de velocidad GPS con media ponderada por tiempo, reproducción GPS, tabla y comparación de pilotos.

## Desarrollo

Node.js 22.13 o superior. Ejecuta `npm install` y `npm run dev`. `npm run db:generate` genera las migraciones; `npm run build` produce el Worker. El alojamiento provisiona D1 (`DB`) y R2 (`BUCKET`). Las muestras importadas se guardan en R2, con metadatos y propietario en D1. Cada cuenta solo puede consultar sus sesiones.

## Circuitos 3D

En «Crear circuito», dibuja o importa el recorrido con coordenadas geográficas y pulsa «Cargar entorno real». La vista muestra el relieve Copernicus (~90 m) de Open-Meteo y los edificios y usos del suelo disponibles en OpenStreetMap; necesita conexión a internet y atribuye ambas fuentes. Los datos del entorno se consultan al abrir la vista y no se guardan con el circuito. Los recorridos trazados solo sobre una imagen no tienen ubicación geográfica para consultar edificios y terreno.

El apartado «Simulador» permite conducir el coche 3D Greenpower por un circuito guardado o el de demostración. Usa ↑ para acelerar, ↓ o espacio para frenar y ←/→ para girar (también W/A/S/D), o selecciona volante/Gamepad compatible con Gamepad API del navegador; dirección, acelerador y freno se leen del primer dispositivo conectado. Si el coche sale del trazado, aparece un aviso; volver a la pista cancela la cuenta atrás. Si permanece fuera durante 5 segundos, ambos coches y la carrera se reinician desde cero. Simulación arcade sin conexión al coche real.

## Meter datos

La sección «Meter datos» ofrece documento o entrada manual. Ambos métodos crean una nueva sesión con fecha, coche y contexto. El documento se valida y muestra una vista previa antes de pulsar «Guardar sesión». La entrada manual permite añadir, editar y eliminar filas; los datos permanecen en el formulario si falla el guardado. Se utiliza la misma validación y almacenamiento D1/R2.

## Archivos

Descarga la plantilla CSV desde «Meter datos». Columnas obligatorias: `tiempo` (segundos desde inicio, único), `piloto`, `velocidad_gps` (km/h). Opcionales: `temperatura_motor`, `temperatura_bateria` (°C), `rpm_motor`, `rpm_rueda`, `latitud`, `longitud`. Máximo 5 MB y 10.000 muestras. CSV admite delimitador detectado automáticamente; Excel lee primera hoja; JSON acepta una lista o `{ "samples": [...] }`. El informe numérico no estima consumo eléctrico porque no se aportan corriente ni tensión.

## Funciones pendientes de conexión

- Google: la plataforma de Sites admite aquí autenticación de ChatGPT. No se ha implementado una sesión de Google falsa. Integrar Google requiere confirmar soporte del proveedor de OAuth en el alojamiento o migrar a un alojamiento autorizado que permita Google OAuth. Se necesitan client ID, secreto, URL de callback y verificación de identidad en servidor.
- IA: el usuario eligió habilitar OpenAI Developers más adelante. `/api/analyze` devuelve explícitamente un estado pendiente. No llama a una IA ni presenta cálculos como informes de IA. Al habilitarlo, configurar clave como secreto del servidor y añadir análisis por piloto sobre datos autorizados.
- Telemetría en directo: el panel reproduce archivos y no tiene conexión con hardware. El mapa de demostración es un recorrido simulado, no un circuito real.

El mapa base usa CARTO/OpenStreetMap; si la red falla, el recorrido sigue visible. Los datos privados no se guardan en localStorage. El sitio se publica privado por defecto.

## Consultar datos

La vista inicial «Resumen general» muestra solo la tabla de la sesión. «Coche · componentes» usa una imagen de referencia generada con zonas pulsables y un menú de tres puntos para abrir Motor (temperatura y rpm), Baterías (temperatura), Ruedas (rpm) y GPS (velocidad y mapa). La selección de coche, jornada, sesión y piloto se conserva al pasar de un componente a otro. La imagen no es una fotografía de los coches reales de MGRT.

## Cuenta, pilotos y carreras

/acceso proporciona el acceso real con ChatGPT y cierre de sesión; Google sigue pendiente. Eliminar un piloto desactiva su nombre en el listado de la cuenta mediante D1, sin borrar ni anonimizar las muestras históricas. Cada gráfico incluye una tabla compacta de muestras cercanas a la seleccionada. /carreras muestra todas las sesiones de jornadas de carrera (entrenamientos incluidos), ordenadas por fecha descendente y fases F24+/F24. El archivo pagina metadatos y recupera cada documento completo al abrirlo; permite descargarlos como JSON. Cada consulta y eliminación requiere identidad y comprueba el propietario.


## Tema y vista Carrera

El botón de la esquina inferior derecha cambia entre el tema claro y el oscuro en todas las páginas. La preferencia se conserva en este navegador; solo se guarda la preferencia visual, no la telemetría.

«Carrera» (`/carrera`) muestra una carrera 3D simulada compartida, sin conexión a hardware. El HUD de diseño propio superpone en cámara el circuito, clasificación, velocidad, temperaturas, cronos y energía por vuelta. El coche MGRT puede acompañarse de una sesión importada de Telemetría: sus muestras se muestran con el tiempo de carrera; el rival usa valores plausibles generados por la simulación y se identifica como simulado. Las últimas vueltas y mejores tiempos proceden del mismo estado que la escena, el mapa y la clasificación. «Carrera terminada» guarda una repetición reproducible en la cuenta del equipo. Las muestras se capturan aproximadamente cada segundo.

Las dos pantallas de telemetría muestran motor, batería, velocidad, acelerador, freno, dirección y RPM estimadas. La energía se expresa en Wh por vuelta: se reinicia al cruzar la meta y también se conserva el valor de la vuelta anterior, no un total acumulado de toda la carrera. La repetición incluye muestras de ambos coches, el circuito y una referencia opcional a una sesión importada.

## Base de datos del equipo

La sección «Base de datos» agrupa las repeticiones por evento y sesión, resume los datos importados por coche y compara carreras, coches y circuitos únicamente con elementos del mismo tipo. Las repeticiones se reproducen en la escena 3D y permiten recorrer las muestras. D1 guarda metadatos y estadísticas; R2 conserva el circuito completo, la telemetría de la repetición y los datos de circuitos. Las consultas y escrituras requieren iniciar sesión y filtran por propietario. Los circuitos creados anteriormente permanecen en IndexedDB local; los guardados desde Circuitos con sesión iniciada también se sincronizan con D1/R2.


## Otros equipos

«Otros equipos» (`/otros-equipos`) consulta las competiciones públicas de [NS Service](https://test.ns-service.es/competiciones.php). Permite buscar competiciones y filtrar por año; dentro de cada competición, seleccionar la prueba y buscar por equipo, centro o dorsal, filtrar categorías y ordenar por posición, nombre, velocidad o distancia. Los resultados incluyen vueltas, tiempos, mejor vuelta, distancia, velocidad y las incidencias publicadas. Las inscripciones sin resultado permanecen identificadas como tales.

El listado de competiciones se obtiene desde una ruta propia con un destino fijo y un tiempo de espera limitado. Los resultados se reciben mediante Socket.IO desde la misma fuente pública que utiliza la web original. Se muestra la última recepción y el estado de conexión; una interrupción conserva los últimos datos válidos e indica el error. «Actualizar» vuelve a consultar el listado y a conectar con los resultados. La consulta depende de la disponibilidad de NS Service y no proporciona telemetría privada de los equipos. El cliente de resultados se carga al abrir esta sección.


### Comparativa y conclusiones de otros equipos

Cada competición incluye un resumen calculado de todas sus pruebas, independiente de los filtros y la paginación. El ritmo medio se obtiene de la distancia y el tiempo publicados; se separan las pruebas y, en entrenamientos mixtos, las categorías de la fuente. Se muestran líderes y empates, la mejor vuelta y el número de inscripciones comparables. Las descalificaciones no se consideran líderes y las incidencias se señalan.

La fuente no facilita energía en Wh: no se identifica un supuesto mayor consumidor ni se deduce gasto a partir de velocidad o distancia. Esta limitación también se incluye en las instrucciones de IA.

El botón «Generar conclusiones» usa la [Responses API de OpenAI](https://developers.openai.com/api/docs/guides/text), con `gpt-5.4-mini` por defecto (configurable mediante `OPENAI_MODEL`). Para activarlo, configura `OPENAI_API_KEY` **solo en el servidor**: en desarrollo con Cloudflare puede añadirse a `.dev.vars` en la raíz del proyecto y reiniciar `npm run dev`; en alojamiento, utilizar un secreto del servidor. `.dev.vars*` y `.env*` están excluidos de Git. No incluyas la clave en variables `NEXT_PUBLIC_*` ni en el navegador.

La generación requiere iniciar sesión y se ejecuta únicamente al pulsar el botón. Se envía el resumen de resultados de la competición seleccionada, con `store: false`. El informe identifica la lectura y la hora utilizadas, no se regenera en cada actualización y se cancela al abandonar la competición. Sin configurar la clave, la interfaz indica «IA pendiente de conexión» y ofrece el resumen calculado; no presenta ese resumen como texto generado por un modelo. El análisis de pilotos en `/api/analyze` sigue siendo independiente y permanece pendiente.


## Circuitos de cada carrera

La sección **Circuitos** (`/circuitos`) prepara recorridos para la simulación de los dos coches. Cada circuito tiene nombre, competición, ancho de pista, meta y sentido. La biblioteca se guarda en IndexedDB del navegador; la selección activa se recuerda localmente. Al guardar con la cuenta iniciada, una copia se sincroniza con D1/R2 y aparece en «Base de datos». Exporta el JSON para compartirlo o conservar una copia adicional.

- **Imagen:** sube PNG/JPG/WebP de hasta 6 MB, marca dos puntos A–B e introduce una distancia conocida en metros. Traza la línea central en orden; puedes arrastrar, eliminar, deshacer, invertir el sentido y elegir otro punto como meta. La escala permite reproducir la longitud, pero la precisión depende del plano y de la calibración. La imagen original y la calibración se incluyen en el JSON.
- **Mapa:** sitúa el editor por latitud/longitud y marca el recorrido sobre OpenStreetMap. Puede abrirse la ubicación en Google Maps.
- **Google Earth / My Maps:** dibuja una ruta por el centro de la pista y exporta como KML sin comprimir. Importa el `.kml` y, si hay varias líneas, elige la que corresponde a la carrera. También se admiten GeoJSON (LineString, MultiLineString y perímetro exterior Polygon) y copias JSON propias. Los KMZ deben exportarse como KML o descomprimirse antes de importar.

**Guardar y probar con los dos coches** abre Carrera con el circuito seleccionado. Allí puedes cambiar entre la demostración y los circuitos guardados; cambiar de pista reinicia ambos coches. El mismo trazado y su longitud alimentan la escena 3D, el mapa, la física, el progreso y los cronos. La proyección geográfica local y el modelo son aproximaciones: no se reconstruyen automáticamente edificios, relieve ni elevaciones a partir del KML o de una imagen. El JSON conserva todos los datos del editor; la exportación KML está disponible para recorridos con coordenadas geográficas.

Referencias de exportación: [Google Earth](https://developers.google.com/maps/documentation/earth/quickstart) y [Google My Maps](https://support.google.com/mymaps/answer/3109452?hl=es).

Comprobación de geometría, escala, importación GeoJSON y simulación: `node scripts/check-circuits.cjs` desde la carpeta del proyecto.
