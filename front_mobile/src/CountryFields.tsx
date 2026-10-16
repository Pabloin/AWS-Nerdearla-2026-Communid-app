import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { tenantProfileUrl } from "../../shared/tenant";
import { countries } from "../../shared/countries";
import { countryName } from "./country-passport";

export function CountryOptions() {
  return <><option value="">Elegí tu país o territorio</option>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</>;
}
export function OwnBadge({profileId,name,country}:{profileId?:string;name:string;country?:string}) {
  const [qr,setQr]=useState("");
  useEffect(() => {
    let active=true;
    if (profileId) void QRCode.toDataURL(tenantProfileUrl(window.location.origin,profileId),{width:280,margin:2}).then(value=>{if(active)setQr(value);}).catch(()=>{if(active)setQr("");});
    return ()=>{active=false;};
  },[profileId]);
  if (!profileId) return <p className="country-empty">Completá tu país y el permiso de publicación en Mi perfil para generar tu QR.</p>;
  return <section className="own-badge" aria-label="Mi QR de participante"><span className="eyebrow">MI BADGE · RE:INVENT</span><h2>{name}</h2><p>{countryName(country)}</p>{qr && <img src={qr} alt={`QR de ${name} para registrar un encuentro en re:Invent`} />}<small>Mostrá este QR a la persona que acabás de conocer.</small></section>;
}
