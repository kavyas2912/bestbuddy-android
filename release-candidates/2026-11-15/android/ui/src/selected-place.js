import {locationInput} from './regional-headlines.js';

// Selected place is authoritative; physical/device location is never substituted.
export async function saveSelectedPlace({input, country, symbols, invoke, httpGet, online}) {
  const selected = locationInput(input, country);
  let place = {city:selected.city, lat:null, lon:null, symbols};
  let coverage = selected.region, verified = false;
  if (online && selected.city) {
    try {
      const query = new URLSearchParams({name:selected.city,countryCode:selected.country,count:'10'});
      const rows = JSON.parse(await httpGet('https://geocoding-api.open-meteo.com/v1/search?'+query)).results || [];
      const found = rows.find(row=>row.country_code===selected.country &&
        (!selected.state || row.admin1?.toLowerCase()===selected.state.toLowerCase())) ||
        rows.find(row=>row.country_code===selected.country);
      if (found) {
        place = {...place,city:found.name,lat:found.latitude,lon:found.longitude};
        coverage = locationInput(found.name,selected.country,found.admin1||'').region;
        verified = true;
      }
    } catch { /* Save the chosen place even when weather coordinates cannot be fetched. */ }
  }
  const savedCountry = await invoke('vce_region',{country:selected.country});
  const current = await invoke('vce_place');
  if (typeof current?.symbols === 'string') place.symbols = current.symbols;
  await invoke('vce_set_place',place);
  return {...place,country:savedCountry,region:coverage,verified};
}
