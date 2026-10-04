import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { AssociateFacesCommand, CreateUserCommand, DeleteFacesCommand, DetectFacesCommand, DisassociateFacesCommand, IndexFacesCommand, RekognitionClient, SearchUsersByImageCommand } from "@aws-sdk/client-rekognition";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import QRCode from "qrcode";
import { demoProfiles } from "./demo-profiles.mjs";
import { encounterKeys, normalizeProfile, publicProfileUrl } from "./domain.mjs";
import { imageBytes, rekognitionUserId } from "./face-image.mjs";

const tableName = process.env.TABLE_NAME || "comunid-local";
const publicAppUrl = process.env.PUBLIC_APP_URL || "https://comunid.app";
const defaultEventId = process.env.DEFAULT_EVENT_ID || "nerdearla-2026";
const adminToken = process.env.ADMIN_TOKEN || "";
const adminSecretArn = process.env.ADMIN_SECRET_ARN || "";
const faceCollectionId = process.env.FACE_COLLECTION_ID || "";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5190,http://127.0.0.1:5192,https://comunid.app").split(",").map((origin) => origin.trim()));
const heroLocationLifetimeMs = 10 * 60 * 1000;
const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const rekognition = new RekognitionClient({});
const secrets = new SecretsManagerClient({});
let cachedAdminToken = "";
let adminTokenExpiresAt = 0;

function headers(event, contentType = "application/json") {
  const origin = event?.headers?.origin;
  return {
    "content-type": contentType,
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : publicAppUrl,
    "access-control-allow-headers": "content-type,authorization,x-hero-profile-id",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    vary: "origin"
  };
}

function json(event, statusCode, value) {
  return { statusCode, headers: headers(event), body: JSON.stringify(value) };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new Error("invalid_json");
  }
}

function routeParts(event) {
  return String(event.rawPath || "/").split("/").filter(Boolean).map(decodeURIComponent);
}

function authenticatedPlayerId(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  return claims?.token_use === "access" && typeof claims.sub === "string" && claims.sub ? claims.sub : "";
}

function guestPlayerId(guestId) {
  return `guest:${guestId}`;
}

function guestPublic(item) {
  return {
    id: item.guestId,
    name: item.name,
    email: item.email || null,
    contactConsent: item.contactConsent === true,
    eventId: item.eventId
  };
}

async function guestFromRequest(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const match = /^Guest ([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;
  const result = await database.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `GUEST#${match[1]}`, sk: "PROFILE" }
  }));
  const item = result.Item;
  if (!item || item.eventId !== defaultEventId || !item.tokenHash) return null;
  const actual = createHash("sha256").update(match[2]).digest();
  const expected = Buffer.from(item.tokenHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? item : null;
}

async function createGuest(event) {
  const name = String(parseBody(event)?.name || "").trim().replace(/\s+/g, " ");
  const email = String(parseBody(event)?.email || "").trim().toLowerCase();
  if (name.length < 2 || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) {
    return json(event, 422, { error: "guest_name_invalid" });
  }
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return json(event, 422, { error: "guest_email_invalid" });
  }
  const guestId = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const item = {
    pk: `GUEST#${guestId}`, sk: "PROFILE", entityType: "GUEST", guestId,
    eventId: defaultEventId, name, ...(email ? { email } : {}), tokenHash, contactConsent: false,
    createdAt: new Date().toISOString()
  };
  await database.send(new PutCommand({
    TableName: tableName, Item: item,
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
  }));
  return json(event, 201, { guest: guestPublic(item), token: `${guestId}.${secret}` });
}

async function heroFromRequest(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (/^Hero\s+HERO$/i.test(authorization)) {
    const profileId = event.headers?.["x-hero-profile-id"] || event.headers?.["X-Hero-Profile-Id"] || "";
    const profile = profileId ? await persistedProfile(profileId) : null;
    return profile?.consent === true && profile.role === "hero" ? profile : null;
  }
  const match = /^Hero ([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;
  const result = await database.send(new GetCommand({
    TableName: tableName, Key: { pk: `HERO#${match[1]}`, sk: "ACCESS" }
  }));
  const access = result.Item;
  if (!access || access.eventId !== defaultEventId) return null;
  const actual = createHash("sha256").update(match[2]).digest();
  const expected = Buffer.from(access.tokenHash || "", "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const profile = await persistedProfile(match[1]);
  return profile?.consent === true ? profile : null;
}

async function communityFromRequest(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const match = /^Community ([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;
  const keys = [`COMMUNITY#${match[1]}`, `HERO#${match[1]}`];
  let access = null;
  for (const pk of keys) {
    const result = await database.send(new GetCommand({ TableName: tableName, Key: { pk, sk: "ACCESS" } }));
    if (result.Item) { access = result.Item; break; }
  }
  if (!access || access.eventId !== defaultEventId) return null;
  const actual = createHash("sha256").update(match[2]).digest();
  const expected = Buffer.from(access.tokenHash || "", "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const profile = await persistedProfile(match[1]);
  return profile?.consent === true && profile.id.startsWith("member-") ? profile : null;
}

async function createHeroLink(event, profileId) {
  const profile = await persistedProfile(profileId);
  if (!profile || profile.consent !== true || profile.role !== "hero") {
    return json(event, 404, { error: "consented_hero_not_found" });
  }
  const secret = randomBytes(32).toString("base64url");
  await database.send(new PutCommand({
    TableName: tableName,
    Item: { pk: `HERO#${profileId}`, sk: "ACCESS", eventId: defaultEventId,
      tokenHash: createHash("sha256").update(secret).digest("hex"), updatedAt: new Date().toISOString() }
  }));
  await database.send(new DeleteCommand({ TableName: tableName, Key: { pk: `HERO#${profileId}`, sk: "LOCATION" } }));
  return json(event, 201, { profileId, url: `https://hero.comunid.app/#${profileId}.${secret}` });
}

async function registerCommunityMember(event) {
  const input = parseBody(event);
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const community = String(input.community || "");
  const role = String(input.role || "");
  const roles = new Set(["student", "builder", "connector", "legend"]);
  const communities = new Set(["AWS User Group", "AWS Student Builder Groups", "AWS Community Builder"]);
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    return json(event, 422, { error: "community_name_invalid" });
  }
  if (!communities.has(community)) return json(event, 422, { error: "community_invalid" });
  if (!roles.has(role)) return json(event, 422, { error: "community_role_invalid" });
  const profileId = `member-${randomUUID()}`;
  const secret = randomBytes(32).toString("base64url");
  const timestamp = new Date().toISOString();
  const profile = { id: profileId, name, role, title: community, city: "", community,
    superpower: "", askMeAbout: "", story: "", color: "#C8FF3D", consent: true, faceConsent: false };
  const photo = String(input.photoDataUrl || "");
  let photoItem;
  if (photo) {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
    if (!match || Buffer.from(match[2], "base64").length > 180_000) return json(event, 422, { error: "photo_invalid" });
    photoItem = { pk: `PROFILE#${profileId}`, sk: "PHOTO", contentType: `image/${match[1]}`, imageBase64: match[2] };
  }
  await database.send(new PutCommand({ TableName: tableName,
    Item: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profileId}`, entityType: "PROFILE", eventId: defaultEventId, ...profile, createdAt: timestamp, updatedAt: timestamp },
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)" }));
  if (photoItem) await database.send(new PutCommand({ TableName: tableName, Item: photoItem }));
  await database.send(new PutCommand({ TableName: tableName, Item: { pk: `COMMUNITY#${profileId}`, sk: "ACCESS", eventId: defaultEventId,
    tokenHash: createHash("sha256").update(secret).digest("hex"), updatedAt: timestamp } }));
  return json(event, 201, { profileId, name, role, community, token: `${profileId}.${secret}` });
}

async function communityRoute(event, method, parts) {
  if (method === "POST" && parts[1] === "register" && parts.length === 2) return registerCommunityMember(event);
  if (method === "GET" && parts[1] === "live" && parts.length === 2) {
    const profiles = await queryAll({ TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": `EVENT#${defaultEventId}`, ":prefix": "PROFILE#" }
    });
    const sharing = await Promise.all(profiles.filter((profile) => profile.consent === true).map(async (profile) => {
      const result = await database.send(new GetCommand({ TableName: tableName,
        Key: { pk: `HERO#${profile.id}`, sk: "LOCATION" } }));
      const location = result.Item;
      return location && location.expiresAt > Date.now()
        ? { profileId: profile.id, name: profile.name, role: profile.role, community: profile.community,
            latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, updatedAt: location.updatedAt }
        : null;
    }));
    return json(event, 200, { people: sharing.filter(Boolean) });
  }
  const profile = await communityFromRequest(event);
  if (!profile) return json(event, 401, { error: "community_authorization_required" });
  if (method === "GET" && parts[1] === "me" && parts.length === 2) {
    return json(event, 200, { profileId: profile.id, name: profile.name, role: profile.role, community: profile.community });
  }
  if (method === "PUT" && parts[1] === "me" && parts[2] === "profile" && parts.length === 3) {
    const input = parseBody(event);
    const name = String(input?.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) return json(event, 422, { error: "community_name_invalid" });
    const result = await database.send(new UpdateCommand({
      TableName: tableName, Key: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profile.id}` },
      UpdateExpression: "SET #name = :name, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": name, ":updatedAt": new Date().toISOString() },
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)", ReturnValues: "ALL_NEW"
    }));
    return json(event, 200, { profileId: profile.id, name: result.Attributes.name, role: profile.role, community: profile.community });
  }
  if (parts[1] === "me" && parts[2] === "location" && parts.length === 3) {
    if (method === "DELETE") {
      await database.send(new DeleteCommand({ TableName: tableName,
        Key: { pk: `HERO#${profile.id}`, sk: "LOCATION" } }));
      return json(event, 200, { sharing: false });
    }
    if (method === "PUT") {
      const input = parseBody(event);
      const { latitude, longitude, accuracy } = input;
      if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) {
        return json(event, 422, { error: "invalid_location" });
      }
      const now = Date.now();
      await database.send(new PutCommand({ TableName: tableName,
        Item: { pk: `HERO#${profile.id}`, sk: "LOCATION", eventId: defaultEventId,
          latitude, longitude, accuracy, updatedAt: new Date(now).toISOString(), expiresAt: now + heroLocationLifetimeMs }
      }));
      return json(event, 200, { sharing: true, updatedAt: new Date(now).toISOString() });
    }
  }
  return json(event, 404, { error: "not_found" });
}

async function heroRoute(event, method, parts) {
  if (method === "GET" && parts[1] === "live" && parts.length === 2) {
    const profiles = await queryAll({ TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": `EVENT#${defaultEventId}`, ":prefix": "PROFILE#" }
    });
    const heroes = await Promise.all(profiles.filter((profile) => profile.role === "hero" && profile.consent === true)
      .map(async (profile) => {
        const result = await database.send(new GetCommand({ TableName: tableName,
          Key: { pk: `HERO#${profile.id}`, sk: "LOCATION" } }));
        const location = result.Item;
        return location && location.expiresAt > Date.now()
          ? { profileId: profile.id, name: profile.name, latitude: location.latitude,
              longitude: location.longitude, accuracy: location.accuracy, updatedAt: location.updatedAt }
          : null;
      }));
    return json(event, 200, { heroes: heroes.filter(Boolean) });
  }
  const profile = await heroFromRequest(event);
  if (!profile) return json(event, 401, { error: "hero_authorization_required" });
  if (method === "GET" && parts[1] === "me" && parts.length === 2) {
    return json(event, 200, { profileId: profile.id, name: profile.name });
  }
  if (parts[1] === "me" && parts[2] === "location" && parts.length === 3) {
    if (method === "DELETE") {
      await database.send(new DeleteCommand({ TableName: tableName,
        Key: { pk: `HERO#${profile.id}`, sk: "LOCATION" } }));
      return json(event, 200, { sharing: false });
    }
    if (method === "PUT") {
      const input = parseBody(event);
      const { latitude, longitude, accuracy } = input;
      if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) {
        return json(event, 422, { error: "invalid_location" });
      }
      const now = Date.now();
      await database.send(new PutCommand({ TableName: tableName,
        Item: { pk: `HERO#${profile.id}`, sk: "LOCATION", eventId: defaultEventId,
          latitude, longitude, accuracy, updatedAt: new Date(now).toISOString(),
          expiresAt: now + heroLocationLifetimeMs }
      }));
      return json(event, 200, { sharing: true, updatedAt: new Date(now).toISOString() });
    }
  }
  return json(event, 404, { error: "not_found" });
}

async function guestEncounters(guestId) {
  return queryAll({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `PLAYER#${guestPlayerId(guestId)}`,
      ":prefix": `ENCOUNTER#${defaultEventId}#`
    }
  });
}

async function guestRoute(event, method, parts) {
  if (method === "POST" && parts.length === 1) return createGuest(event);
  const guest = await guestFromRequest(event);
  if (!guest) return json(event, 401, { error: "guest_authentication_required" });
  if (method === "GET" && parts[1] === "me" && parts.length === 2) {
    return json(event, 200, { guest: guestPublic(guest) });
  }
  if (parts[1] === "me" && parts[2] === "encounters" && parts.length === 3) {
    if (method === "GET") {
      return json(event, 200, { eventId: defaultEventId, encounters: await guestEncounters(guest.guestId) });
    }
    if (method === "POST") {
      const input = parseBody(event);
      const keys = encounterKeys({
        eventId: defaultEventId,
        playerId: guestPlayerId(guest.guestId),
        profileId: input.profileId
      });
      if (!(await profileExists(keys.profileId))) return json(event, 404, { error: "profile_not_found" });
      const timestamp = new Date().toISOString();
      await database.send(new PutCommand({
        TableName: tableName,
        Item: { ...keys, entityType: "ENCOUNTER", collectedAt: timestamp },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
      })).catch((error) => {
        if (error.name !== "ConditionalCheckFailedException") throw error;
      });
      return json(event, 201, { ...keys, collectedAt: timestamp });
    }
  }
  if (parts[1] === "me" && parts[2] === "contact" && parts.length === 3) {
    if (method === "PUT") {
      const input = parseBody(event);
      const email = String(input?.email || "").trim().toLowerCase();
      if (input?.consent !== true || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(event, 422, { error: "contact_consent_and_email_required" });
      }
      if ((await guestEncounters(guest.guestId)).length < 5) {
        return json(event, 403, { error: "reward_not_unlocked" });
      }
      const result = await database.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: guest.pk, sk: guest.sk },
        UpdateExpression: "SET email = :email, contactConsent = :consent, updatedAt = :updatedAt",
        ExpressionAttributeValues: { ":email": email, ":consent": true, ":updatedAt": new Date().toISOString() },
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ReturnValues: "ALL_NEW"
      }));
      return json(event, 200, { guest: guestPublic(result.Attributes) });
    }
    if (method === "DELETE") {
      const result = await database.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: guest.pk, sk: guest.sk },
        UpdateExpression: "REMOVE email SET contactConsent = :consent, updatedAt = :updatedAt",
        ExpressionAttributeValues: { ":consent": false, ":updatedAt": new Date().toISOString() },
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ReturnValues: "ALL_NEW"
      }));
      return json(event, 200, { guest: guestPublic(result.Attributes) });
    }
  }
  return json(event, 404, { error: "not_found" });
}

function profileFromItem(item, includeFaceConsent = false) {
  const { pk, sk, entityType, eventId, createdAt, updatedAt, faceConsent, ...profile } = item;
  return includeFaceConsent ? { ...profile, faceConsent: faceConsent === true } : profile;
}

async function configuredAdminToken() {
  if (adminToken) return adminToken;
  if (!adminSecretArn) return "";
  if (Date.now() < adminTokenExpiresAt) return cachedAdminToken;
  try {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: adminSecretArn }));
    cachedAdminToken = result.SecretString?.trim() || "";
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    cachedAdminToken = "";
  }
  adminTokenExpiresAt = Date.now() + 5 * 60 * 1000;
  return cachedAdminToken;
}

async function adminAuthorized(event) {
  const expected = await configuredAdminToken();
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (!expected || !authorization.startsWith("Bearer ")) return false;
  const provided = authorization.slice(7);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

async function queryAll(input) {
  const items = [];
  let key;
  do {
    const result = await database.send(new QueryCommand({ ...input, ExclusiveStartKey: key }));
    items.push(...(result.Items || []));
    key = result.LastEvaluatedKey;
  } while (key);
  return items;
}

async function managedProfiles(event) {
  const items = await queryAll({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `EVENT#${defaultEventId}`, ":prefix": "PROFILE#" }
  });
  return json(event, 200, { eventId: defaultEventId, profiles: items.map((item) => profileFromItem(item, true)) });
}

async function persistedProfile(profileId) {
  const result = await database.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profileId}` }
  }));
  return result.Item;
}

function requireFaceCollection(event) {
  return faceCollectionId ? null : json(event, 503, { error: "face_collection_not_configured" });
}

async function detectFaces(event) {
  const bytes = imageBytes(parseBody(event).imageBase64);
  const result = await rekognition.send(new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["DEFAULT"] }));
  return json(event, 200, {
    faces: (result.FaceDetails || []).map((face, index) => ({
      id: index,
      box: face.BoundingBox,
      confidence: face.Confidence,
      sharpness: face.Quality?.Sharpness,
      brightness: face.Quality?.Brightness
    }))
  });
}

async function profileFaces(event, profileId) {
  const faces = await queryAll({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `PROFILE#${profileId}`, ":prefix": "FACE#" }
  });
  return json(event, 200, { profileId, faces: faces.map(({ faceId, createdAt }) => ({ faceId, createdAt })) });
}

async function enrollFace(event) {
  const input = parseBody(event);
  const profileId = String(input.profileId || "").trim();
  if (!profileId) throw new Error("profile_id_required");
  const profile = await persistedProfile(profileId);
  if (!profile || profile.consent !== true) return json(event, 404, { error: "consented_profile_not_found" });
  if (profile.faceConsent !== true) return json(event, 422, { error: "face_consent_required" });
  const bytes = imageBytes(input.imageBase64);
  const detected = await rekognition.send(new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["DEFAULT"] }));
  if (detected.FaceDetails?.length !== 1) return json(event, 422, { error: "single_face_required" });
  const userId = rekognitionUserId(defaultEventId, profileId);

  try {
    await rekognition.send(new CreateUserCommand({ CollectionId: faceCollectionId, UserId: userId }));
  } catch (error) {
    if (error.name !== "ResourceAlreadyExistsException") throw error;
  }

  const indexed = await rekognition.send(new IndexFacesCommand({
    CollectionId: faceCollectionId,
    Image: { Bytes: bytes },
    ExternalImageId: userId,
    MaxFaces: 1,
    QualityFilter: "AUTO"
  }));
  const faceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) return json(event, 422, { error: "face_quality_insufficient" });

  try {
    const associated = await rekognition.send(new AssociateFacesCommand({
      CollectionId: faceCollectionId,
      UserId: userId,
      FaceIds: [faceId]
    }));
    if (!associated.AssociatedFaces?.some((face) => face.FaceId === faceId)) {
      await rekognition.send(new DeleteFacesCommand({ CollectionId: faceCollectionId, FaceIds: [faceId] }));
      return json(event, 422, { error: "face_association_rejected" });
    }
    const timestamp = new Date().toISOString();
    await database.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `REKOGNITION_USER#${userId}`, sk: "PROFILE", profileId, eventId: defaultEventId }
    }));
    await database.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `PROFILE#${profileId}`, sk: `FACE#${faceId}`, entityType: "FACE", profileId, faceId, eventId: defaultEventId, createdAt: timestamp }
    }));
    return json(event, 201, { profileId, faceId, createdAt: timestamp });
  } catch (error) {
    await rekognition.send(new DisassociateFacesCommand({ CollectionId: faceCollectionId, UserId: userId, FaceIds: [faceId] })).catch(() => {});
    await rekognition.send(new DeleteFacesCommand({ CollectionId: faceCollectionId, FaceIds: [faceId] })).catch(() => {});
    throw error;
  }
}

async function deleteFace(event, profileId, faceId) {
  const key = { pk: `PROFILE#${profileId}`, sk: `FACE#${faceId}` };
  const result = await database.send(new GetCommand({ TableName: tableName, Key: key }));
  if (!result.Item) return json(event, 404, { error: "face_not_found" });
  const userId = rekognitionUserId(defaultEventId, profileId);
  await rekognition.send(new DisassociateFacesCommand({ CollectionId: faceCollectionId, UserId: userId, FaceIds: [faceId] }));
  await rekognition.send(new DeleteFacesCommand({ CollectionId: faceCollectionId, FaceIds: [faceId] }));
  await database.send(new DeleteCommand({ TableName: tableName, Key: key }));
  return json(event, 200, { deleted: true, faceId });
}

async function searchFaces(event) {
  const bytes = imageBytes(parseBody(event).imageBase64);
  const result = await rekognition.send(new SearchUsersByImageCommand({
    CollectionId: faceCollectionId,
    Image: { Bytes: bytes },
    MaxUsers: 3,
    UserMatchThreshold: 80
  }));
  const matches = await Promise.all((result.UserMatches || []).map(async (match) => {
    const userId = match.User?.UserId;
    if (!userId) return null;
    const mapping = await database.send(new GetCommand({ TableName: tableName, Key: { pk: `REKOGNITION_USER#${userId}`, sk: "PROFILE" } }));
    if (!mapping.Item || mapping.Item.eventId !== defaultEventId) return null;
    const profile = await persistedProfile(mapping.Item.profileId);
    if (!profile || profile.consent !== true || profile.faceConsent !== true) return null;
    return { profileId: profile.id, name: profile.name, similarity: match.Similarity };
  }));
  return json(event, 200, { matches: matches.filter(Boolean) });
}

async function updateFaceConsent(event, profileId) {
  const { faceConsent } = parseBody(event);
  if (typeof faceConsent !== "boolean") throw new Error("invalid_face_consent");
  const profile = await persistedProfile(profileId);
  if (!profile || profile.consent !== true) return json(event, 404, { error: "consented_profile_not_found" });
  await database.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profileId}` },
    UpdateExpression: "SET faceConsent = :consent, updatedAt = :updatedAt",
    ExpressionAttributeValues: { ":consent": faceConsent, ":updatedAt": new Date().toISOString() }
  }));
  if (!faceConsent) {
    const faces = await queryAll({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": `PROFILE#${profileId}`, ":prefix": "FACE#" }
    });
    for (const face of faces) await deleteFace(event, profileId, face.faceId);
  }
  return json(event, 200, { profileId, faceConsent });
}

async function listProfiles(event) {
  const result = await database.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `EVENT#${defaultEventId}`, ":prefix": "PROFILE#" }
  }));
  const profiles = (result.Items || []).filter((item) => item.consent === true).map(profileFromItem);
  const ids = new Set(profiles.map((profile) => profile.id));
  return json(event, 200, { eventId: defaultEventId, profiles: [
    ...profiles, ...demoProfiles.filter((profile) => !ids.has(profile.id))
  ] });
}

async function getProfile(event, profileId) {
  const result = await database.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profileId}` }
  }));
  const item = result.Item || demoProfiles.find((profile) => profile.id === profileId);
  if (!item || item.consent === false) return json(event, 404, { error: "profile_not_found" });
  return json(event, 200, { ...profileFromItem(item), qrPayload: publicProfileUrl(publicAppUrl, profileId) });
}

async function profileExists(profileId) {
  if (demoProfiles.some((profile) => profile.id === profileId && profile.consent)) return true;
  const result = await database.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profileId}` }
  }));
  return result.Item?.consent === true;
}

async function createProfile(event) {
  if (!(await adminAuthorized(event))) {
    return json(event, 401, { error: "admin_authorization_required" });
  }
  const profile = normalizeProfile(parseBody(event));
  if (!profile.consent) return json(event, 422, { error: "profile_consent_required" });
  const timestamp = new Date().toISOString();
  await database.send(new PutCommand({
    TableName: tableName,
    Item: { pk: `EVENT#${defaultEventId}`, sk: `PROFILE#${profile.id}`, entityType: "PROFILE", eventId: defaultEventId, ...profile, createdAt: timestamp, updatedAt: timestamp },
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
  }));
  return json(event, 201, { ...profile, qrPayload: publicProfileUrl(publicAppUrl, profile.id) });
}

async function createEncounter(event) {
  const playerId = authenticatedPlayerId(event);
  if (!playerId) return json(event, 401, { error: "authentication_required" });
  const input = parseBody(event);
  const keys = encounterKeys({ eventId: defaultEventId, playerId, profileId: input.profileId });
  if (!(await profileExists(keys.profileId))) return json(event, 404, { error: "profile_not_found" });
  const timestamp = new Date().toISOString();
  await database.send(new PutCommand({
    TableName: tableName,
    Item: { ...keys, entityType: "ENCOUNTER", collectedAt: timestamp },
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
  })).catch((error) => {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  });
  return json(event, 201, { ...keys, collectedAt: timestamp });
}

async function listEncounters(event, playerId) {
  const authenticatedId = authenticatedPlayerId(event);
  if (!authenticatedId) return json(event, 401, { error: "authentication_required" });
  if (playerId && playerId !== authenticatedId) return json(event, 403, { error: "forbidden" });
  playerId = authenticatedId;
  const result = await database.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}`, ":prefix": `ENCOUNTER#${defaultEventId}#` }
  }));
  return json(event, 200, { playerId, eventId: defaultEventId, encounters: result.Items || [] });
}

async function profileQr(event, profileId) {
  const svg = await QRCode.toString(publicProfileUrl(publicAppUrl, profileId), {
    type: "svg",
    width: 320,
    margin: 1,
    color: { dark: "#101218", light: "#FFFFFF" }
  });
  return { statusCode: 200, headers: { ...headers(event, "image/svg+xml"), "cache-control": "public,max-age=3600" }, body: svg };
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === "OPTIONS") return { statusCode: 204, headers: headers(event), body: "" };
  const parts = routeParts(event);

  try {
    if (method === "GET" && parts[0] === "health") return json(event, 200, { service: "comunid-api", status: "ok", eventId: defaultEventId });
    if (parts[0] === "community") return communityRoute(event, method, parts);
    if (parts[0] === "guests") return guestRoute(event, method, parts);
    if (parts[0] === "heroes") return heroRoute(event, method, parts);
    if (parts[0] === "admin") {
      if (!(await adminAuthorized(event))) return json(event, 401, { error: "admin_authorization_required" });
      if (method === "GET" && parts[1] === "session") return json(event, 200, { authorized: true, faceCollectionConfigured: Boolean(faceCollectionId), eventId: defaultEventId });
      if (method === "POST" && parts[1] === "heroes" && parts[2] && parts[3] === "link" && parts.length === 4) return createHeroLink(event, parts[2]);
      if (method === "GET" && parts[1] === "profiles" && !parts[2]) return managedProfiles(event);
      if (method === "POST" && parts[1] === "profiles" && !parts[2]) return createProfile(event);
      if (method === "PUT" && parts[1] === "profiles" && parts[2] && parts[3] === "face-consent") return updateFaceConsent(event, parts[2]);
      if (method === "GET" && parts[1] === "profiles" && parts[2] && parts[3] === "faces" && !parts[4]) return profileFaces(event, parts[2]);
      if (parts[1] === "faces" || parts[1] === "detect-faces" || parts[1] === "search-faces" || parts[3] === "faces") {
        const unavailable = requireFaceCollection(event);
        if (unavailable) return unavailable;
      }
      if (method === "POST" && parts[1] === "detect-faces") return detectFaces(event);
      if (method === "POST" && parts[1] === "faces") return enrollFace(event);
      if (method === "POST" && parts[1] === "search-faces") return searchFaces(event);
      if (method === "DELETE" && parts[1] === "profiles" && parts[2] && parts[3] === "faces" && parts[4]) return deleteFace(event, parts[2], parts[4]);
      return json(event, 404, { error: "not_found" });
    }
    if (method === "GET" && parts[0] === "profiles" && !parts[1]) return listProfiles(event);
    if (method === "POST" && parts[0] === "profiles" && !parts[1]) return createProfile(event);
    if (method === "GET" && parts[0] === "profiles" && parts[1] && parts[2] === "photo") {
      const result = await database.send(new GetCommand({ TableName: tableName, Key: { pk: `PROFILE#${parts[1]}`, sk: "PHOTO" } }));
      if (!result.Item?.imageBase64) return json(event, 404, { error: "photo_not_found" });
      return { statusCode: 200, headers: { ...headers(event, result.Item.contentType), "cache-control": "public,max-age=3600" }, isBase64Encoded: true, body: result.Item.imageBase64 };
    }
    if (method === "GET" && parts[0] === "profiles" && parts[1] && parts[2] === "qr") return profileQr(event, parts[1]);
    if (method === "GET" && parts[0] === "profiles" && parts[1]) return getProfile(event, parts[1]);
    if (method === "POST" && parts[0] === "encounters") return createEncounter(event);
    if (method === "GET" && parts[0] === "me" && parts[1] === "encounters") return listEncounters(event);
    if (method === "GET" && parts[0] === "players" && parts[1] && parts[2] === "encounters") return listEncounters(event, parts[1]);
    return json(event, 404, { error: "not_found" });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const clientError = ["invalid_json", "invalid_profile_role", "profile_name_required", "encounter_fields_required", "invalid_image", "image_too_large", "profile_id_required", "invalid_face_consent"].includes(message);
    const status = error.name === "ConditionalCheckFailedException" ? 409 : error.name === "InvalidParameterException" ? 422 : clientError ? 400 : 500;
    return json(event, status, { error: status === 500 ? "unexpected_error" : message });
  }
}
