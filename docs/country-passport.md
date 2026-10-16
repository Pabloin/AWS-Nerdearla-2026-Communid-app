# re:Invent · Pasaporte de países (beta 0.2.0)

La variante de países está habilitada únicamente para el tenant `reinvent`,
mediante la configuración simple `countryExperience` del código compartido.
Argentina y las otras experiencias conservan el pasaporte de personas/Heroes.
No se agregó un editor de módulos ni se migraron datos entre tenants.

## Participación

Al entrar, la persona elige país o territorio y acepta publicar su nombre y país.
Se genera un perfil público de participante con QR y una sesión privada de invitado.
El correo es opcional y no aparece en el directorio, el mapa ni el QR.
No se solicita GPS ni documentación: el país es declarado por la persona.

El participante puede corregir su nombre, país y correo en Mi perfil. Las sesiones
anteriores sin país siguen funcionando; deben completar país y permiso de
publicación para obtener su QR. Los perfiles creados desde Somos o el administrador
pueden llevar país, pero sus credenciales siguen siendo independientes del invitado.

## Reglas de la colección

- Un encuentro registra una persona y el país que tenía publicado en ese momento.
- El servidor obtiene el país del perfil; ignora cualquier país enviado por el cliente.
- Escanear dos personas del mismo país suma dos encuentros y un único país.
- Escanear repetidamente la misma persona conserva el primer registro.
- El QR propio no permite registrarse un encuentro a uno mismo.
- Cambios posteriores de país o eliminación del perfil no alteran los sellos guardados.
- Los registros y credenciales están aislados por tenant; no se admiten badges de Argentina.

El mapa permite zoom, selección y consulta de personas por país. Incluye una lista
accesible de países recolectados y el QR propio. El país de origen no suma por sí solo.
No se definieron premios ni una meta fija; esta variante no exige roles Hero/Builder.
Los encuentros se sincronizan con la API; no se agregó una cola offline.

## Datos y atribución

El listado de regiones proviene de `i18n-iso-countries` 7.14.0 (MIT); los nombres
se generaron en español con `Intl.DisplayNames` y quedaron versionados en
`shared/countries.js`. Incluye países y territorios del listado de la biblioteca.

El mapa usa `@svg-maps/world` 2.0.0, basado en
[MapSVG](https://mapsvg.com/maps/world), bajo
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
La atribución también aparece en la vista del mapa. Se adaptaron los colores
para mostrar la colección y se agrupan las islas menores del mismo código.
El mapa se carga bajo demanda en web y está incluido en el APK. Las fronteras
corresponden al dataset y su detalle es limitado en territorios pequeños.

## Publicación

Se actualiza el código de la Lambda `comunid-tenants-production-api`, dentro del
stack independiente de tenants. El validador de planes admite solamente cambios
de hash/código y metadatos calculados de esa Lambda exacta: no permite cambiar
su rol, entorno, runtime, handler, rutas ni otros recursos existentes.
El despliegue conserva la revisión de huella del plan y se ejecuta en Actions.

Las pruebas cubren consentimiento, correo privado, país falsificado, duplicados,
QR propio, cambio de país, persistencia de sellos y separación con Argentina.
El flujo visual se comprobó con un backend local en memoria y datos ficticios.
La cámara y QR nativos siguen requiriendo pruebas en un teléfono real.

## Publicación verificada · 16 de octubre de 2026

- Web: <https://reinvent.comunid.app>.
- [Plan revisado](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38941399018): cero altas, un cambio de código en la Lambda de tenants, cero eliminaciones.
- [Despliegue exitoso](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38941653568), commit `305d933485596a78660c8686d8164c1dfcadf4a8`.
- [APK 0.2.0 y lint exitosos](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38939126172), código de aplicación `42e112fe5c0dfb2abf372ecb6eea0dd1887ae63c`.
- [Descargar ZIP del APK](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38939126172/artifacts/12063120306).
- Tamaño del APK: 43.813.971 bytes. SHA-256: `a44d3962bf7eeddf7771732433ffad861fc2c1961c2a142238b5da28fcd7386a`.

Pasaron 59 pruebas de aplicación y ocho pruebas del validador del plan. Se
inspeccionó el APK en memoria, incluyendo su versión 0.2.0, application ID,
interfaz local y mapa incluido. Los tres frontends compilaron correctamente.

La API publicada reportó `collection=countries` en re:Invent y `collection=people`
en Argentina. Se comprobó el rechazo de países inválidos y falta de consentimiento
antes de persistir, sin crear participantes ficticios en producción. El formulario
de país quedó visible en el dominio público. El mapa, la edición de perfil y el QR
se probaron con datos locales en memoria, en escritorio y tamaño móvil.

La API original de Argentina conservó `eventId=nerdearla-2026`, y su distribución
`E2DYSZ3ARR9EVF` conservó el ETag `E2EUQ1WTGCTBG2`. Los dominios de tenants,
Argentina nueva y re:Invent devolvieron HTTPS 200. La cámara y QR de Android
continúan pendientes de validación en hardware real.
