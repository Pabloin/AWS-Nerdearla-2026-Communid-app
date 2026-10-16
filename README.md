# Comunid

Comunid is a mobile-first event experience for discovering the people who build
a technology community. Participants meet someone, scan their QR badge, unlock
their story, and complete community quests.

The first vertical slice is implemented:

```text
discover a builder
  -> scan their badge (camera or local demo)
  -> validate the profile
  -> record an idempotent encounter
  -> unlock the card
  -> update collection and quest progress
```

## Repository

```text
front_home/                   Public Comunid landing page (Vite)
front_mobile/                 React + Vite event companion app
front_admin/                  Private organizer studio for face review
backend/                      Node.js Lambda API and domain tests
terraform/modules/apps/       S3, CloudFront, ACM, and Route 53
terraform/modules/storage/    DynamoDB and private media bucket
terraform/modules/api/        Lambda, IAM, and API Gateway
terraform/modules/cicd/       GitHub OIDC application role
terraform/modules/comunid/    reusable architecture composition
terraform/environments/       production root (legacy staging config retained)
.github/workflows/            CI and deployment foundations
```

## Local development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev:home
```

Open `http://127.0.0.1:5191` to view the public landing page. In a second
terminal, run `npm run dev:mobile` and open `http://127.0.0.1:5190` to explore
the event app. The app works without AWS using curated profiles and local
browser storage. Attendees can start as guests with only a name; with an API
configured, their guest profile and encounters are stored in DynamoDB and a
private access token remains in that browser. Existing Cognito users can still
sign in inside the app. Camera scanning
requires browser permission; the scan screen includes demo badges for local
development.

Run `npm run dev:admin` for the organizer studio at `http://127.0.0.1:5192`.
Enter a deployed API URL and the admin token to use face detection. The studio
needs AWS Rekognition and a configured admin secret; its interface can be
previewed locally before those resources are available.

The deployment keeps the three frontends in one web bucket. Production serves
the landing page at `comunid.app`, the mobile app at `mobile.comunid.app`, and
the organizer studio at `admin.comunid.app`. The private hero broadcaster is at
`hero.comunid.app`. The `/app/` and `/admin/` paths
remain available on the root domain. `www.comunid.app` redirects to the root.

Run all checks:

```bash
npm run check
```

## API

The Lambda exposes:

- `GET /health`
- `GET /profiles`
- `POST /profiles` (disabled unless an administrator token is configured)
- `GET /profiles/{id}`
- `GET /profiles/{id}/qr`
- `POST /encounters`
- `GET /me/encounters`
- `GET /players/{id}/encounters` (only for the authenticated player)
- `POST /guests` — creates a guest passport from a name
- `GET /guests/me`, `GET /guests/me/encounters`, `POST /guests/me/encounters` — guest access using its private token
- `PUT /guests/me/contact`, `DELETE /guests/me/contact` — optional email opt-in after five encounters, and withdrawal
- `GET /heroes/live` — currently shared hero locations, visible for two minutes after the last update
- `GET /heroes/me`, `PUT /heroes/me/location`, `DELETE /heroes/me/location` — private hero link required
- `PUT /community/me/profile` — lets a registered community member update their public name
- `GET /admin/session` and `GET /admin/profiles`
- `POST /admin/profiles`
- `POST /admin/heroes/{profileId}/link` — issues or rotates a private location-sharing link for a consented Hero profile
- `PUT /admin/profiles/{id}/face-consent` — records or withdraws facial consent
- `POST /admin/detect-faces` — finds faces in a photo without saving them
- `POST /admin/faces` — indexes one reviewed face for a consented profile
- `GET /admin/profiles/{id}/faces` and `DELETE /admin/profiles/{id}/faces/{faceId}`
- `POST /admin/search-faces` — checks a reviewed face against the collection

The DynamoDB access pattern uses one table:

```text
PK=EVENT#{eventId}   SK=PROFILE#{profileId}
PK=PLAYER#{playerId} SK=ENCOUNTER#{eventId}#{profileId}
PK=GUEST#{guestId}   SK=PROFILE
PK=PROFILE#{profileId} SK=FACE#{faceId}
PK=REKOGNITION_USER#{userId} SK=PROFILE
```

That encounter key makes a repeated scan idempotent for the same player, event,
and builder. The attendee routes require a Cognito access token. API Gateway
validates it, and the Lambda uses its `sub` claim as the player ID; client-supplied
player IDs are ignored.

Guest tokens are generated randomly, returned once to the browser, and stored only in the
participant's browser; DynamoDB stores a SHA-256 digest. The same encounter
keys keep repeat scans idempotent. The API checks five distinct encounters
before saving a guest email, and stores contact consent separately. No email
is required to participate or unlock the passport reward. Losing browser data
currently means losing access to that guest passport; email is not a recovery
credential and the app does not send messages automatically.

## Attendee sign-in

Terraform creates a separate Cognito User Pool and public app client in each
environment. Cognito is an optional account path; guest participation requires
only a name. The mobile app uses Amplify Auth's SRP flow for accounts, so sign-in,
account creation, email confirmation, and password reset stay inside the Comunid UI.
Google and Apple sign-in need separate identity-provider credentials and are not
configured. The organizer studio continues to use its separate admin token.

The production deployment passes the Terraform outputs
`cognito_user_pool_id` and `cognito_client_id` into the mobile build. It applies
production infrastructure before building and publishing the app. The staging
workflow is disabled; deployment targets production only.

To test the Cognito flow locally against production, create
`front_mobile/.env.local` with the deployed production pool ID and client ID:

```dotenv
VITE_COGNITO_USER_POOL_ID=us-east-1_example
VITE_COGNITO_CLIENT_ID=example
VITE_API_BASE_URL=https://example.execute-api.us-east-1.amazonaws.com
```

Without those variables the app runs in local demo mode. Do not put a Cognito
client secret in the frontend; the Terraform client is public and has no secret.

## AWS environments

The production AWS profile is `sebas` (account `442809140287`). Terraform can
run locally with this profile or in GitHub Actions through OIDC. The one-time
OIDC bootstrap script is in `terraform-bootstrap/`.

| Environment | Domain | State key |
| --- | --- | --- |
| Production | `comunid.app` | `comunid/production/terraform.tfstate` |

For a local production deployment like Grace2Speech, set
`CLOUDFLARE_API_TOKEN`, `TF_VAR_cloudflare_zone_id`, and the four
`TF_VAR_github_*` values required by Terraform, then run
`./scripts/deploy-production.sh`. The script verifies AWS account
`442809140287`, checks tests and builds, rejects a plan containing deletions,
applies Terraform, and publishes the three frontends and API. It never targets
staging.

Before the first production deployment through GitHub Actions:

1. Run `AWS_PROFILE=sebas ./terraform-bootstrap/bootstrap-github-oidc-role.sh create`
   from the repository root. It creates the GitHub OIDC provider if needed and
   a temporary bootstrap role restricted to this repository. Set the two
   infrastructure role secrets it prints to GitHub Actions.
2. Keep `comunid.app` delegated to Cloudflare. Create a scoped Cloudflare API
   token with Zone DNS Edit and Zone Read permissions for `comunid.app`, then
   add it as the `COMUNID_CLOUDFLARE_API_TOKEN` GitHub Actions secret. Add the
   zone ID as `COMUNID_CLOUDFLARE_ZONE_ID`. Terraform creates the ACM
   validation CNAMEs and CloudFront CNAMEs in Cloudflare. Keep these records
   set to DNS only so ACM validation and CloudFront domain checks can work.
3. Run `AWS_PROFILE=sebas ./terraform-bootstrap/bootstrap-state-bucket.sh create`
   and set the printed bucket name as the `COMUNID_TERRAFORM_STATE_BUCKET`
   GitHub secret.
4. Run the production workflow with `deploy` enabled. Set
   `COMUNID_PRODUCTION_INFRA_ROLE_ARN` to the production
   `github_infra_role_arn` output after the first apply.
5. After the infrastructure secret uses the permanent Terraform role, remove
   the temporary role with
   `AWS_PROFILE=sebas ./terraform-bootstrap/bootstrap-github-oidc-role.sh destroy`.

The bootstrap script only creates the OIDC provider and temporary IAM role; it
does not create application or Terraform state resources.

## Organizer studio setup

Terraform creates a Rekognition face collection and an empty Secrets Manager
secret named `comunid-<environment>-admin-token`. After applying the
infrastructure, set that secret's value to a long random token in Secrets
Manager. Enter the token in the studio at `/admin/`; it is never included in
the frontend build. The Lambda reads the secret at runtime and caches it for
five minutes. `ADMIN_TOKEN` can be set directly for local backend development.

The studio tracks profile participation and facial consent separately. It
detects faces and lets an organizer choose only people with facial consent.
It sends only the selected face crops for indexing. The original group photo
is kept in the browser, not stored by the API. Rekognition stores face
vectors; DynamoDB stores profile and face IDs. Removing a face or withdrawing
facial consent deletes its vector from the collection.

## Hero and community location sharing

`hero.comunid.app` is reserved for the four pre-registered Heroes: Matias
Kreder, Rossana Suarez, Ricardo Ceci, and Damian Olguin. Selecting a Hero
shows their passport QR. Organizers issue each person a private link from the
studio; existing `https://hero.comunid.app/#...` links remain supported.

`somos.comunid.app` is the separate, open registration page. Attendees enter
their name, choose a participant role and AWS community, and may upload a photo.
They opt in to appearing in the event directory and can separately start or
stop location sharing. New registrations use the community profile role they
selected; they are not Heroes.

The mobile app's **Comunidad en vivo** list shows any consented participant who
is currently sharing a location. `GET /community/live` returns only locations
updated in the last two minutes. No location history is written; a location
disappears automatically after updates stop.

## Multitenancy

The independent tenant stack (`terraform/environments/tenants`, default region
`us-east-2`) prepares `tenants.comunid.app` for experience creation and
a separate subdomain per tenant. The agreed initial model is **one tenant per
experience**, with one administrator access token and two planned application
variants: people/Heroes and countries with a world map. Variant selection will
be configured in code; a module builder and organization/event hierarchy are
outside the initial scope. The re:Invent countries variant is implemented for the Android 0.2.0 beta; see [country passport](docs/country-passport.md).

`argentina.comunid.app` is the planned first tenant in the new platform.
The current Argentina deployment and its domains stay separate; no accounts,
passports, encounters, or QR links are automatically migrated or redirected.
Paraguay and re:Invent can then use their own tenants and the countries variant.
Profiles,
credentials, encounters, photos, locations, and face collections are scoped
to each tenant.
See [the multitenancy guide](docs/multitenancy.md) for access, local development,
isolation, deployment, and current limitations. The domains require deployment
of the Terraform and application changes before they become available.
The agreed deployment path is a dedicated GitHub Actions workflow using the
existing Cloudflare secret and AWS OIDC. The workflow is prepared at
`.github/workflows/tenants.yml`, with a pinned source commit and a reviewed plan
digest required before apply; deployment has not run yet.
`./scripts/deploy-tenants.sh plan` remains a manual local alternative. Do not use
the Argentina production deployment script or workflow for the tenant stack.

## Product direction

See [COMUNID_IDEA.md](COMUNID_IDEA.md) for the full concept and event principles.
