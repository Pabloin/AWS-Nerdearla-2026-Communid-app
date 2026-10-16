import assert from "node:assert/strict";
import test from "node:test";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../functions/api.mjs";
const req=(method,path,token,body)=>({rawPath:path,requestContext:{http:{method}},headers:token?{authorization:`Guest ${token}`}:{},body:body?JSON.stringify(body):undefined});
const data=response=>JSON.parse(response.body);

test("reInvent country passport is consented, private, immutable and tenant-scoped", async()=>{
  const items=new Map(); const key=item=>`${item.pk}|${item.sk}`;
  items.set("TENANTS|TENANT#reinvent",{pk:"TENANTS",sk:"TENANT#reinvent",id:"reinvent",name:"re:Invent",eventId:"reinvent-2026"});
  items.set("TENANTS|TENANT#argentina",{pk:"TENANTS",sk:"TENANT#argentina",id:"argentina",name:"Argentina",eventId:"argentina-2026"});
  const original=DynamoDBDocumentClient.prototype.send;
  DynamoDBDocumentClient.prototype.send=async command=>{
    const input=command.input;
    if(command instanceof GetCommand)return {Item:items.get(key(input.Key))};
    if(command instanceof PutCommand){if(input.ConditionExpression&&items.has(key(input.Item)))throw Object.assign(new Error("duplicate"),{name:"ConditionalCheckFailedException"});items.set(key(input.Item),structuredClone(input.Item));return {};}
    if(command instanceof QueryCommand)return {Items:[...items.values()].filter(item=>item.pk===input.ExpressionAttributeValues[":pk"]&&item.sk.startsWith(input.ExpressionAttributeValues[":prefix"]))};
    if(command instanceof UpdateCommand){const item={...items.get(key(input.Key))};for(const assignment of input.UpdateExpression.slice(4).split(",")){const [name,value]=assignment.trim().split(/\s*=\s*/);item[input.ExpressionAttributeNames[name]]=input.ExpressionAttributeValues[value];}items.set(key(item),item);return {Attributes:item};}
    throw new Error(`Unexpected ${command.constructor.name}`);
  };
  const call=(method,path,token,body)=>handler(req(method,`/t/reinvent${path}`,token,body));
  try{
    const invalid=await call("POST","/guests",null,{name:"Invalid guest",countryCode:"ZZ",profileConsent:true}); assert.equal(invalid.statusCode,400);
    assert.equal((await call("POST","/guests",null,{name:"No consent",countryCode:"AR"})).statusCode,422);
    const create=async(name,country)=>{const response=await call("POST","/guests",null,{name,email:`${name}@example.test`,countryCode:country,profileConsent:true});assert.equal(response.statusCode,201);return data(response);};
    const alice=await create("Alice","AR"),bob=await create("Bob","PY"),carol=await create("Carol","PY");
    const profiles=await call("GET","/profiles"); assert.equal(data(profiles).profiles.length,3);assert.ok(data(profiles).profiles.every(profile=>!("faceConsent" in profile)));assert.ok(!profiles.body.includes("@example.test"));assert.ok(!profiles.body.includes("tokenHash"));assert.ok(!profiles.body.includes(alice.token));
    assert.equal((await handler(req("GET","/t/argentina/guests/me",alice.token))).statusCode,401);
    assert.equal((await call("POST","/guests/me/encounters",alice.token,{profileId:alice.guest.profileId})).statusCode,422);
    const first=data(await call("POST","/guests/me/encounters",alice.token,{profileId:bob.guest.profileId,countryCode:"US"}));assert.equal(first.countryCode,"PY");assert.equal(first.profileName,"Bob");
    const edit=await call("PUT","/guests/me/profile",bob.token,{name:"Bob Updated",email:"",countryCode:"US",profileConsent:true});assert.equal(edit.statusCode,200);assert.equal(data(edit).guest.countryCode,"US");
    const duplicate=data(await call("POST","/guests/me/encounters",alice.token,{profileId:bob.guest.profileId}));assert.equal(duplicate.countryCode,"PY");assert.equal(duplicate.collectedAt,first.collectedAt);
    const second=data(await call("POST","/guests/me/encounters",alice.token,{profileId:carol.guest.profileId}));assert.equal(second.countryCode,"PY");
    const all=data(await call("GET","/guests/me/encounters",alice.token)).encounters;assert.equal(all.length,2);assert.equal(new Set(all.map(item=>item.countryCode)).size,1);
    items.delete(`TENANT#reinvent#EVENT#reinvent-2026|PROFILE#${bob.guest.profileId}`);
    assert.equal(data(await call("GET","/guests/me/encounters",alice.token)).encounters[0].countryCode,"PY");
    // Old private guests continue to work, and other tenants do not gain public profiles.
    assert.equal((await call("POST","/guests",null,{name:"Old app guest"})).statusCode,201);
    const legacy=data(await handler(req("POST","/t/argentina/guests",null,{name:"Argentina guest",countryCode:"AR",profileConsent:true})));assert.ok(!legacy.guest.profileId);
  }finally{DynamoDBDocumentClient.prototype.send=original;}
});
