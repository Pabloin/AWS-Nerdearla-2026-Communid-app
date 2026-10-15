import assert from "node:assert/strict";
import test from "node:test";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { scopedDatabase, tenantContext } from "../functions/tenancy.mjs";

process.env.ADMIN_TOKEN = "platform-test-token";
const { handler } = await import("../functions/api.mjs");
function request(method, path, authorization, body, player) {
  return { rawPath: path, requestContext: { http: { method }, ...(player ? { authorizer: { jwt: { claims: { sub: player, token_use: "access" } } } } : {}) }, headers: authorization ? { authorization } : {}, ...(body ? { body: JSON.stringify(body) } : {}) };
}
const data = (response) => JSON.parse(response.body);

test("communities isolate credentials, profiles, photos, encounters, and locations", async () => {
  const items = new Map();
  const originalSend = DynamoDBDocumentClient.prototype.send;
  const itemKey = (key) => `${key.pk}|${key.sk}`;
  DynamoDBDocumentClient.prototype.send = async (command) => {
    const input = command.input;
    if (command instanceof GetCommand) return { Item: items.get(itemKey(input.Key)) };
    if (command instanceof PutCommand) {
      const key = itemKey(input.Item);
      if (input.ConditionExpression && items.has(key)) throw Object.assign(new Error("duplicate"), { name: "ConditionalCheckFailedException" });
      items.set(key, structuredClone(input.Item)); return {};
    }
    if (command instanceof DeleteCommand) { items.delete(itemKey(input.Key)); return {}; }
    if (command instanceof QueryCommand) return { Items: [...items.values()].filter((item) => item.pk === input.ExpressionAttributeValues[":pk"] && (!input.ExpressionAttributeValues[":prefix"] || item.sk.startsWith(input.ExpressionAttributeValues[":prefix"]))) };
    if (command instanceof UpdateCommand) {
      const item = { ...items.get(itemKey(input.Key)), name: input.ExpressionAttributeValues[":name"] };
      items.set(itemKey(input.Key), item); return { Attributes: item };
    }
    throw new Error(`Unexpected command: ${command.constructor.name}`);
  };
  try {
    const platform = "Bearer platform-test-token";
    assert.equal((await handler(request("POST", "/tenants", null, { id: "alpha", name: "Alpha" }))).statusCode, 401);
    for (const id of ["admin", "somos", "www", "tenants", "UPPER", "bad.id", "x"]) assert.equal((await handler(request("POST", "/tenants", platform, { id, name: "Invalid" }))).statusCode, 422);
    const alpha = data(await handler(request("POST", "/tenants", platform, { id: "alpha", name: "Alpha", eventId: "same-event" })));
    const bravo = data(await handler(request("POST", "/tenants", platform, { id: "bravo", name: "Bravo", eventId: "same-event" })));
    assert.ok(alpha.adminToken && bravo.adminToken && alpha.adminToken !== bravo.adminToken);
    assert.ok(!JSON.stringify([...items.values()]).includes(alpha.adminToken));
    const listed = await handler(request("GET", "/tenants", platform));
    assert.equal(data(listed).tenants.length, 2);
    assert.ok(!listed.body.includes("adminToken"));
    assert.equal((await handler(request("POST", "/tenants", platform, { id: "alpha", name: "Duplicate" }))).statusCode, 409);
    assert.equal((await handler(request("GET", "/t/missing/profiles"))).statusCode, 404);
    assert.equal((await handler(request("GET", "/t/alpha/admin/session", platform))).statusCode, 401);
    assert.equal((await handler(request("GET", "/t/bravo/admin/session", `Bearer ${alpha.adminToken}`))).statusCode, 401);
    assert.equal((await handler(request("GET", "/admin/session", `Bearer ${alpha.adminToken}`))).statusCode, 401);
    assert.equal((await handler(request("GET", "/tenants", `Bearer ${alpha.adminToken}`))).statusCode, 401);
    assert.equal((await handler(request("GET", "/t/alpha/admin/session", `Bearer ${alpha.adminToken}`))).statusCode, 200);
    assert.equal(data(await handler(request("GET", "/t/alpha/admin/session", `Bearer ${alpha.adminToken}`))).faceCollectionConfigured, false);
    assert.deepEqual(data(await handler(request("GET", "/t/alpha/profiles"))).profiles, []);
    assert.equal((await handler(request("GET", "/t/alpha/profiles/ana-cloud"))).statusCode, 404);
    for (const [id, token, name] of [["alpha", alpha.adminToken, "Alex Alpha"], ["bravo", bravo.adminToken, "Alex Bravo"]]) {
      const created = await handler(request("POST", `/t/${id}/admin/profiles`, `Bearer ${token}`, { id: "same-profile", name, role: "hero", consent: true }));
      assert.equal(created.statusCode, 201);
      assert.equal(data(created).qrPayload, `https://${id}.comunid.app/b/same-profile`);
    }
    const [alphaProfiles, bravoProfiles] = await Promise.all([handler(request("GET", "/t/alpha/profiles")), handler(request("GET", "/t/bravo/profiles"))]);
    assert.equal(data(alphaProfiles).profiles[0].name, "Alex Alpha");
    assert.equal(data(bravoProfiles).profiles[0].name, "Alex Bravo");
    assert.ok(items.has("TENANT#alpha#EVENT#same-event|PROFILE#same-profile"));
    const guestResponse = await handler(request("POST", "/t/alpha/guests", null, { name: "Guest Alpha" }));
    assert.equal(guestResponse.statusCode, 201);
    const guest = data(guestResponse);
    assert.equal((await handler(request("GET", "/t/alpha/guests/me", `Guest ${guest.token}`))).statusCode, 200);
    assert.equal((await handler(request("GET", "/t/bravo/guests/me", `Guest ${guest.token}`))).statusCode, 401);
    assert.equal((await handler(request("GET", "/guests/me", `Guest ${guest.token}`))).statusCode, 401);
    const member = data(await handler(request("POST", "/t/alpha/community/register", null, { name: "Member Alpha", role: "builder", community: "AWS User Group" })));
    assert.equal((await handler(request("PUT", "/t/alpha/community/me/profile", `Community ${member.token}`, { name: "Updated Member" }))).statusCode, 200);
    assert.equal((await handler(request("GET", "/t/bravo/community/me", `Community ${member.token}`))).statusCode, 401);
    assert.ok(![...items.keys()].some((key) => key.includes("TENANT#alpha#TENANT#")));
    for (let i = 0; i < 2; i++) assert.equal((await handler(request("POST", "/t/alpha/guests/me/encounters", `Guest ${guest.token}`, { profileId: "same-profile" }))).statusCode, 201);
    assert.equal(data(await handler(request("GET", "/t/alpha/guests/me/encounters", `Guest ${guest.token}`))).encounters.length, 1);
    assert.equal((await handler(request("POST", "/t/alpha/encounters", "Bearer jwt", { profileId: "same-profile" }, "same-player"))).statusCode, 201);
    assert.equal(data(await handler(request("GET", "/t/alpha/me/encounters", "Bearer jwt", null, "same-player"))).encounters.length, 1);
    assert.equal(data(await handler(request("GET", "/t/bravo/me/encounters", "Bearer jwt", null, "same-player"))).encounters.length, 0);
    assert.equal((await handler(request("GET", "/t/alpha/players/other-player/encounters", "Bearer jwt", null, "same-player"))).statusCode, 403);
    // The legacy shared Hero code must never authorize a tenant's location.
    const sharedHero = request("PUT", "/t/alpha/heroes/me/location", "Hero HERO", { latitude: 1, longitude: 2, accuracy: 10 });
    sharedHero.headers["x-hero-profile-id"] = "same-profile";
    assert.equal((await handler(sharedHero)).statusCode, 401);
    const link = data(await handler(request("POST", "/t/alpha/admin/heroes/same-profile/link", `Bearer ${alpha.adminToken}`)));
    assert.ok(link.url.startsWith("https://alpha.comunid.app/hero.html#"));
    const heroToken = new URL(link.url).hash.slice(1);
    assert.equal((await handler(request("PUT", "/t/alpha/heroes/me/location", `Hero ${heroToken}`, { latitude: 1, longitude: 2, accuracy: 10 }))).statusCode, 200);
    assert.equal((await handler(request("PUT", "/t/bravo/heroes/me/location", `Hero ${heroToken}`, { latitude: 1, longitude: 2, accuracy: 10 }))).statusCode, 401);
    assert.equal(data(await handler(request("GET", "/t/bravo/community/live"))).people.length, 0);
    items.set("TENANT#alpha#PROFILE#same-profile|PHOTO", { pk: "TENANT#alpha#PROFILE#same-profile", sk: "PHOTO", contentType: "image/png", imageBase64: "YWxwaGE=" });
    assert.equal((await handler(request("GET", "/t/alpha/profiles/same-profile/photo"))).body, "YWxwaGE=");
    assert.equal((await handler(request("GET", "/t/bravo/profiles/same-profile/photo"))).statusCode, 404);
    assert.equal((await handler(request("POST", "/t/alpha/admin/search-faces", `Bearer ${alpha.adminToken}`, { imageBase64: "abc" }))).statusCode, 503);
  } finally { DynamoDBDocumentClient.prototype.send = originalSend; }
});

test("scoped pagination keys survive round trips and concurrent request contexts", async () => {
  const calls = [];
  const client = scopedDatabase({ async send(command) {
    calls.push(command.input);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const pk = command.input.ExpressionAttributeValues[":pk"];
    return { Items: [{ pk, sk: "PROFILE#alex" }], LastEvaluatedKey: { pk, sk: "PROFILE#alex" } };
  } });
  await Promise.all(["alpha", "bravo"].map((id) => tenantContext.run({ id }, async () => {
    const input = { KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": "EVENT#same" } };
    const first = await client.send(new QueryCommand(input));
    assert.equal(first.Items[0].pk, "EVENT#same");
    await client.send(new QueryCommand({ ...input, ExclusiveStartKey: first.LastEvaluatedKey }));
  })));
  assert.equal(calls.length, 4);
  for (const call of calls) if (call.ExclusiveStartKey) assert.equal(call.ExclusiveStartKey.pk, call.ExpressionAttributeValues[":pk"]);
});

test("CORS allows exact HTTPS tenant hosts and rejects lookalikes", async () => {
  for (const origin of ["https://alpha.comunid.app", "https://bravo.comunid.app"]) {
    const event = request("OPTIONS", "/t/alpha/profiles"); event.headers.origin = origin;
    const response = await handler(event);
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], origin);
  }
  for (const origin of ["https://alpha.comunid.app.evil.test", "https://evilcomunid.app", "http://alpha.comunid.app", "https://alpha.comunid.app:8443", "https://nested.alpha.comunid.app"]) {
    const event = request("OPTIONS", "/t/alpha/profiles"); event.headers.origin = origin;
    assert.notEqual((await handler(event)).headers["access-control-allow-origin"], origin);
  }
});
