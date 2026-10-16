import { useMemo, useState } from "react";
import world from "@svg-maps/world";
import { OwnBadge } from "./CountryFields";
import type { Encounter } from "./domain";
import { collectedCountries, countryName, mapCountryCode } from "./country-passport";

export function CountryPassport({encounters,name,profileId,country}:{encounters:Encounter[];name:string;profileId?:string;country?:string}) {
  const collection=useMemo(()=>collectedCountries(encounters),[encounters]);
  const unlocked=new Set(collection.map(item=>item.code));
  const [selected,setSelected]=useState("");
  const [zoom,setZoom]=useState(1);
  const selectedCountry=collection.find(item=>item.code===selected);
  return <main className="page country-passport"><span className="eyebrow">RE:INVENT 2026 · MI PASAPORTE</span><h1>Un mundo de <em>encuentros.</em></h1><p className="page-subtitle">Cada persona tiene una historia. Cada país, una nueva conexión.</p>
    <div className="country-stats"><div><strong>{collection.length}</strong><span>{collection.length===1?"país desbloqueado":"países desbloqueados"}</span></div><div><strong>{new Set(encounters.map(item=>`${item.eventId}:${item.builderId}`)).size}</strong><span>personas conocidas</span></div></div>
    <section className="world-map-card" aria-label="Mapa de países recolectados"><div className="world-map-heading"><h2>Tu mundo compartido</h2><div><button type="button" onClick={()=>setZoom(value=>Math.max(1,value-.5))} disabled={zoom===1} aria-label="Alejar mapa">−</button><button type="button" onClick={()=>setZoom(value=>Math.min(3,value+.5))} disabled={zoom===3} aria-label="Acercar mapa">+</button></div></div>
      <div className="world-map-scroll" tabIndex={0} aria-label="Mapa mundial; usá el zoom y desplazate para explorar"><svg viewBox={world.viewBox} style={{width:`${zoom*100}%`}} role="group" aria-label={`${collection.length} países desbloqueados en tu pasaporte`}>
        {world.locations.map((location: {id:string;name:string;path:string})=>{const code=mapCountryCode(location.id);const earned=unlocked.has(code);return <path key={location.id} d={location.path} className={`${earned?"country-earned":"country-locked"}${selected===code?" country-selected":""}`} role={earned?"button":undefined} tabIndex={earned?0:undefined} aria-label={earned?`${countryName(code)}, país desbloqueado`:undefined} onClick={earned?()=>setSelected(code):undefined} onKeyDown={earned?event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(code);}}:undefined}><title>{countryName(code)}</title></path>;})}
      </svg></div>
      <p className="world-map-legend"><span /> País desbloqueado con un encuentro</p><p className="country-map-selection" aria-live="polite">{selectedCountry?`${selectedCountry.name} · ${selectedCountry.encounters} ${selectedCountry.encounters===1?"encuentro":"encuentros"}`:collection.length?"Tocá un país iluminado para ver tus encuentros.":"Tu primer encuentro encenderá el primer país."}</p>
      {selectedCountry && <ul className="country-encounters">{encounters.filter(item=>item.countryCode===selectedCountry.code).map(item=><li key={`${item.eventId}:${item.builderId}`}><strong>{item.profileName || "Participante"}</strong><small>{new Date(item.collectedAt).toLocaleDateString("es")}</small></li>)}</ul>}
      <small className="world-map-credit">Mapa: <a href="https://mapsvg.com/maps/world" target="_blank" rel="noreferrer">MapSVG</a> / <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/world" target="_blank" rel="noreferrer">@svg-maps/world</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Colores adaptados para Comunid.</small>
    </section>
    <section className="country-collection"><h2>Países en tu pasaporte</h2>{collection.length?collection.map(item=><button key={item.code} type="button" onClick={()=>setSelected(item.code)} aria-pressed={selected===item.code}><span className="country-code">{item.code}</span><span><strong>{item.name}</strong><small>{item.encounters} {item.encounters===1?"encuentro":"encuentros"}</small></span><span aria-hidden="true">✦</span></button>):<p className="country-empty">Escaneá el QR de otra persona para empezar. Dos personas del mismo país suman dos encuentros y un solo país.</p>}</section>
    <OwnBadge profileId={profileId} name={name} country={country} />
    <p className="country-note">El país es declarado por cada participante. Tu país de origen no se suma automáticamente. Los encuentros guardan el país indicado al momento de conocerse.</p>
  </main>;
}
