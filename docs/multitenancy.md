# Experiencias, tenants y subdominios

La rama `feat/multitenant` prepara un stack independiente
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

Los subdominios nuevos son destinos previstos, no despliegues ya publicados.
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
- Pendiente: crear y cargar el tenant Argentina, separar la variante de Heroes
  y desarrollar la variante de países y su mapa. La aplicación preparada aún
  conserva lógica y pantallas de la experiencia original; no es un motor
  configurable de experiencias.
- Despliegue acordado: workflow exclusivo de GitHub Actions para tenants,
  usando el secreto Cloudflare existente y OIDC para AWS, con pruebas y revisión
  del plan antes de aplicar. Ese workflow todavía no está implementado ni ejecutado.

El siguiente hito es validar Argentina como primer tenant del stack nuevo,
manteniendo Argentina actual operativa, y después incorporar la variante de países.

## Uso

Flujo del panel básico una vez desplegado. Para la primera experiencia se usará
el identificador `argentina`; `cordoba` es solo un ejemplo adicional de tenant.

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
Se usará `COMUNID_CLOUDFLARE_API_TOKEN` dentro de Actions, sin extraer su valor
a una terminal local. El workflow de Argentina conserva su destino actual.
La implementación de ese workflow está pendiente.

Los scripts locales ya preparados quedan como herramienta manual alternativa;
no representan un despliegue ya ejecutado. Para preparar un plan local se
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
Configurar un token aleatorio en `comunid-tenants-production-admin-token` después
del alta; el secreto anterior de Argentina no sirve para este panel.

El backend responde OPTIONS y valida los orígenes existentes y subdominios HTTPS
de un nivel. API Gateway delega CORS a Lambda. Las rutas Cognito de encuentros
conservan su authorizer JWT dentro de la API nueva.

Estos cambios son locales: no se ejecutó un plan contra AWS, no se aplicó
infraestructura ni se publicó DNS. Después del despliegue hacen falta pruebas
reales con dos comunidades y comprobación de los dominios originales.

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
