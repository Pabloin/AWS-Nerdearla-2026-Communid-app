# Android · Comunid re:Invent

Primera beta Android, versión `0.1.0`, rama `feat/reinvent-android`.
Usa Capacitor 8 con la interfaz React empaquetada dentro del APK. El contenedor
Android, el escáner QR y la captura de fotos son nativos; las pantallas no están
reescritas en Kotlin. No carga una web remota como interfaz.

## Alcance

- Una sola experiencia: tenant `reinvent`, evento `reinvent-2026`.
- Aplicación `app.comunid.reinvent`, nombre `Comunid re:Invent`.
- Android 8.0/API 26 o superior; compilación/target API 36, Java 21.
- Flujo actual: invitado, perfil, Heroes, encuentros QR y pasaporte.
- Cámara mediante `@capacitor/camera`; QR mediante el plugin oficial
  `@capacitor/barcode-scanner`, usando ZXing.
- Botón Atrás, apertura de badges y restauración del resultado de cámara.
- Los QR compartidos apuntan a `https://reinvent.comunid.app/b/{id}`.
- Se rechazan QR de Argentina y otros hosts, aunque agreguen `?tenant=reinvent`.

La variante de países y el mapa mundial todavía no forman parte de esta beta.
Las selfies se muestran como parte del flujo actual; no se agregó almacenamiento
de esas imágenes en el backend. Las APIs requieren conexión; esta versión no
incluye una cola de encuentros offline.

## Construcción

```bash
npm ci
npm test
npm --workspace @comunid/mobile run android:sync
npm --workspace @comunid/mobile run android:open
```

`android:sync` fija el tenant y la API del stack independiente desde
`scripts/build-reinvent-android.mjs`; genera `front_mobile/dist-android` y copia
los recursos al proyecto Android. El build web normal conserva su comportamiento
por subdominio. Los artefactos Android no se publican en los buckets web.

Para compilar desde terminal, con Java 21 y el SDK instalado:

```bash
cd front_mobile/android
./gradlew assembleDebug lintDebug
```

El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.
El SDK y Android Studio no estaban instalados en la Mac al crear esta versión;
el workflow `.github/workflows/reinvent-android.yml` realiza la compilación
nativa en GitHub Actions y publica APK, SHA-256 e informe de lint como artefactos.
No requiere credenciales AWS ni claves de administración.

## Tenant y acceso

El tenant fue creado vacío el 16 de octubre de 2026 y se verificó el alcance
de su clave de administración. El alta se puede comprobar con el script idempotente:

```bash
python3 scripts/initialize-argentina.py --tenant reinvent
```

El nombre del script conserva compatibilidad con el alta anterior de Argentina.
Para re:Invent guarda una clave propia en Secrets Manager, `us-east-2`,
`comunid-tenants-production-reinvent-admin-token`. No imprime ni empaqueta claves.
El administrador web es `https://reinvent.comunid.app/admin/` y el registro de
perfiles es `https://reinvent.comunid.app/somos.html`.

## Enlaces y distribución

La app acepta el esquema `comunid-reinvent://b/{id}` y permite escanear los QR
HTTPS públicos desde su propio escáner. La apertura automática de enlaces HTTPS
desde otras aplicaciones requiere configurar Android App Links y publicar
`assetlinks.json` con el certificado de firma definitivo. No se configura una
asociación con un certificado debug efímero.

El artefacto inicial está firmado para depuración y sirve para pruebas por APK.
Cada runner puede generar una firma debug distinta; una beta anterior puede
requerir desinstalación antes de instalar otra. Desinstalar borra la sesión local.
Para Google Play falta definir la firma definitiva, generar el AAB y completar
la ficha y las pruebas de publicación. No se creó una cuenta Play ni se publicó
en una tienda.

## Pruebas en un teléfono

Antes de usarlo en el evento, comprobar en Android real:

1. Instalar, abrir y verificar que muestra re:Invent; crear un invitado de prueba.
2. Escanear un badge de re:Invent y comprobar el rechazo de uno de Argentina.
3. Capturar/cancelar una selfie y denegar/permitir la cámara.
4. Guardar un encuentro y comprobarlo después de cerrar y abrir la app.
5. Abrir un badge con el esquema propio y probar el botón Atrás.
6. Volver desde la cámara tras poner la app en segundo plano.
7. Probar desconexión, reconexión y errores con señal débil.

La compilación y las pruebas de aislamiento no sustituyen estas pruebas de
hardware. La versión web y la distribución de Argentina original se mantienen
fuera del workflow de Android.

Referencias: [Capacitor Android](https://capacitorjs.com/docs/android),
[Camera](https://capacitorjs.com/docs/apis/camera),
[Barcode Scanner](https://capacitorjs.com/docs/apis/barcode-scanner).

## Beta compilada y verificada · 16 de octubre de 2026

- Commit del APK: `0b1bad220469c1aba13169e093d9d3e424e8872f`.
- [Compilación exitosa y lint](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38929980349).
- [Descargar artefacto de la beta](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38929980349/artifacts/12058493313).
- ZIP: aproximadamente 30 MB; APK sin comprimir: 42.817.851 bytes.
- SHA-256 del APK: `5e1d054d30decdcc1c7cebb230dbe7da0fb2eaa9b0ed48edb486e825747a3699`.

Pasaron 54 pruebas automáticas y los builds web de los tres frontends.
Se inspeccionó el APK en memoria para comprobar su application ID, interfaz
local empaquetada, API de re:Invent, HTTP nativo y estilos de área segura.
El tenant respondió saludable con `eventId=reinvent-2026`. No se instaló un SDK
ni un emulador en la Mac; las pruebas con cámara y QR en hardware siguen pendientes.

El artefacto de Actions se conserva 30 días. Descargar y descomprimir el ZIP
para obtener `comunid-reinvent-0.1.0-debug.apk` e instalarlo en Android.
