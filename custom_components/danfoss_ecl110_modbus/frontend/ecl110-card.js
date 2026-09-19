/* ECL110 dashboard by Juulsen. No external card or CDN dependencies. */
const ECL_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const ECL_SLOTS = ['start_1','stop_1','start_2','stop_2'];
const ECL_TIMES = Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`).concat('24:00');
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
const minutes = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
class Ecl110Card extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this.tab=0;this.pending=new Map();this.busy=false;this.message='';}
  setConfig(config){this.config=config;this.load();}
  async load(){
    try{
      const base='/ecl110-static/';
      const results=await Promise.all(['catalog.json','help.json'].map(async f=>{const r=await fetch(base+f+'?v=0.3.0');if(!r.ok)throw Error(`${f}: ${r.status}`);return r.json();}));
      [this.catalog,this.help]=results;this.render();
    }catch(e){this.message=String(e);this.render();}
  }
  set hass(hass){this._hass=hass;if(!this.shadowRoot.activeElement&&!this.busy&&!this.pending.size)this.render();}
  getCardSize(){return 9;}
  getGridOptions(){return {columns:12,min_columns:6};}
  tr(da,en){return (this.config?.language||this._hass?.language||'en').startsWith('da')?da:en;}
  lang(){return this.tr('da','en');}
  button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.disabled=this.busy;b.onclick=fn;return b;}
  entities(){
    const all=Object.entries(this._hass?.states||{}).filter(([,s])=>s.attributes.ecl_device);
    const anchor=this._hass?.states[this.config?.entity];
    const ids=[...new Set(all.map(([,s])=>s.attributes.ecl_device))];
    const device=anchor?.attributes.ecl_device||this.config?.device|| (ids.length===1?ids[0]:null);
    return all.filter(([,s])=>device&&s.attributes.ecl_device===device);
  }
  find(key,writable=true){return this.entities().find(([id,s])=>s.attributes.register_key===key&&(!writable||/^(number|select|switch)\./.test(id)));}
  name(meta){return meta?.name[this.lang()]||meta?.key||'';}
  textState(s){return this._hass?.formatEntityState?this._hass.formatEntityState(s):s.state;}
  render(){
    if(!this.config)return;
    const r=this.shadowRoot;r.replaceChildren();
    const style=el('style');style.textContent=`
      :host{display:block;color:var(--primary-text-color,#172c34)}*{box-sizing:border-box}
      ha-card{display:block;padding:22px;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:20px;overflow:hidden}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}h2{font-size:23px;margin:0}small,.muted{color:var(--secondary-text-color,#667881)}
      nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}button,input,select{font:inherit;border:1px solid var(--divider-color,#dce4e8);border-radius:10px;padding:9px 12px;color:inherit;background:var(--card-background-color,#fff)}
      button{cursor:pointer}button:hover{border-color:var(--primary-color,#168c99)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary-color,#168c99);outline-offset:2px}
      button.active,.primary{background:var(--primary-color,#168c99);color:var(--text-primary-color,#fff)}button:disabled{opacity:.5;cursor:wait}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric{padding:18px;border-radius:14px;background:var(--secondary-background-color,#eff6f7)}.value{font-size:28px;font-weight:600;margin-top:8px}
      details{border-top:1px solid var(--divider-color,#dde5e8);padding:14px 0}summary{cursor:pointer;font-weight:600}.row{display:grid;grid-template-columns:minmax(100px,1fr) auto 36px;align-items:center;gap:8px;padding:11px 0}.row input,.row select{max-width:165px;width:100%}.info{padding:6px;border-radius:50%;width:30px;height:30px;font-style:italic;font-weight:700}
      .line{display:block;font-size:11px;letter-spacing:.05em;color:var(--secondary-text-color,#78878e)}.message{white-space:pre-wrap;padding:12px;background:var(--secondary-background-color,#eef5f6);border-radius:10px;margin-bottom:12px}
      .day{border:1px solid var(--divider-color,#dce4e8);border-radius:12px;padding:14px;margin:10px 0}.periods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.periods select{width:100%;padding:7px 2px}.times{display:grid;grid-template-columns:1fr 1fr;gap:5px}.bar{position:relative;height:10px;background:var(--divider-color,#e2e9ec);border-radius:10px;margin:10px 0;overflow:hidden}.segment{position:absolute;top:0;height:100%;background:var(--primary-color,#168c99)}
      .copy{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.footer{font-size:12px;margin-top:16px;color:var(--secondary-text-color,#78878e)}
      dialog{max-width:min(620px,92vw);max-height:85vh;overflow:auto;border:1px solid var(--divider-color,#ddd);border-radius:18px;padding:24px;background:var(--card-background-color,#fff);color:inherit}dialog::backdrop{background:#0008}dialog p{line-height:1.6;white-space:pre-wrap}.formula{padding:14px;background:var(--secondary-background-color,#eff5f6);border-radius:8px;white-space:pre-wrap}.calc label{display:block;margin:12px 0}.calc input{width:100%}
      @media(max-width:440px){ha-card{padding:14px}.row{grid-template-columns:minmax(80px,1fr) 125px 30px;gap:5px}.periods{grid-template-columns:1fr}nav button{padding:8px;font-size:13px}}
    `;r.append(style);
    const card=el('ha-card');r.append(card);const head=el('header');head.append(el('h2','ECL110'),el('small','Juulsen · 0.3.0'));card.append(head);
    if(!this.catalog||!this._hass){card.append(el('p',this.message||this.tr('Indlæser…','Loading…')));return;}
    if(!this.entities().length){card.append(el('p',this.tr('Vælg en ECL110-entitet i kortets YAML: entity: sensor.… Ved flere regulatorer kræves dette valg.','Choose an ECL110 entity in the card YAML: entity: sensor.… This is required with multiple controllers.')));return;}
    const nav=el('nav');[this.tr('Overblik','Overview'),this.tr('Indstillinger','Settings'),this.tr('Ugeprogram','Schedule'),this.tr('Forslag','Suggestions')].forEach((t,i)=>nav.append(this.button(t,()=>{this.tab=i;this.render();},i===this.tab?'active':'')));card.append(nav);
    if(this.message){const msg=el('div',this.message,'message');msg.setAttribute('role','status');card.append(msg);}
    if(this.tab===0)this.overview(card);if(this.tab===1)this.settings(card);if(this.tab===2)this.schedule(card);if(this.tab===3)this.suggestions(card);
    card.append(el('div',this.tr('Ændringer gemmes i regulatoren og kontrolleres ved genlæsning.','Changes are saved in the controller and checked by readback.'),'footer'));
  }
  overview(card){
    const grid=el('div',undefined,'grid');for(const key of ['temperature_s1','temperature_s2','temperature_s3','temperature_s4']){
      const match=this.find(key,false);const meta=this.catalog.find(x=>x.key===key);const tile=el('div',undefined,'metric');const app=this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application;const names=app==='130'?{temperature_s1:this.tr('Udetemperatur · S1','Outdoor · S1'),temperature_s2:this.tr('Rumtemperatur · S2','Room · S2'),temperature_s3:this.tr('Fremløb · S3','Flow · S3'),temperature_s4:this.tr('Retur · S4','Return · S4')}:{};tile.append(el('small',names[key]||this.name(meta)),el('div',match?this.textState(match[1]):'—','value'));grid.append(tile);
    }card.append(grid);const mode=this.catalog.find(x=>x.key==='desired_mode');if(mode)card.append(this.settingRow(mode));
  }
  settings(card){
    const groups=[['2',this.tr('Fremløb og varmekurve','Flow and heat curve')],['3',this.tr('Rumregulering','Room control')],['4',this.tr('Returbegrænsning','Return limitation')],['5',this.tr('Optimering','Optimization')],['6',this.tr('Reguleringsparametre','Control parameters')],['7',this.tr('Anlæg og pumpe','System and pump')],['8',this.tr('Display og service','Display and service')]];
    const app=this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application;
    if(!app||app==='all')card.append(el('p',this.tr('Vælg applikation 130 i integrationens opsætning for at aktivere de nye varmeindstillinger.','Select application 130 in the integration setup to enable the new heating settings.'),'muted'));
    for(const [prefix,title] of groups){const d=el('details');d.append(el('summary',title));const list=this.catalog.filter(m=>m.line?.startsWith(prefix)&&(!app||m.applications.includes(app))).sort((a,b)=>Number(a.line)-Number(b.line));for(const m of list)d.append(this.settingRow(m));card.append(d);}
    const missing=el('details');missing.append(el('summary',this.tr('Menuer uden Modbus-adresse','Menus without a Modbus address')));missing.append(this.button('5081 · S1-filter',()=>this.showHelp({line:'5081',name:{da:'S1-filter',en:'S1 filter'}})));card.append(missing);
  }
  settingRow(meta){
    const row=el('div',undefined,'row');const label=el('div',this.name(meta));label.prepend(el('span',meta.line||'', 'line'));row.append(label);
    const match=this.find(meta.key);if(!match){const read=this.find(meta.key,false);row.append(el('span',read?this.textState(read[1]):this.tr('Kun læsning','Read only'),'muted'));}
    else{
      const [id,s]=match;const domain=id.split('.')[0];let control;
      if(domain==='number'){control=el('input');control.type='number';control.min=s.attributes.min;control.max=s.attributes.max;control.step=s.attributes.step;control.value=s.state==='unknown'?'':s.state;control.onchange=()=>{if(control.reportValidity()&&control.value!=='')this.saveOne(id,Number(control.value));};}
      else if(domain==='switch'){control=el('input');control.type='checkbox';control.checked=s.state==='on';control.onchange=()=>this.saveOne(id,control.checked);}
      else{control=el('select');for(const opt of s.attributes.options||[]){const o=el('option',this.optionLabel(opt));o.value=opt;control.append(o);}if(!(s.attributes.options||[]).includes(s.state)){const o=el('option',this.tr('Ukendt værdi','Unknown value'));o.value='';control.prepend(o);control.value='';}else control.value=s.state;control.onchange=()=>{if(control.value)this.saveOne(id,control.value);};}
      control.disabled=this.busy||s.state==='unavailable';control.setAttribute('aria-label',this.name(meta));row.append(control);
    }
    const info=this.button('i',()=>this.showHelp(meta),'info');info.setAttribute('aria-label',this.tr('Info om ','About ')+this.name(meta));row.append(info);return row;
  }
  optionLabel(v){return ({off:'OFF',on:'ON',one_second:this.tr('1 sekund','1 second'),one_minute:this.tr('1 minut','1 minute'),one_percent:'1 %',outdoor:this.tr('UDE','OUT'),room:this.tr('RUM','ROOM'),english:this.tr('Engelsk','English'),danish:this.tr('Dansk','Danish'),comfort:this.tr('Komfort','Comfort'),setback:this.tr('Sænkning','Setback'),standby:'Standby',auto:'AUTO'})[v]||v;}
  async call(id,value){const domain=id.split('.')[0];const service=domain==='number'?'set_value':domain==='select'?'select_option':value?'turn_on':'turn_off';const data={entity_id:id};if(domain==='number')data.value=value;if(domain==='select')data.option=value;await this._hass.callService(domain,service,data);}
  async saveOne(id,value){this.busy=true;this.message=this.tr('Gemmer…','Saving…');this.render();try{await this.call(id,value);this.message=this.tr('Gemt og genlæst.','Saved and read back.');}catch(e){this.message=this.tr('Ændringen kunne ikke bekræftes: ','Change could not be confirmed: ')+e.message;}finally{this.busy=false;this.render();}}
  modal(title){const d=el('dialog');d.append(el('h2',title));d.addEventListener('close',()=>d.remove());this.shadowRoot.append(d);return d;}
  showHelp(meta){
    const h=this.help[meta.key?.startsWith('schedule_')?'schedule':meta.line||meta.key];const d=this.modal(this.name(meta));d.append(el('p',h?.[this.lang()]||meta.description?.[this.lang()]||this.tr('Ingen dokumenteret forklaring.','No documented description.')));
    if(h?.formula)d.append(el('div',h.formula,'formula'));if(h?.example)d.append(el('p',this.tr('Eksempel: ','Example: ')+h.example));
    if(meta.address!==undefined)d.append(el('small',`Menu ${meta.line||'—'} · Holding ${meta.address} · ${meta.write_basis==='hardware-tested'?this.tr('Afprøvet på anlæg','Hardware tested'):this.tr('Kildebaseret udvidelse','Source-supported expansion')}`));
    if(h)d.append(el('p',`Danfoss ECL110 · 130: ${h.page130||'—'}${h.page116?' · 116: '+h.page116:''} (${this.tr('side','page')})`,'muted'));
    d.append(this.button(this.tr('Luk','Close'),()=>d.close()));d.showModal();
  }
  dayLabel(day){const i=ECL_DAYS.indexOf(day);return this.tr(['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'][i],['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]);}
  schedule(card){
    card.append(el('p',this.tr('To komfortperioder pr. dag. Redigér, vælg eventuelt kopidage og gem. Regulatoren skal stå i AUTO for at følge programmet.','Two comfort periods per day. Edit, optionally choose copy days, then save. The controller must be in AUTO to follow the schedule.'),'muted'));
    card.append(this.button(this.tr('Om ugeprogrammet','About schedules'),()=>this.showHelp({key:'schedule',name:{da:'Ugeprogram',en:'Schedule'}})));
    if(!this.find('schedule_monday_start_1')){card.append(el('p',this.tr('Aktivér “ECA 110-ugeprogram” under integrationens Genkonfigurér. Det tester læsning og opretter alle tidsfelter samlet.','Enable “ECA 110 weekly schedule” in the integration Reconfigure form. It tests reads and creates all time fields together.')));return;}
    for(const day of ECL_DAYS){const matches=ECL_SLOTS.map(slot=>this.find(`schedule_${day}_${slot}`));const current=matches.map(m=>m?.[1].state);const state=this.pending.get(day)||{values:current.slice(),targets:new Set()};const box=el('div',undefined,'day');box.append(el('strong',this.dayLabel(day)));
      const bar=el('div',undefined,'bar');const updateBar=()=>{bar.replaceChildren();for(let i=0;i<4;i+=2){if(!ECL_TIMES.includes(state.values[i])||!ECL_TIMES.includes(state.values[i+1]))continue;const a=minutes(state.values[i]),b=minutes(state.values[i+1]);if(b>=a){const seg=el('span',undefined,'segment');seg.style.left=`${a/14.4}%`;seg.style.width=`${(b-a)/14.4}%`;bar.append(seg);}}};updateBar();box.append(bar);
      const periods=el('div',undefined,'periods');for(let p=0;p<2;p++){const part=el('div');part.append(el('small',this.tr('Periode ','Period ')+(p+1)));const times=el('div',undefined,'times');for(let j=0;j<2;j++){const index=p*2+j;const select=el('select');for(const t of ECL_TIMES){const o=el('option',t);o.value=t;select.append(o);}if(!ECL_TIMES.includes(state.values[index])){const o=el('option','—');o.value='';select.prepend(o);select.value='';}else select.value=state.values[index];select.disabled=this.busy||!matches[index]||current[index]==='unavailable';select.setAttribute('aria-label',`${this.dayLabel(day)} ${p+1} ${j?'stop':'start'}`);select.onchange=()=>{state.values[index]=select.value;this.pending.set(day,state);updateBar();};times.append(select);}part.append(times);periods.append(part);}box.append(periods);
      const copy=el('details');copy.open=state.targets.size>0;copy.append(el('summary',this.tr('Kopiér også til…','Also copy to…')));const quick=el('div',undefined,'actions');for(const [title,targets] of [[this.tr('Hverdage','Weekdays'),ECL_DAYS.slice(0,5)],[this.tr('Weekend','Weekend'),ECL_DAYS.slice(5)],[this.tr('Alle','All'),ECL_DAYS]])quick.append(this.button(title,()=>{state.targets=new Set(targets.filter(x=>x!==day));this.pending.set(day,state);this.render();}));copy.append(quick);const labels=el('div',undefined,'copy');for(const other of ECL_DAYS.filter(x=>x!==day)){const label=el('label');const c=el('input');c.type='checkbox';c.checked=state.targets.has(other);c.disabled=this.busy;c.onchange=()=>{if(c.checked)state.targets.add(other);else state.targets.delete(other);this.pending.set(day,state);};label.append(c,document.createTextNode(this.dayLabel(other)));labels.append(label);}copy.append(labels);box.append(copy);
      const actions=el('div',undefined,'actions');actions.append(this.button(this.tr('Gem dag og valgte kopier','Save day and selected copies'),()=>this.saveDays(day,state),'primary'),this.button(this.tr('Fortryd','Discard'),()=>{this.pending.delete(day);this.render();}));box.append(actions);card.append(box);
    }
  }
  async saveDays(day,state){
    if(!state.values.every(v=>ECL_TIMES.includes(v))){this.message=this.tr('Vælg fire gyldige tider.','Choose four valid times.');this.render();return;}
    const v=state.values.map(minutes);if(!(v[0]<=v[1]&&v[1]<=v[2]&&v[2]<=v[3])){this.message=this.tr('Tider skal være i rækkefølge. En periode uden længde angives med ens start og stop.','Times must be ordered. A zero-length period uses equal start and stop.');this.render();return;}
    const days=[day,...state.targets];const jobs=[];
    for(const target of days)for(let i=0;i<4;i++){const m=this.find(`schedule_${target}_${ECL_SLOTS[i]}`);if(!m||!ECL_TIMES.includes(m[1].state)){this.message=this.tr('Alle valgte dage skal have tilgængelige, gyldige tider før gemning.','All selected days must have available valid times before saving.');this.render();return;}if(m[1].state!==state.values[i])jobs.push([m[0],state.values[i]]);}
    if(!confirm(this.tr('Gem programmet på: ','Save schedule for: ')+days.map(x=>this.dayLabel(x)).join(', ')+'?'))return;
    this.busy=true;this.render();let done=0;
    try{for(const [id,value] of jobs){await this.call(id,value);done++;}for(const d of days)this.pending.delete(d);this.message=this.tr('Program gemt og genlæst.','Schedule saved and read back.');}
    catch(e){this.message=this.tr(`Stop: ${done}/${jobs.length} ændringer bekræftet. Programmet kan være delvist ændret. Kontrollér tiderne. `,`Stopped: ${done}/${jobs.length} changes confirmed. Schedule may be partially changed. Check the times. `)+e.message;}
    finally{this.busy=false;this.render();}
  }
  suggestions(card){
    const app=this.find('heating_curve_slope')?.[1].attributes.ecl_application;
    if(app!=='130'){card.append(el('p',this.tr('Varmeforslag er kun til applikation 130. De må ikke bruges til brugsvand (116).','Heating suggestions are only for application 130, never for domestic hot water (116).')));return;}
    card.append(el('p',this.tr('Forslag ændrer kun hældning og knækpunkt efter din bekræftelse. Fremløbsgrænser, returkrav, pumpe og ventilgangtid skal passe til det konkrete anlæg.','Suggestions change only slope and knee point after confirmation. Flow limits, return requirements, pump and valve travel time must fit the actual system.')));
    for(const [name,slope,knee] of [[this.tr('Gulvvarme · startforslag','Floor heating · starting point'),0.6,'off'],[this.tr('Radiator · startforslag','Radiators · starting point'),1.2,'40 °C']]){
      const d=el('div',undefined,'day');d.append(el('strong',name),el('p',`${this.tr('Hældning','Slope')} ${slope} · ${this.tr('Knækpunkt','Knee point')} ${knee.toUpperCase()}`),this.button(this.tr('Vis ændringer','Preview changes'),()=>this.previewProfile(name,slope,knee)));card.append(d);
    }
    const calc=el('details',undefined,'calc');calc.append(el('summary',this.tr('Beregn varmekurvens hældning','Calculate heat curve slope')));
    const fields=[];for(const [label,value] of [[this.tr('Dimensionerende fremløb °C','Design flow temperature °C'),35],[this.tr('Dimensionerende udetemperatur °C','Design outdoor temperature °C'),-12],[this.tr('Ønsket rumtemperatur °C','Design room temperature °C'),20]]){const l=el('label',label);const input=el('input');input.type='number';input.step='0.1';input.value=value;l.append(input);calc.append(l);fields.push(input);}
    const result=el('p');calc.append(this.button(this.tr('Beregn','Calculate'),()=>{const [flow,out,room]=fields.map(x=>Number(x.value));const denominator=2.5*room-out-30;if(fields.some(x=>x.value==='')||![flow,out,room].every(Number.isFinite)||denominator<=0||flow===40){result.textContent=this.tr('Kontrollér input. Manualen angiver separate formler over og under 40 °C; præcis 40 °C er ikke specificeret.','Check inputs. The manual specifies separate formulas above and below 40 °C; exactly 40 °C is unspecified.');return;}const slope=flow>40?(flow-25)/denominator:(flow-20)/(1.3*denominator);result.textContent=`S = ${slope.toFixed(3)} → ${slope.toFixed(1)}. `+this.tr('Kun beregnet; intet er ændret. Gyldigt indstillingsområde: 0,1–4,0.','Calculated only; nothing changed. Valid setting range: 0.1–4.0.');}),result);card.append(calc);
  }
  previewProfile(name,slope,knee){
    const jobs=[['heating_curve_slope',slope],['knee_point',knee]].map(([key,value])=>({key,value,match:this.find(key)}));const d=this.modal(name);
    for(const j of jobs)d.append(el('p',`${this.name(this.catalog.find(x=>x.key===j.key))}: ${j.match?this.textState(j.match[1]):'—'} → ${j.value}`));
    d.append(el('p',this.tr('Danfoss 130 side 6, 12 og 31. Dette er startværdier, ikke en fuld anlægsdimensionering.','Danfoss 130 pages 6, 12 and 31. Starting values, not a complete system design.')));
    const apply=this.button(this.tr('Anvend de viste ændringer','Apply shown changes'),async()=>{d.close();this.busy=true;this.render();let done=0;try{for(const j of jobs){await this.call(j.match[0],j.value);done++;}this.message=this.tr('Forslag gemt og genlæst.','Suggestion saved and read back.');}catch(e){this.message=this.tr(`${done}/2 bekræftet; delvis ændring mulig. `,`${done}/2 confirmed; partial change possible. `)+e.message;}finally{this.busy=false;this.render();}},'primary');
    apply.disabled=this.busy||jobs.some(j=>!j.match||['unknown','unavailable'].includes(j.match[1].state));d.append(apply,this.button(this.tr('Annullér','Cancel'),()=>d.close()));d.showModal();
  }
}
if(!customElements.get('ecl110-card'))customElements.define('ecl110-card',Ecl110Card);
window.customCards=window.customCards||[];window.customCards.push({type:'ecl110-card',name:'ECL110 · Juulsen',description:'ECL110 settings, weekly schedule and manual help'});
