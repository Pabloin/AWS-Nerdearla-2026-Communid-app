# Experiencias, tenants y subdominios

La rama `feat/multitenant` implementa un stack independiente
(`terraform/environments/tenants`) con un panel en `tenants.comunid.app` y una
aplicación por experiencia.

## Dirección acordada

**Un tenant = una experiencia.** Cada tenant tiene un subdominio, datos separados
y un acceso de administración propio. Para esta primera versión no se agrega
una jerarquía de organizaciones con múltiples eventos, equipos ni permisos
granulares. El campo técnico `eventId` existente identifica la experiencia del
tenant; no implica un segundo nivel de eventos administrables.

Argentina también será un tenant de la plataforma nueva, sin reemplazar la
aplicación de Argentina que funciona actualmente:

```text
Argentina actual · stack production · us-east-1
├── comunid.app
├── mobile.comunid.app / app.comunid.app
├── admin.comunid.app
└── hero.comunid.app / somos.comunid.app

Plataforma nueva · stack tenants · us-east-2
├── tenants.comunid.app       → panel de administración
├── argentina.comunid.app     → experiencia Argentina nueva
├── paraguay.comunid.app      → experiencia Paraguay
└── reinvent.comunid.app      → experiencia re:Invent
```

`tenants.comunid.app` y `argentina.comunid.app` están publicados.
El tenant re:Invent también está dado de alta. Su variante de países y Android
se desarrollan en `feat/reinvent-android`; Paraguay todavía no está dado de alta.
La Argentina nueva empieza con sus propios participantes, perfiles, pasaportes
y encuentros. No se copian datos ni cuentas desde Argentina actual, no se
redirigen sus dominios y no se reemplazan sus QR. Una eventual migración o
cambio de dominios sería un trabajo posterior, explícito y separado.

### Variantes simples de la aplicación

Las experiencias comparten registro, perfiles, QR, encuentros y progreso,
pero no tienen que mostrar exactamente las mismas pantallas. Se prevén dos
variantes iniciales, seleccionadas mediante configuración en el código:

| Variante | Experiencias previstas | Experiencia de colección |
| --- | --- | --- |
| Personas / Heroes | Argentina nueva | Tarjetas de personas, álbum y pasaporte. |
| Países | Paraguay y re:Invent | Países desbloqueados a partir de encuentros; mapa mundial para visualizar la colección. |

Heroes se separará internamente como componente de la variante de personas,
sin construir un sistema de módulos instalables o combinables desde un panel.
La ubicación en vivo es una capacidad independiente: una experiencia de Heroes
no obliga a compartir ubicación. El país usado por la colección y el mapa es
un dato del perfil del participante, no su posición GPS.

Por ahora quedan fuera el editor de módulos, los equipos y roles de administración,
la personalización visual avanzada y un constructor de reglas. El panel conserva
el alta y listado de tenants y un token de administración por tenant.

### Qué está preparado y qué falta

- Preparado en código: separación por tenant, panel básico de alta/listado,
  enlaces por subdominio y configuración del stack independiente.
- Publicado: panel y tenant Argentina vacío en el stack nuevo.
- Implementado para re:Invent: país de origen, QR propio y mapa de países recolectados
  (beta 0.2.0). Ver [pasaporte de países](country-passport.md).
- Pendiente: cargar participantes y separar la variante de Heroes. La aplicación preparada aún
  conserva lógica y pantallas de la experiencia original; no es un motor
  configurable de experiencias.
- Despliegue acordado: workflow exclusivo de GitHub Actions para tenants,
  usando el secreto Cloudflare existente y OIDC para AWS, con pruebas y revisión
  del plan antes de aplicar. El workflow está registrado en `.github/workflows/tenants.yml`; las ejecuciones y sus resultados quedan en Actions.

El siguiente hito es probar el flujo completo con participantes de Argentina
nueva y validar la variante de países de re:Invent. Argentina actual sigue operativa.

## Uso

Flujo del panel publicado. La primera experiencia usa el identificador
`argentina`; `cordoba` es solo un ejemplo adicional de tenant.

1. Entrar al panel con el token de administración de la plataforma nueva
   (Secrets Manager, `comunid-tenants-production-admin-token`, propio del nuevo stack).
2. Crear una comunidad con nombre, identificador y evento. El identificador
   define el subdominio y no se puede modificar desde este panel.
3. Guardar el token de organización mostrado una sola vez. La base guarda
   únicamente su SHA-256. No se incluye en enlaces ni en el build.
4. Compartir `https://cordoba.comunid.app` con participantes y
   `https://cordoba.comunid.app/somos.html` para publicar perfiles.
5. Organizar desde `https://cordoba.comunid.app/admin/`, usando el token de esa
   comunidad. Los enlaces privados de Heroes usan el mismo subdominio.

Los nombres de infraestructura (`www`, `app`, `mobile`, `admin`, `hero`,
`somos`, `tenants`, `api`, `mail`, `staging`, `production`, `default`) están reservados.
El panel permite crear y listar comunidades; edición, eliminación y recuperación
/ rotación del token quedan fuera de esta versión. Guardar el token es necesario.

## Aislamiento

El navegador resuelve la comunidad desde el hostname y usa las rutas API
`/t/{tenantId}/…`. El backend consulta el registro de comunidades antes de
procesar la petición y usa AsyncLocalStorage para mantener su contexto separado,
incluso en operaciones asíncronas concurrentes.

Todas las particiones de DynamoDB tienen el prefijo `TENANT#{tenantId}#`:

```text
TENANT#cordoba#EVENT#encuentro-2026 / PROFILE#alex
TENANT#cordoba#PLAYER#player-id    / ENCOUNTER#encuentro-2026#alex
TENANT#cordoba#GUEST#guest-id      / PROFILE
TENANT#cordoba#PROFILE#alex        / PHOTO
TENANT#cordoba#HERO#alex           / ACCESS o LOCATION
```

El registro usa `PK=TENANTS, SK=TENANT#{tenantId}` y solo se administra con
el token de plataforma. Los tokens de organización no administran otras
comunidades ni acceden al evento original. Los tokens Guest, Community y Hero
se verifican dentro de su partición. El código compartido `HERO` del evento
original no funciona en comunidades nuevas.

Cada comunidad tiene una colección Rekognition distinta:
`{coleccion-base}-tenant-{tenantId}`. Se crea al registrar su primer rostro
con consentimiento. Las búsquedas de una comunidad sin colección devuelven
cero coincidencias. La política IAM permite crear únicamente esas colecciones.

La compatibilidad de las rutas originales con los perfiles de demostración no
copia esos perfiles a los tenants. Las nuevas experiencias, incluida Argentina
nueva, empiezan vacías. Los QR incluyen el subdominio y la app rechaza
badges de otras comunidades. El almacenamiento del navegador está separado
por origen y además usa claves con el identificador de comunidad.

Las comunidades del nuevo stack comparten su propio User Pool de Cognito:
una persona puede usar esa cuenta en varias comunidades, con encuentros separados.
El User Pool de Argentina es otro: las cuentas actuales no se migran ni se reutilizan
automáticamente en el stack nuevo. Esta versión no agrega membresías
privadas, facturación ni personalización de marca. Los directorios son públicos
para perfiles con consentimiento, como en la aplicación original.

Las rutas originales conservan sus claves anteriores: no hay migración de los
participantes de Nerdearla ni movimiento de sus datos a un nuevo tenant.

## Infraestructura y publicación

El root `terraform/environments/tenants` usa `us-east-2` para Lambda, API Gateway,
DynamoDB, Cognito, Rekognition, Secrets Manager y S3. El prefijo de recursos
es `comunid-tenants-production`, distinto del de Argentina. Usa el estado
`comunid/tenants/terraform.tfstate`; nunca usar `comunid/production/terraform.tfstate`.
La región del bucket de estado puede seguir siendo `us-east-1`: no define
la región de la aplicación.

CloudFront es global. Su nuevo certificado ACM se crea mediante un provider
separado en `us-east-1`, como requiere
[AWS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html).
La nueva distribución sirve únicamente `tenants.comunid.app` y `*.comunid.app`.
No se agregan esos dominios a la distribución de Argentina. Los aliases exactos
existentes (como `mobile.comunid.app`, `somos.comunid.app` y `admin.comunid.app`)
tienen prioridad sobre el wildcard, según las
[reglas de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html).
Antes de publicar, confirmar que esos aliases siguen en la distribución actual
y que no existe otro wildcard en conflicto.

Hay una dependencia DNS explícita: ACM genera el mismo CNAME de validación
para `comunid.app` y `*.comunid.app` dentro de la misma cuenta. El nuevo stack
**no crea, importa ni modifica** el registro de validación raíz que administra
Argentina. Espera que ese registro existente valide el wildcard. Si no coincide,
la validación se detendrá y habrá que revisar el DNS antes de continuar. El
registro de validación de `tenants.comunid.app` y sus nuevos CNAME de servicio
sí pertenecen al nuevo stack. No reutilizar este supuesto para otra cuenta AWS.

Este aislamiento separa recursos y despliegues; no crea una frontera de permisos
entre cuentas. IAM y CloudFront son globales y la zona DNS y la cuenta AWS siguen
compartidas. Para aislar también las credenciales de infraestructura, usar otra
cuenta y revisar la estrategia DNS/certificados.

El camino de despliegue acordado es GitHub Actions, con un workflow y un
environment propios de tenants para registrar commit, ejecución, plan y resultado.
Se usa `COMUNID_CLOUDFLARE_API_TOKEN` dentro de Actions, sin extraer su valor
a una terminal local. El workflow de Argentina conserva su destino actual.
El workflow está preparado en `.github/workflows/tenants.yml`. Recibe el SHA
exacto del código de `feat/multitenant`. La primera ejecución usa `deploy=false`
y publica un resumen y una huella SHA-256 del plan. Para aplicar, una segunda
ejecución recibe el mismo commit, `deploy=true` y `reviewed_plan_sha` con la
huella revisada; rechaza diferencias. El ZIP de Lambda usa timestamps fijos para
que ambos planes sean comparables. No se publican archivos de estado ni secretos
como artefactos.

El acceso OIDC nuevo está definido en
`terraform-bootstrap/bootstrap-tenants-role.py`. La confianza se restringe al
repositorio y al environment `tenants`. El stack nuevo desactiva los roles CICD
administrativos generales y solo crea el rol de ejecución de su Lambda. La
política de bootstrap contempla recursos nuevos, estado exclusivo, certificados y
distribución nuevos, y deniega explícitamente cambios en la distribución,
función y certificado de Argentina. El rol reducido fue creado con autorización
explícita; no se reutilizaron los roles de despliegue de Argentina.

Los scripts locales quedan como herramienta manual alternativa. El camino
usado para publicar es Actions. Para preparar un plan local se
requieren las variables Cloudflare y GitHub indicadas en README:

```bash
./scripts/deploy-tenants.sh plan
```

El script comprueba la cuenta AWS `442809140287` con el perfil `sebas`, fija
el directorio y estado nuevos, compila y valida, y genera `tenants.tfplan`.
Por defecto solo planifica. Rechaza planes con modificaciones o eliminaciones
de recursos existentes. `TENANTS_AWS_REGION` permite otra región distinta de
`us-east-1`; `COMUNID_TENANTS_STATE_BUCKET` y `TENANTS_STATE_REGION` seleccionan
el bucket de estado sin cambiar la key exclusiva del nuevo stack.

Después de revisar el plan:

```bash
./scripts/deploy-tenants.sh apply
```

Este comando aplica únicamente el plan guardado y publica los frontends en el
bucket nuevo, usando su API y Cognito. Verifica los nombres de Lambda y bucket
antes de publicar. Está preparado para el alta inicial; actualizaciones posteriores
requieren un proceso de revisión que permita cambios en los recursos propios.
No ejecutar `deploy-production.sh` ni el workflow de Argentina para esta versión.
El alta inicial se completó con `scripts/initialize-argentina.py`, que genera
el token de plataforma y guarda el token de administración de Argentina nueva
en Secrets Manager. No imprime credenciales y es idempotente. El secreto
anterior de Argentina no sirve para este panel.

El backend responde OPTIONS y valida los orígenes existentes y subdominios HTTPS
de un nivel. API Gateway delega CORS a Lambda. Las rutas Cognito de encuentros
conservan su authorizer JWT dentro de la API nueva.

Las pruebas automáticas verifican dos comunidades con identificadores de datos
compartidos para detectar accesos cruzados. La comprobación del despliegue incluye
la API nueva, los subdominios y la distribución original de Argentina.

## Desarrollo y pruebas

Para probar sin DNS, usar `?tenant=cordoba` en los servidores locales. Con una
API configurada, la comunidad tiene que existir previamente. `VITE_TENANT_DOMAIN`
permite cambiar el dominio del frontend; el backend recibe `TENANT_DOMAIN`
desde Terraform.

```bash
npm run check
npm --workspace @comunid/backend run package
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/tenants validate
```

Las pruebas verifican accesos cruzados con el mismo evento, perfil y jugador;
tokens de plataforma y tenant; invitados; fotos; ubicaciones; QR; colecciones
faciales; preflight; paginación; y contextos concurrentes. AWS se simula en
estas pruebas, sin modificar infraestructura ni datos reales.


## Recuperación del primer apply

El workflow se registró mediante el PR #1 y el usuario autorizó crear el rol OIDC
reducido. El primer apply de Actions creó parte del stack nuevo y se detuvo por
permisos dependientes que AWS exige: lectura de code-signing de Lambda,
DescribeFunction de CloudFront, etiquetado ACM/Cognito y el endpoint de tags de
API Gateway v2. No modificó Argentina ni llegó a publicar la plataforma.

Terraform marcó como tainted la Lambda `comunid-tenants-production-api` y la
función `comunid-tenants-production-section-routes`, creadas por esa ejecución.
El validador contempla su recreación únicamente con esos nombres e IDs exactos
y el motivo `replace_because_tainted`; sigue rechazando eliminaciones simples,
updates y reemplazos de otros recursos. La ampliación mínima de permisos y esa
recuperación fueron autorizadas explícitamente y se ejecutaron. Los datos
actuales de Argentina no participan en este proceso.

AWS exigió además `apigateway:TagResource` para el stage de la API nueva
`p152jvhrf7` y `cloudfront:CreateDistribution`/`TagResource` como dependencias
de crear la distribución con tags. Se incorporaron en el commit `dd1e9b4`,
limitando el etiquetado de API al ID nuevo y la distribución a
`Project=comunid-tenants`. Se agregó una denegación explícita de etiquetado
sobre la distribución original de Argentina.


## Publicación verificada · 15 de octubre de 2026

- Código desplegado: `dd1e9b48e6994a20b77e05b34fd444befabf213f`, rama `feat/multitenant`.
- [Plan revisado](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38811937766): cinco altas pendientes, cero modificaciones y cero eliminaciones.
- [Despliegue exitoso](https://github.com/Pabloin/AWS-Nerdearla-2026-Communid-app/actions/runs/38816858988): infraestructura y frontends publicados desde Actions.
- Panel: <https://tenants.comunid.app>.
- Argentina nueva: <https://argentina.comunid.app>; administración: <https://argentina.comunid.app/admin/>; alta de perfiles: <https://argentina.comunid.app/somos.html>.
- API nueva: `https://p152jvhrf7.execute-api.us-east-2.amazonaws.com`.
- Distribución nueva: `E166FHNMUYSS18` (`d39uzcykti94uv.cloudfront.net`).

Las credenciales se generaron en el alta inicial desde el script local, después
de finalizar Actions; infraestructura y publicación se ejecutaron en Actions.
Están en AWS Secrets Manager, cuenta `442809140287`, región `us-east-2`:

| Acceso | Nombre del secreto |
| --- | --- |
| Panel de plataforma | `comunid-tenants-production-admin-token` |
| Administración de Argentina nueva | `comunid-tenants-production-argentina-admin-token` |

Para entrar al panel o al administrador, recuperar el valor del secreto
correspondiente desde la consola AWS con una identidad autorizada. No guardarlo
en GitHub, URLs, documentos o capturas. El workflow OIDC no puede leer estos valores.

Verificación realizada: 38 pruebas de aplicación, siete pruebas del validador de
planes, builds, API saludable, panel y entrada de Argentina visibles en navegador.
El alta comprobó Argentina sin perfiles, token de Argentina válido dentro de su
tenant y rechazado por el registro global, y tenant inexistente con HTTP 404.
No se crearon participantes de prueba ni se copiaron datos anteriores.

La distribución original `E2DYSZ3ARR9EVF` conservó su ETag
`E2EUQ1WTGCTBG2` y todos sus aliases. Su API respondió saludable con
`eventId=nerdearla-2026`. Los dominios originales se comprobaron por HTTPS.
Ese primer despliegue correspondió a la experiencia de personas. La variante
de países se implementó después para re:Invent; ver `country-passport.md`.

## re:Invent · Beta 0.2.0 publicada

El 16 de octubre se publicó la variante de países del tenant `reinvent` y se generó
su APK Android. Incluye registro con país, QR de participante y mapa de países
recolectados. La actualización cambió solo código de la Lambda nueva y frontends
del stack tenants; Argentina conserva su variante de personas.
[Ver reglas, pruebas y enlaces de publicación](country-passport.md).
