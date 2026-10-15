function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers && request.headers.host ? request.headers.host.value.toLowerCase() : "";
  var mobileDomain = "${mobile_domain}";
  var appDomain = "${app_domain}";
  var adminDomain = "${admin_domain}";
  var heroDomain = "${hero_domain}";
  var somosDomain = "${somos_domain}";
  var tenantDomain = "${tenant_domain}";
  var tenantsDomain = "${tenants_domain}";
  var wwwDomain = "${www_domain}";

  if (wwwDomain && host === wwwDomain) {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: "https://${root_domain}" + uri } }
    };
  }

  if (tenantsDomain && host === tenantsDomain && (uri === "/" || uri === "/index.html")) {
    request.uri = "/tenants.html";
    return request;
  }

  if (heroDomain && host === heroDomain) {
    if (uri.indexOf("/assets/") !== 0 && uri.indexOf("/brand/") !== 0 && uri.indexOf("/app/heros/") !== 0) request.uri = "/hero.html";
    return request;
  }

  if (somosDomain && host === somosDomain) {
    if (uri.indexOf("/assets/") !== 0 && uri.indexOf("/brand/") !== 0 && uri.indexOf("/app/heros/") !== 0) request.uri = "/somos.html";
    return request;
  }

  var tenantHost = tenantDomain && host.slice(-(tenantDomain.length + 1)) === "." + tenantDomain && host !== wwwDomain && host !== mobileDomain && host !== appDomain && host !== adminDomain && host !== tenantsDomain;
  if (tenantHost && (uri === "/somos.html" || uri === "/hero.html" || uri.indexOf("/assets/") === 0 || uri.indexOf("/brand/") === 0)) return request;

  var hostSection = (mobileDomain && host === mobileDomain) || (appDomain && host === appDomain) || tenantHost ? "/app" : adminDomain && host === adminDomain ? "/admin" : "";
  if (hostSection && uri.indexOf("/app/") !== 0 && uri.indexOf("/admin/") !== 0 && uri.indexOf("/b/") !== 0) {
    request.uri = hostSection + (uri === "/" ? "/index.html" : uri);
    uri = request.uri;
  }
  var sections = ["/app", "/admin"];

  if (uri.indexOf("/b/") === 0) {
    request.uri = "/app/index.html";
    return request;
  }

  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    if (uri === section || uri === section + "/") {
      request.uri = section + "/index.html";
      break;
    }
    if (uri.indexOf(section + "/") === 0 && uri.lastIndexOf(".") < uri.lastIndexOf("/")) {
      request.uri = section + "/index.html";
      break;
    }
  }
  return request;
}
