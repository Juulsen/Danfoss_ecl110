// Logic/event contracts without a browser. Visual layout is covered by test_card.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events=[];}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this.attributes[k]=v;}
  dispatchEvent(event){this.events.push(event);}
}
const definitions=new Map();
const context=vm.createContext({HTMLElement:Element,document:{createElement:tag=>new Element(tag)},customElements:{get:k=>definitions.get(k),define:(k,v)=>definitions.set(k,v)},window:{},CustomEvent:class{constructor(type,options){Object.assign(this,{type},options);}},localStorage:{getItem:()=>JSON.stringify({fields:['temperature_s4'],layout:'list',size:'large'})}});
const root=path.join(__dirname,'../custom_components/danfoss_ecl110_modbus/frontend');
vm.runInContext(fs.readFileSync(path.join(root,'ecl110-card.js'),'utf8'),context);
const Card=definitions.get('ecl110-card'),Editor=definitions.get('ecl110-card-editor');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
const states={'sensor.outside':{state:'18',attributes:{ecl_device:'one',register_key:'temperature_s1'}},'sensor.return':{state:'28',attributes:{ecl_device:'one',register_key:'temperature_s4'}}};
const hass={language:'da',user:{id:'test'},states,callService(){throw Error('Display changes must never write');}};
const card=new Card();card.catalog=catalog;card._hass=hass;card.config={overview:{fields:['temperature_s1'],layout:'tiles',size:'normal'},names:{temperature_s1:'Min have'}};
card.ensureOverview();assert.equal(card.overviewView.fields.join(','),'temperature_s1');assert.equal(card.overviewName('temperature_s1'),'Min have');
card.moreInfo('temperature_s1');assert.equal(card.events[0].type,'hass-more-info');assert.equal(card.events[0].detail.entityId,'sensor.outside');assert.equal(card.events[0].composed,true);
card.config={};card.overviewKey=null;card.ensureOverview();assert.equal(card.overviewView.layout,'list');assert.equal(card.overviewView.fields.join(','),'temperature_s4');
assert.equal(card.optionLabel('german'),'Tysk');card.config.language='en';assert.equal(card.optionLabel('german'),'German');
const editor=new Editor();editor.catalog=catalog;editor._hass=hass;editor.setConfig({type:'custom:ecl110-card',overview:{fields:['temperature_s1'],layout:'tiles',size:'normal'},grid_options:{columns:24}});
const control=title=>editor.shadowRoot.children.find(n=>n.tag==='label'&&n.textContent===title).children[0];
const layout=control('Layout');layout.value='focus';layout.onchange();
const size=control('Størrelse');size.value='large';size.onchange();
assert.equal(editor.config.overview.layout,'focus');assert.equal(editor.config.overview.size,'large');assert.equal(editor.config.grid_options.columns,24);
const row=editor.shadowRoot.children.find(n=>n.className==='field');const alias=row.children[1];alias.value='  Udenfor  ';alias.onchange();assert.equal(editor.config.names.temperature_s1,'Udenfor');
const last=editor.events.at(-1);assert.equal(last.type,'config-changed');assert.equal(last.bubbles,true);assert.equal(last.detail.config.names.temperature_s1,'Udenfor');
editor.config.names.temperature_s1='Changed later';assert.equal(last.detail.config.names.temperature_s1,'Udenfor');
for(const item of catalog){assert.ok(item.name.da,item.key);assert.ok(item.name.en,item.key);}
const help=JSON.parse(fs.readFileSync(path.join(root,'help.json')));
for(const [key,item] of Object.entries(help))for(const lang of ['da','en']){
  assert.ok(item[lang],key);for(const field of ['effect','example','formula','note'])if(item[field])assert.ok(item[field][lang],`${key}.${field}.${lang}`);
  assert.doesNotMatch([item[lang],...['effect','example','formula','note'].map(f=>item[f]?.[lang]||'')].join(' '),/PDF|manual|Danfoss|page[s]? [0-9]|side[r]? [0-9]/i);
}
console.log('PASS: configuration precedence, legacy preferences, history event, editor persistence, custom names, option translation, DA/EN help');
