import { AsyncLocalStorage } from "node:async_hooks";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const tenantContext = new AsyncLocalStorage();
export const tenant = () => tenantContext.getStore();
export const validTenantId = (id) => typeof id === "string" && /^[a-z0-9][a-z0-9-]{1,47}$/.test(id) && !["default", "www", "app", "mobile", "admin", "hero", "somos", "tenants", "api", "mail", "staging", "production"].includes(id);

// Every application partition (including guest credentials and photos) is scoped.
// Unwrap returned keys so existing update and pagination paths cannot double-prefix.
export function scopedDatabase(client) {
  return {
    async send(command) {
      const id = tenant()?.id;
      if (!id) return client.send(command);
      const prefix = `TENANT#${id}#`;
      const scopeKey = (key) => key ? { ...key, pk: prefix + key.pk } : key;
      const unscopeKey = (key) => {
        if (!key) return key;
        if (typeof key.pk !== "string" || !key.pk.startsWith(prefix)) throw new Error("tenant_partition_mismatch");
        return { ...key, pk: key.pk.slice(prefix.length) };
      };
      const input = { ...command.input };
      if (input.Key) input.Key = scopeKey(input.Key);
      if (input.Item) input.Item = scopeKey(input.Item);
      if (input.ExclusiveStartKey) input.ExclusiveStartKey = scopeKey(input.ExclusiveStartKey);
      if (command instanceof QueryCommand && !input.ExpressionAttributeValues?.[":pk"]) throw new Error("tenant_partition_required");
      if (input.ExpressionAttributeValues?.[":pk"]) {
        input.ExpressionAttributeValues = { ...input.ExpressionAttributeValues, ":pk": prefix + input.ExpressionAttributeValues[":pk"] };
      }
      if (![GetCommand, PutCommand, DeleteCommand, UpdateCommand, QueryCommand].some((Command) => command instanceof Command)) throw new Error("unsupported_tenant_operation");
      const result = await client.send(new command.constructor(input));
      return { ...result,
        ...(result.Item ? { Item: unscopeKey(result.Item) } : {}),
        ...(result.Items ? { Items: result.Items.map(unscopeKey) } : {}),
        ...(result.Attributes ? { Attributes: unscopeKey(result.Attributes) } : {}),
        ...(result.LastEvaluatedKey ? { LastEvaluatedKey: unscopeKey(result.LastEvaluatedKey) } : {})
      };
    }
  };
}
