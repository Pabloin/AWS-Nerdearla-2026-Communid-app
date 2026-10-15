import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { RekognitionClient } from "@aws-sdk/client-rekognition";

process.env.FACE_COLLECTION_ID = "comunid-test-faces";
const { handler } = await import("../functions/api.mjs");
const imageBase64 = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")}`;
function request(id, path, body) {
  return { rawPath: `/t/${id}/admin/${path}`, requestContext: { http: { method: "POST" } }, headers: { authorization: `Bearer ${id}-token` }, body: JSON.stringify(body) };
}

test("face enrollment and search use separate collections for identical event/profile IDs", async () => {
  const items = new Map(); const commands = []; const collections = new Set();
  for (const id of ["alpha", "bravo"]) {
    items.set(`TENANTS|TENANT#${id}`, { pk: "TENANTS", sk: `TENANT#${id}`, id, name: id, eventId: "same-event", adminTokenHash: createHash("sha256").update(`${id}-token`).digest("hex") });
    items.set(`TENANT#${id}#EVENT#same-event|PROFILE#alex`, { pk: `TENANT#${id}#EVENT#same-event`, sk: "PROFILE#alex", id: "alex", name: `${id} Alex`, consent: true, faceConsent: true });
  }
  const originalDb = DynamoDBDocumentClient.prototype.send;
  const originalFaces = RekognitionClient.prototype.send;
  DynamoDBDocumentClient.prototype.send = async (command) => {
    const { Key, Item } = command.input;
    if (command instanceof GetCommand) return { Item: items.get(`${Key.pk}|${Key.sk}`) };
    if (command instanceof PutCommand) { items.set(`${Item.pk}|${Item.sk}`, Item); return {}; }
    throw new Error(command.constructor.name);
  };
  RekognitionClient.prototype.send = async (command) => {
    const { CollectionId, UserId } = command.input; commands.push(command);
    switch (command.constructor.name) {
      case "DetectFacesCommand": return { FaceDetails: [{ Confidence: 99 }] };
      case "CreateCollectionCommand": collections.add(CollectionId); return {};
      case "CreateUserCommand": return {};
      case "IndexFacesCommand": return { FaceRecords: [{ Face: { FaceId: `${CollectionId}-face` } }] };
      case "AssociateFacesCommand": return { AssociatedFaces: [{ FaceId: command.input.FaceIds[0] }] };
      case "SearchUsersByImageCommand": {
        if (!collections.has(CollectionId)) throw Object.assign(new Error("empty"), { name: "ResourceNotFoundException" });
        const mapping = [...items.values()].find((item) => item.pk.startsWith(`TENANT#${CollectionId.endsWith("alpha") ? "alpha" : "bravo"}#REKOGNITION_USER#`));
        return { UserMatches: [{ User: { UserId: mapping.pk.split("REKOGNITION_USER#")[1] }, Similarity: 99 }] };
      }
      default: throw new Error(command.constructor.name + UserId);
    }
  };
  try {
    assert.deepEqual(JSON.parse((await handler(request("alpha", "search-faces", { imageBase64 }))).body).matches, []);
    for (const id of ["alpha", "bravo"]) {
      assert.equal((await handler(request(id, "faces", { profileId: "alex", imageBase64 }))).statusCode, 201);
      const found = await handler(request(id, "search-faces", { imageBase64 }));
      assert.equal(found.statusCode, 200);
      assert.equal(JSON.parse(found.body).matches[0].name, `${id} Alex`);
    }
    assert.deepEqual([...collections].sort(), ["comunid-test-faces-tenant-alpha", "comunid-test-faces-tenant-bravo"]);
    assert.ok(commands.filter((command) => command.input.CollectionId).every((command) => command.input.CollectionId.startsWith("comunid-test-faces-tenant-")));
  } finally { DynamoDBDocumentClient.prototype.send = originalDb; RekognitionClient.prototype.send = originalFaces; }
});
