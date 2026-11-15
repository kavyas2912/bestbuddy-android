import {newsCatalog} from './news-geography.js';

export function countryName(value) {
  const key = String(value || '').trim().toLowerCase();
  return newsCatalog.geography.aliases[key] || key;
}

export function locationInput(city, country, region = '') {
  const parts = String(city || '').split(',').map(part => part.trim()).filter(Boolean);
  const supplied = countryName(parts.at(-1));
  const name = newsCatalog.geography.countries[supplied] ? supplied : countryName(country);
  const code = newsCatalog.geography.countries[name] || String(country || '').toUpperCase();
  const cityName = parts[0] || '';
  const rule = newsCatalog.geography.cities[name + '|' + cityName.toLowerCase()] || {};
  const state = rule.state || (parts.length > 1 && supplied !== name ? parts[1] : region);
  const coverage = rule.region || (name === 'united states' ? newsCatalog.geography.region_aliases[String(state).toLowerCase()] : '') || state;
  return {country: code, countryName: name, city: cityName, region: coverage || '', state: state || '', rule};
}

export function sourcePlan(country, city, region = '') {
  const location = locationInput(city, country, region);
  const geo = newsCatalog.geography;
  const national = geo.national[location.countryName] || [];
  const scope = (name, ids, query) => ({scope: name, query, publishers: ids.map(id => newsCatalog.publishers[id]).filter(p => p?.domain)});
  const rule = location.rule;
  const regional = rule.regional || (location.countryName === 'united states' && location.region === 'New England' ? geo.cities['united states|boston'].regional : []);
  const plan = [
    scope('Local', rule.local || [], '"' + location.city + '"'),
    scope('Regional', regional, '"' + location.region + '"'),
    scope('National', national, '"' + location.countryName + '" news'),
    scope('World', national, 'world international news'),
  ];
  // Where a city is not yet catalogued, use the country's publishers with a city-specific query.
  if (!rule.local && national.length && location.city) plan[0] = scope('Local', national, '"' + location.city + '" "' + location.countryName + '"');
  if (!regional.length && national.length && location.region) plan[1] = scope('Regional', national, '"' + location.region + '" "' + location.countryName + '"');
  for (const [topic, ids] of Object.entries(geo.topics)) plan.push(scope('Misc', ids, topic + ' news'));
  return {location, plan: plan.filter(feed => feed.publishers.length && feed.query !== '""')};
}

export function permittedPublisher(sourceUrl, publishers) {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
    return publishers.find(p => host === p.domain || host.endsWith('.' + p.domain));
  } catch { return undefined; }
}

export function createRegionalHeadlines(httpGet) {
  let cache = [], locationKey = '', fetchedAt = 0, generation = 0;
  let pendingKey = '', pending;
  let status = 'Refresh to load location-based headlines.';
  const keyFor = (country, city, region) => {
    const place = locationInput(city, country, region);
    return [place.country, place.city.toLowerCase(), place.region.toLowerCase()].join('|');
  };
  return {
    clear() {
      generation++;
      pendingKey = '';
      pending = undefined;
      cache = [];
      locationKey = '';
      fetchedAt = 0;
      status = 'Location changed. Refreshing publishers for this location.';
    },
    rows(country, city, region = '') { return locationKey === keyFor(country, city, region) ? cache : []; },
    get status() { return status; },
    async refresh(country, city, force = false, region = '') {
      const key = keyFor(country, city, region);
      if (key === pendingKey && pending) return pending;
      if (!force && key === locationKey && Date.now() - fetchedAt < 15 * 60 * 1000) return;
      const ticket = ++generation;
      if (key !== locationKey) { cache = []; locationKey = key; status = 'Fetching publishers for the selected location…'; }
      const {location, plan} = sourcePlan(country, city, region);
      const work = (async () => {
        const rows = [];
        let index = 0, failures = 0;
        async function worker() {
          while (index < plan.length && ticket === generation) {
            const feed = plan[index++];
            const domains = feed.publishers.map(p => 'site:' + p.domain).join(' OR ');
            const params = new URLSearchParams({
              q: feed.query + ' (' + domains + ') when:7d',
              hl: 'en-' + location.country, gl: location.country, ceid: location.country + ':en',
            });
            try {
              const doc = new DOMParser().parseFromString(await httpGet('https://news.google.com/rss/search?' + params), 'application/xml');
              if (doc.querySelector('parsererror')) throw Error('Unreadable news feed');
              for (const item of [...doc.querySelectorAll('item')].slice(0, 25)) {
                const source = item.querySelector('source');
                const publisher = permittedPublisher(source?.getAttribute('url'), feed.publishers);
                if (!publisher) continue;
                let title = item.querySelector('title')?.textContent?.trim() || '';
                const name = source?.textContent?.trim() || publisher.name;
                if (title.endsWith(' - ' + name)) title = title.slice(0, -name.length - 3);
                const link = item.querySelector('link')?.textContent?.trim() || '';
                if (title.length < 12 || !link.startsWith('https://')) continue;
                rows.push({title, link, summary: '', sourceName: name, sourceDomain: publisher.domain,
                  published: item.querySelector('pubDate')?.textContent || '',
                  scope: feed.scope, scopeCountry: location.country, scopeCity: location.city,
                  scopeRegion: location.region, topic: feed.scope === 'Misc' ? feed.query : 'country:' + location.country.toLowerCase()});
              }
            } catch { failures++; }
          }
        }
        await Promise.all(Array.from({length: Math.min(3, plan.length)}, worker));
        if (ticket !== generation) return;
        if (rows.length) { cache = rows; fetchedAt = Date.now(); }
        status = rows.length
          ? 'Publishers checked for ' + [location.city, location.region, location.country].filter(Boolean).join(', ') + (failures ? ' · some feeds unavailable' : '')
          : 'No verified headlines available for this location. Try refreshing later.';
      })();
      pendingKey = key;
      pending = work;
      try { await work; } finally { if (pending === work) { pending = undefined; pendingKey = ''; } }
    },
  };
}
