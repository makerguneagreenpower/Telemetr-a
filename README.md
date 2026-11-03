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

## Consultar datos

La vista inicial «Resumen general» muestra solo la tabla de la sesión. «Coche · componentes» usa una imagen de referencia generada con zonas pulsables y un menú de tres puntos para abrir Motor (temperatura y rpm), Baterías (temperatura), Ruedas (rpm) y GPS (velocidad y mapa). La selección de coche, jornada, sesión y piloto se conserva al pasar de un componente a otro. La imagen no es una fotografía de los coches reales de MGRT.

## Cuenta, pilotos y carreras

/acceso proporciona el acceso real con ChatGPT y cierre de sesión; Google sigue pendiente. Eliminar un piloto desactiva su nombre en el listado de la cuenta mediante D1, sin borrar ni anonimizar las muestras históricas. Cada gráfico incluye una tabla compacta de muestras cercanas a la seleccionada. /carreras muestra todas las sesiones de jornadas de carrera (entrenamientos incluidos), ordenadas por fecha descendente y fases F24+/F24. El archivo pagina metadatos y recupera cada documento completo al abrirlo; permite descargarlos como JSON. Cada consulta y eliminación requiere identidad y comprueba el propietario.


## Tema y vista Carrera

El botón de la esquina inferior derecha cambia entre el tema claro y el oscuro en todas las páginas. La preferencia se conserva en este navegador; solo se guarda la preferencia visual, no la telemetría.

«Carrera» (`/carrera`) muestra una **carrera 3D simulada compartida**, sin conexión a hardware, con un coche blanco y otro negro/rojo compitiendo en el mismo circuito. Ambos parten de la parrilla y avanzan con un modelo simplificado de aceleración, frenada, potencia y velocidad en curvas. Un único reloj integra el movimiento a 60 pasos por segundo: la escena, el mapa con dos marcadores, la clasificación por distancia y los cronos de vuelta comparten ese estado. Hay cámaras conjunta, a bordo de cada coche y aérea. La pausa, continuación y reinicio afectan a toda la carrera. La pestaña en segundo plano no provoca un salto de minutos al regresar. Three.js se carga bajo demanda al entrar en Carrera y libera recursos al salir; si WebGL no está disponible, la carrera continúa visible en el mapa.

Las dos pantallas de telemetría permanecen visibles, en columnas o apiladas según el ancho. Muestran temperatura del motor, temperatura de las dos baterías, velocidad en km/h y consumo acumulado en Wh integrado desde la potencia eléctrica. Los límites estrictos y las alertas rojas se mantienen: motor >50 °C, baterías >40 °C, velocidad >40 km/h y energía >7 Wh. La instrumentación muestra acelerador, freno, dirección y RPM estimadas. El modelo no está calibrado contra un coche real; las lecturas no se guardan ni se mezclan con sesiones importadas. El antiguo clip de referencia no se usa en la carrera compartida.


## Otros equipos

«Otros equipos» (`/otros-equipos`) consulta las competiciones públicas de [NS Service](https://test.ns-service.es/competiciones.php). Permite buscar competiciones y filtrar por año; dentro de cada competición, seleccionar la prueba y buscar por equipo, centro o dorsal, filtrar categorías y ordenar por posición, nombre, velocidad o distancia. Los resultados incluyen vueltas, tiempos, mejor vuelta, distancia, velocidad y las incidencias publicadas. Las inscripciones sin resultado permanecen identificadas como tales.

El listado de competiciones se obtiene desde una ruta propia con un destino fijo y un tiempo de espera limitado. Los resultados se reciben mediante Socket.IO desde la misma fuente pública que utiliza la web original. Se muestra la última recepción y el estado de conexión; una interrupción conserva los últimos datos válidos e indica el error. «Actualizar» vuelve a consultar el listado y a conectar con los resultados. La consulta depende de la disponibilidad de NS Service y no proporciona telemetría privada de los equipos. El cliente de resultados se carga al abrir esta sección.


### Comparativa y conclusiones de otros equipos

Cada competición incluye un resumen calculado de todas sus pruebas, independiente de los filtros y la paginación. El ritmo medio se obtiene de la distancia y el tiempo publicados; se separan las pruebas y, en entrenamientos mixtos, las categorías de la fuente. Se muestran líderes y empates, la mejor vuelta y el número de inscripciones comparables. Las descalificaciones no se consideran líderes y las incidencias se señalan.

La fuente no facilita energía en Wh: no se identifica un supuesto mayor consumidor ni se deduce gasto a partir de velocidad o distancia. Esta limitación también se incluye en las instrucciones de IA.

El botón «Generar conclusiones» usa la [Responses API de OpenAI](https://developers.openai.com/api/docs/guides/text), con `gpt-5.4-mini` por defecto (configurable mediante `OPENAI_MODEL`). Para activarlo, configura `OPENAI_API_KEY` **solo en el servidor**: en desarrollo con Cloudflare puede añadirse a `.dev.vars` en la raíz del proyecto y reiniciar `npm run dev`; en alojamiento, utilizar un secreto del servidor. `.dev.vars*` y `.env*` están excluidos de Git. No incluyas la clave en variables `NEXT_PUBLIC_*` ni en el navegador.

La generación requiere iniciar sesión y se ejecuta únicamente al pulsar el botón. Se envía el resumen de resultados de la competición seleccionada, con `store: false`. El informe identifica la lectura y la hora utilizadas, no se regenera en cada actualización y se cancela al abandonar la competición. Sin configurar la clave, la interfaz indica «IA pendiente de conexión» y ofrece el resumen calculado; no presenta ese resumen como texto generado por un modelo. El análisis de pilotos en `/api/analyze` sigue siendo independiente y permanece pendiente.
