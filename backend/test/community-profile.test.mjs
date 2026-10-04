import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../functions/api.mjs";

function request(method, path, token, body) {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    headers: token ? { authorization: `Community ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined
  };
}

test("a community member can update their own public name", async () => {
  const secret = "a".repeat(43);
  const token = `member-test.${secret}`;
  const profile = {
    pk: "EVENT#nerdearla-2026", sk: "PROFILE#member-test", id: "member-test",
    name: "Nombre anterior", role: "builder", community: "AWS User Group", consent: true
  };
  const access = {
    eventId: "nerdearla-2026", tokenHash: createHash("sha256").update(secret).digest("hex")
  };
  const originalSend = DynamoDBDocumentClient.prototype.send;
  DynamoDBDocumentClient.prototype.send = async (command) => {
    if (command instanceof GetCommand) {
      const { pk, sk } = command.input.Key;
      if (pk === "COMMUNITY#member-test" && sk === "ACCESS") return { Item: access };
      if (pk === profile.pk && sk === profile.sk) return { Item: profile };
      return {};
    }
    if (command instanceof UpdateCommand) {
      assert.deepEqual(command.input.Key, { pk: profile.pk, sk: profile.sk });
      assert.equal(command.input.ExpressionAttributeValues[":name"], "Nombre nuevo");
      profile.name = command.input.ExpressionAttributeValues[":name"];
      return { Attributes: profile };
    }
    throw new Error(`Unexpected command: ${command.constructor.name}`);
  };
  try {
    assert.equal((await handler(request("PUT", "/community/me/profile", null, { name: "Otro" }))).statusCode, 401);
    assert.equal((await handler(request("PUT", "/community/me/profile", token, { name: "A" }))).statusCode, 422);
    const response = await handler(request("PUT", "/community/me/profile", token, { name: "  Nombre   nuevo  " }));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      profileId: "member-test", name: "Nombre nuevo", role: "builder", community: "AWS User Group"
    });
    assert.equal(profile.name, "Nombre nuevo");
  } finally {
    DynamoDBDocumentClient.prototype.send = originalSend;
  }
});
