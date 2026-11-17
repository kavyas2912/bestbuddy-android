import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createTopicResearch,publicTopic,publicUrl,extractArticle} from '../ui/src/topic-research.js';
const require=createRequire(process.env.BESTBUDDY_TEST_REQUIRE_FROM||import.meta.url);
const {JSDOM}=require('jsdom');
globalThis.DOMParser=new JSDOM('').window.DOMParser;
const paragraph='Gardening offers a practical way to explore plants, soil and the changing seasons. This article explains several approaches to growing herbs in a small garden.';
const html='<html><title>Gardening with herbs</title><nav>Navigation</nav><article><h1>Gardening with herbs</h1><p>'+paragraph+'</p><script>throw Error("must not execute")</script></article></html>';
test('topic discovery excludes private identifiers and local network URLs without blocking public interests',()=>{
 assert.equal(publicTopic('AI'),'AI');assert.equal(publicTopic('gardening'),'gardening');
 for(const topic of ['my diagnosis','password reset','phone 900001','my daughter'])assert.equal(publicTopic(topic),null);
 for(const url of ['http://example.org','https://127.0.0.1/a','https://user:pass@example.org','https://a.local/page'])assert.equal(publicUrl(url),null);
 assert(publicUrl('https://example.org/gardening'));
});
test('web search captures attributed article text and refreshes it only when due',async()=>{
 let clock=Date.UTC(2026,10,17),state={},saved=[];const calls=[];
 const research=createTopicResearch({now:()=>clock,allowed:()=>true,getState:()=>state,saveState:value=>state=value,
  fetchText:async url=>{calls.push(url);return url.includes('bing.com')?'<rss><channel><item><title>Herb gardening</title><link>https://example.org/herbs</link></item></channel></rss>':html;},
  ingest:async rows=>{saved.push(...rows);return rows.length;}});
 assert.equal((await research.refresh(['gardening'],'Boston')).fetched,1);
 assert(saved[0].source.startsWith('example.org'));assert.equal(saved[0].url,'https://example.org/herbs');assert.equal(saved[0].summary,paragraph);
 assert(!saved[0].summary.includes('must not execute'));const before=calls.length;
 await research.refresh(['gardening']);assert.equal(calls.length,before);
 clock+=3600001;await research.refresh(['gardening']);assert(calls.length>before);
});
test('consent withdrawal while a source is loading prevents capture and subsequent requests',async()=>{
 let allowed=true,state={},ingested=0;const calls=[];
 const research=createTopicResearch({allowed:()=>allowed,getState:()=>state,saveState:value=>state=value,
  fetchText:async url=>{calls.push(url);allowed=false;return '<rss><channel><item><title>Gardening</title><link>https://example.org/herbs</link></item></channel></rss>';},
  ingest:async()=>{ingested++;return 1;}});
 await research.refresh(['gardening']);assert.equal(ingested,0);assert.equal(calls.length,1);
 await research.refresh(['gardening']);assert.equal(calls.length,1);
});
test('an inaccessible source leaves the existing native cache intact and uses bounded retries',async()=>{
 let clock=Date.UTC(2026,10,17),state={},calls=0;
 const research=createTopicResearch({now:()=>clock,allowed:()=>true,getState:()=>state,saveState:value=>state=value,
  fetchText:async()=>{calls++;throw Error('offline')},ingest:async()=>{throw Error('must not replace cached material')}});
 await research.refresh(['gardening']);assert.equal(calls,2);
 await research.refresh(['gardening']);assert.equal(calls,2);
 clock+=600001;await research.refresh(['gardening']);assert.equal(calls,4);
});
test('navigation pages and unrelated paragraphs are not advertised as captured articles',()=>{
 assert.equal(extractArticle('<nav>Gardening</nav><p>Sign in to continue.</p>',{url:'https://example.org',title:'Home'},'gardening'),null);
});
