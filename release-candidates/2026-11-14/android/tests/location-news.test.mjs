import test from 'node:test';
import assert from 'node:assert/strict';
import {locationInput, sourcePlan, permittedPublisher, createRegionalHeadlines} from '../ui/src/regional-headlines.js';
test('Boston address overrides the previous India country and resolves New England', () => {
  const p = locationInput('Boston, MA, USA', 'IN');
  assert.equal(p.country, 'US');
  assert.equal(p.city, 'Boston');
  assert.equal(p.region, 'New England');
  const feeds = sourcePlan('US', 'Boston', 'Massachusetts').plan;
  assert.ok(feeds.find(f => f.scope === 'Local').publishers.some(p => p.domain === 'wbur.org'));
  assert.ok(feeds.find(f => f.scope === 'Regional').publishers.some(p => p.domain === 'nhpr.org'));
  for (const scope of ['National', 'World']) {
    const publishers = feeds.find(f => f.scope === scope).publishers;
    assert.ok(publishers.some(p => p.domain === 'npr.org'));
    assert.ok(!publishers.some(p => /bbc|india|hindu/.test(p.domain)));
  }
});
test('Changing countries changes publisher domains and rejects unverified publisher provenance', () => {
  const india = sourcePlan('IN', 'Ahmedabad').plan.find(f => f.scope === 'National');
  const boston = sourcePlan('US', 'Boston').plan.find(f => f.scope === 'Local');
  assert.ok(india.publishers.some(p => p.domain === 'thehindu.com'));
  assert.equal(permittedPublisher('https://timesofindia.indiatimes.com', boston.publishers), undefined);
  assert.equal(permittedPublisher('https://wbur.org.attacker.test', boston.publishers), undefined);
  assert.equal(permittedPublisher('https://www.wbur.org', boston.publishers).domain, 'wbur.org');
});
test('a country switch immediately hides old rows and late fetches cannot restore them', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.DOMParser = class { parseFromString() { return {querySelector:()=>null,querySelectorAll:()=>[]}; } };
  const news = createRegionalHeadlines(async () => {await gate; return '<rss/>';});
  const old = news.refresh('IN','Ahmedabad',true);
  news.clear();
  assert.deepEqual(news.rows('US','Boston','New England'),[]);
  release();
  await old;
  assert.deepEqual(news.rows('US','Boston','New England'),[]);
});

test('Every country offered by Android has verified publisher domains for national and world coverage', () => {
 for (const code of ['IN','US','GB','AU','CA','FR','DE','JP','BR','EG','NZ','ZA','HK','SG','CH','ES','CN','KR','TW','TH']) {
  const feeds = sourcePlan(code, '').plan;
  for (const scope of ['National','World']) {
   const feed = feeds.find(row => row.scope === scope);
   assert.ok(feed && feed.publishers.length >= 2, code + ' lacks ' + scope + ' sources');
  }
 }
});
