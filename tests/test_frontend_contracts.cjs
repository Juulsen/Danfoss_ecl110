// Logic/event contracts without a browser. Visual layout is covered by test_card.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events=[];}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
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
for(const file of ['ecl110-plant.js','ecl110-diagram.js','ecl110-chart.js','ecl110-wizard.js','ecl110-art.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const storedOff=context.Ecl110Plant.normalize({connection:'veksler',veksler:false,valve:'3vejs',ventil_3vejs:false});
assert.equal(storedOff.connection,'direkte');
assert.equal(storedOff.veksler,false);
assert.equal(storedOff.valve,'2vejs');
assert.equal(storedOff.ventil_3vejs,false);
assert.equal(context.Ecl110Plant.normalize({}).valve,'3vejs');
assert.equal(JSON.stringify(context.Ecl110Art.layers(false,{connection:'veksler',valve:'3vejs'})),JSON.stringify(['ecl110-anlaeg.svg','svg/veksler.svg','svg/ventil-3vejs.svg']));
assert.equal(JSON.stringify(context.Ecl110Art.layers(true,{connection:'direkte',valve:'2vejs'})),JSON.stringify(['ecl110-mobil.svg','svg/direkte-mobil.svg','svg/ventil-2vejs-mobil.svg']));
const gridCard=new Card();
assert.equal(JSON.stringify(gridCard.getGridOptions()),JSON.stringify({columns:12,min_columns:6,rows:'auto'}));
const variants=[
  {application:'130',type:'hex',components:['s1','s3','s4','m1','p1','radiator','meter']},
  {application:'130',type:'direct',components:['s1','s2','s3','s4','m1','p1','radiator','eca','floor']},
  {application:'130',type:'boiler',components:['s1','s3','s4','m1','p1','radiator']},
  {application:'116',type:'dhw_hex',components:['s3','s4','m1','p1']},
  {application:'116',type:'dhw_fs',components:['s2','s3','s4','m1','fs']},
];
for(const variant of variants){
  const plant=context.Ecl110Plant.normalize({...variant,type:variant.application==='116'&&variant.type==='hex'?'dhw_hex':variant.type,future:true});
  assert.equal(JSON.stringify(plant.components),JSON.stringify(variant.components));
  const markup=context.Ecl110Diagram.markup(plant,{temperature_s1:'15,2°'});
  assert.match(markup,new RegExp('data-plant-type="'+plant.type+'"'));
  const found=[...markup.matchAll(/data-part="([a-z0-9]+)"/g)].map(match=>match[1]);
  assert.equal(JSON.stringify([...found].sort()),JSON.stringify([...variant.components].sort()));
  assert.equal(new Set(found).size,found.length);
}
assert.equal(context.Ecl110Plant.normalize({application:'130',type:'dhw_fs'}).type,'hex');
assert.ok(context.Ecl110Chart.flowAt(-12,1.2,20)>40);
const curve=context.Ecl110Chart.heatCurve({slope:0.7,parallel:0,previewSlope:0.8,previewParallel:0,outdoor:15.2,flow:31.5,room:21,comma:true,nowLabel:'Nu: 15,2 °C ude · 31,5 °C frem',xTitle:'Udetemperatur',yTitle:'Fremløb'});
assert.match(curve,/data-point="live"/);
assert.match(curve,/data-series="saved"/);
assert.match(curve,/data-series="preview"/);
assert.match(curve,/>-20°/);
assert.match(curve,/Nu: 15,2/);
const same=context.Ecl110Chart.heatCurve({slope:0.7,parallel:0,previewSlope:0.7,previewParallel:0,outdoor:15.2,flow:31.5,room:21});
assert.doesNotMatch(same,/data-series="preview"/);
assert.match(context.Ecl110Chart.history([{id:'temperature_s1',name:'Ude',points:[[Date.now()-3600000,15],[Date.now(),16]]}],{comma:true}),/data-series="temperature_s1"/);
console.log('PASS: plant schema, five diagram variants and charts');

// Exercise the actual overview controls and their existing HA service path.
(async()=>{
  const quick=new Card();quick.catalog=catalog;quick.config={device:'one'};
  const states={},calls=[];
  const put=(id,key,state,attributes={})=>states[id]={state,attributes:{ecl_device:'one',ecl_application:'130',register_key:key,...attributes}};
  put('select.mode','desired_mode','auto',{options:['auto','comfort','setback','standby']});
  put('select.boost','boost','off',{options:['off','one_percent','10 %','99 %']});
  put('number.shift','parallel_displacement','0',{min:-20,max:20,step:1});
  quick._hass={language:'da',states,callService:async(...args)=>calls.push(args)};
  quick.render=()=>{};
  const draw=()=>{const host=new Element('div');quick.overviewControls(host);return host;};
  const rows=host=>host.children.filter(n=>n.className==='row');
  let host=draw();assert.equal(rows(host).length,3);assert.equal(calls.length,0);
  const shift=rows(host)[1].children[1],boost=rows(host)[2].children[1];
  assert.equal(shift.type,'number');assert.equal(shift.min,-20);assert.equal(shift.max,20);assert.equal(shift.step,1);
  shift.reportValidity=()=>true;shift.value='-5';shift.onchange();await Promise.resolve();
  assert.deepEqual(calls[0].slice(0,2),['number','set_value']);assert.equal(calls[0][2].entity_id,'number.shift');assert.equal(calls[0][2].value,-5);
  boost.value='10 %';boost.onchange();await Promise.resolve();
  assert.deepEqual(calls[1].slice(0,2),['select','select_option']);assert.equal(calls[1][2].option,'10 %');
  boost.value='off';boost.onchange();await Promise.resolve();assert.equal(calls[2][2].option,'off');
  shift.value='';shift.onchange();assert.equal(calls.length,3);
  shift.value='21';shift.reportValidity=()=>false;shift.onchange();assert.equal(calls.length,3);
  states['select.boost'].state='unavailable';assert.equal(rows(draw())[2].children[1].disabled,true);
  quick.busy=true;assert.ok(rows(draw()).every(r=>r.children[1].disabled));quick.busy=false;
  for(const app of ['116','all']){for(const s of Object.values(states))s.attributes.ecl_application=app;assert.equal(rows(draw()).length,1);}
  for(const s of Object.values(states))s.attributes.ecl_application='130';
  states['select.other_boost']={state:'off',attributes:{...states['select.boost'].attributes,ecl_device:'two',options:['off']}};
  delete states['select.boost'];host=draw();assert.equal(rows(host)[2].children[1].tag,'span');assert.ok(host.children.some(n=>n.textContent?.includes('Aktivér indstillingsentiteten')));
  quick._hass.language='en';assert.ok(draw().children.some(n=>n.textContent?.includes('does not start an immediate boost')));
  quick._hass.callService=async()=>{throw Error('readback failed');};await quick.saveOne('number.shift',3);assert.match(quick.message,/could not be confirmed.*readback failed/);assert.equal(quick.busy,false);
  console.log('PASS: overview heating controls, bounds, service writes, errors, unavailable state, device/application isolation and translations');
})().catch(error=>{console.error(error);process.exitCode=1;});
