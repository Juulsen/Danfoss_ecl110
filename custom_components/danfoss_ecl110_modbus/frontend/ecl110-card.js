/* ECL110 dashboard by Juulsen. No external card or CDN dependencies. */
const ECL_DEFAULT_FIELDS = ['temperature_s1','temperature_s2','temperature_s3','temperature_s4'];
const ECL_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const ECL_SLOTS = ['start_1','stop_1','start_2','stop_2'];
const ECL_TIMES = Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`).concat('24:00');
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
const minutes = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
class Ecl110Card extends HTMLElement {
  static getConfigElement(){return document.createElement('ecl110-card-editor');}
  static getStubConfig(){return {overview:{fields:[...ECL_DEFAULT_FIELDS],layout:'tiles',size:'normal'}};}
  constructor(){super();this.attachShadow({mode:'open'});this.tab=0;this.pending=new Map();this.busy=false;this.message='';}
  setConfig(config){
    this.config={...config};this.overviewKey=null;this.overviewDraft=null;
    if(this.catalog)this.render();else this.load();
  }
  async load(){
    try{
      const base='/ecl110-static/';
      const results=await Promise.all(['catalog.json','help.json'].map(async f=>{const r=await fetch(base+f+'?v=0.4.5');if(!r.ok)throw Error(`${f}: ${r.status}`);return r.json();}));
      [this.catalog,this.help]=results;this.render();
    }catch(e){this.message=String(e);this.render();}
  }
  set hass(hass){
    this._hass=hass;
    if(!this.shadowRoot.activeElement&&!this.shadowRoot.querySelector('dialog[open]')&&!this.busy&&!this.pending.size&&!this.overviewDraft)this.render();
    else this.refreshOverview();
  }
  getCardSize(){
    if(this.tab!==0||this.overviewDraft)return 9;
    const view=this.overviewView||{fields:ECL_DEFAULT_FIELDS,size:'normal',layout:'tiles'};
    const columns=view.layout==='list'?1:view.size==='compact'?3:2;
    return 4+Math.ceil(view.fields.length/columns)*(view.size==='large'?3:2);
  }
  getGridOptions(){return {columns:this.config?.grid_options?.columns||12,min_columns:6,rows:'auto'};}
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
  name(meta){return this.config?.names?.[meta?.key]||meta?.name?.[this.lang()]||meta?.name?.en||meta?.key||'';}
  moreInfo(key){const match=this.entities().find(([id,s])=>id.startsWith('sensor.')&&s.attributes.register_key===key)||this.find(key,false);if(match)this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:match[0]},bubbles:true,composed:true}));}
  textState(s){return this._hass?.formatEntityState?this._hass.formatEntityState(s):s.state;}
  render(){
    if(!this.config)return;
    this.ensureOverview();
    const r=this.shadowRoot;r.replaceChildren();
    const style=el('style');style.textContent=`
      :host{display:block;container-type:inline-size;color:var(--primary-text-color,#172c34)}*{box-sizing:border-box}
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
      .overview-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
      .overview-grid{margin-bottom:12px}.overview-grid .metric{min-width:0;overflow-wrap:anywhere}.overview-grid .value{font-variant-numeric:tabular-nums}
      .overview-grid.compact{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.overview-grid.compact .metric{padding:12px}.overview-grid.compact .value{font-size:22px}
      .overview-grid.large .metric{padding:24px}.overview-grid.large .value{font-size:36px}
      .overview-grid.focus .metric:first-child{grid-column:1/-1}.overview-grid.focus .metric:first-child .value{font-size:40px}
      .overview-grid.list{grid-template-columns:1fr;gap:0}.overview-grid.list .metric{display:flex;justify-content:space-between;align-items:center;gap:12px;border-radius:0;border-bottom:1px solid var(--divider-color,#dde5e8);background:transparent}.overview-grid.list .value{margin:0;text-align:right;font-size:22px}.overview-grid.list.large .value{font-size:30px}
      .overview-editor{border:1px solid var(--divider-color,#dde5e8);padding:16px;border-radius:14px;margin-bottom:16px}.overview-editor h3{margin:0 0 14px}.overview-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.overview-controls select{display:block;width:100%;margin-top:6px}
      .overview-choice{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--divider-color,#dde5e8)}.overview-choice label{display:flex;align-items:center;gap:9px;min-width:0}.overview-choice label span{min-width:0;overflow-wrap:anywhere}.overview-choice input{flex-shrink:0;width:18px;height:18px}.overview-order{display:flex;gap:4px;flex-shrink:0}.overview-order button{padding:8px 10px;min-width:36px}.overview-order button:disabled{cursor:default}
      @container(max-width:440px){.overview-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-controls{grid-template-columns:1fr}.overview-editor{padding:12px}.overview-grid.large .metric{padding:16px}.overview-grid.large .value{font-size:28px}.overview-grid.focus .metric:first-child .value{font-size:32px}.overview-grid.list .metric{padding:12px 0}.overview-order button{min-height:44px}dialog{padding:18px}.row{overflow-wrap:anywhere}}
      @container(max-width:440px){ha-card{padding:14px}.row{grid-template-columns:minmax(80px,1fr) 125px 30px;gap:5px}.periods{grid-template-columns:1fr}nav button{padding:8px;font-size:13px}}
    `;r.append(style);
    style.textContent+=`
      :host{width:100%;min-width:0}ha-card{width:100%;height:100%}
      .overview-grid.tiles,.overview-grid.focus{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
      .overview-grid.compact:not(.list){grid-template-columns:repeat(auto-fit,minmax(min(100%,135px),1fr))}
      .overview-grid.large:not(.list){grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
      .overview-grid .metric{display:flex;flex-direction:column;text-align:left;justify-content:space-between;border:1px solid transparent;color:inherit}
      .overview-grid .metric small{display:block;min-height:2.8em;line-height:1.4}
      .overview-grid .metric .value{white-space:nowrap}.overview-grid.list .metric{flex-direction:row}.overview-grid.list .metric small{min-height:0}
    `;
    const card=el('ha-card');r.append(card);const head=el('header');head.append(el('h2',this.config.title||'ECL110'));card.append(head);
    if(!this.catalog||!this._hass){card.append(el('p',this.message||this.tr('Indlæser…','Loading…')));return;}
    if(!this.entities().length){card.append(el('p',this.tr('Vælg en ECL110-entitet i kortets YAML: entity: sensor.… Ved flere regulatorer kræves dette valg.','Choose an ECL110 entity in the card YAML: entity: sensor.… This is required with multiple controllers.')));return;}
    const nav=el('nav');[this.tr('Overblik','Overview'),this.tr('Indstillinger','Settings'),this.tr('Ugeprogram','Schedule'),this.tr('Forslag','Suggestions')].forEach((t,i)=>nav.append(this.button(t,()=>{this.tab=i;this.render();},i===this.tab?'active':'')));card.append(nav);
    if(this.message){const msg=el('div',this.message,'message');msg.setAttribute('role','status');card.append(msg);}
    if(this.tab===0)this.overview(card);if(this.tab===1)this.settings(card);if(this.tab===2)this.schedule(card);if(this.tab===3)this.suggestions(card);
    card.append(el('div',this.tab===0?(this.config.overview?this.tr('Layout gemmes i den visuelle korteditor. Klik på en værdi for historik.','Save layout in the visual card editor. Click a value for history.'):this.tr('Visningsvalg gemmes i denne browser. Brug korteditoren for at gemme i dashboardet.','Display choices are saved in this browser. Use the card editor to save in the dashboard.')):this.tr('Indstillinger gemmes i regulatoren og kontrolleres ved genlæsning.','Settings are saved in the controller and checked by readback.'),'footer'));
  }
  // Preferences never call HA services. Scope them to user, controller and optional card ID.
  normalizeOverview(value){
    const known=new Set((this.catalog||[]).map(m=>m.key));
    const fields=Array.isArray(value?.fields)?[...new Set(value.fields.filter(k=>typeof k==='string'&&known.has(k)&&!k.startsWith('schedule_')))]:[...ECL_DEFAULT_FIELDS];
    return {fields,layout:['tiles','list','focus'].includes(value?.layout)?value.layout:'tiles',size:['compact','normal','large'].includes(value?.size)?value.size:'normal'};
  }
  ensureOverview(){
    if(!this.catalog||!this._hass)return;
    const device=this.entities()[0]?.[1].attributes.ecl_device;
    if(!device)return;
    const key='ecl110:overview:v1:'+JSON.stringify([this._hass.user?.id||'local',device,this.config.overview_id||'default']);
    if(this.overviewKey===key)return;
    this.overviewKey=key;this.overviewDraft=null;this.overviewNotice='';
    this.overviewView=this.normalizeOverview(this.config.overview);
    try{const raw=localStorage.getItem(key);if(!this.config.overview&&raw!==null)this.overviewView=this.normalizeOverview(JSON.parse(raw));}
    catch{this.overviewNotice=this.tr('Gemte visningsvalg kunne ikke læses. Standardvisningen bruges.','Saved display choices could not be read. Using the default view.');}
  }
  overviewName(key){
    if(this.config.names?.[key])return this.config.names[key];
    const app=this.entities()[0]?.[1].attributes.ecl_application;
    const names=app==='130'?{temperature_s1:this.tr('Ude Temperatur(S1)','Outdoor · S1'),temperature_s2:this.tr('Rumtemperatur · S2','Room · S2'),temperature_s3:this.tr('Fremløbs Temperatur(S3)','Flow · S3'),temperature_s4:this.tr('Returløbs Temperatur(S4)','Return · S4')}:{};
    return names[key]||this.name(this.catalog.find(m=>m.key===key));
  }
  overviewValue(key){
    const match=this.find(key)||this.find(key,false);
    if(!match)return '—';
    const [id,s]=match;
    if(s.state==='unavailable')return this.tr('Utilgængelig','Unavailable');
    if(s.state==='unknown')return this.tr('Ukendt','Unknown');
    if(id.startsWith('select.')||id.startsWith('switch.'))return this.optionLabel(s.state);
    return this.textState(key==='parallel_displacement'?{...s,attributes:{...s.attributes,unit_of_measurement:'°C'}}:s);
  }
  refreshOverview(){
    for(const value of this.shadowRoot.querySelectorAll('[data-overview-value]'))value.textContent=this.overviewValue(value.dataset.overviewValue);
  }
  overviewGrid(card){
    const view=this.overviewDraft||this.overviewView||this.normalizeOverview(this.config.overview);
    const grid=el('div',undefined,`grid overview-grid ${view.layout} ${view.size}`);
    for(const key of view.fields){const tile=this.button('',()=>this.moreInfo(key),'metric');tile.setAttribute('aria-label',this.tr('Historik: ','History: ')+this.overviewName(key));const value=el('div',this.overviewValue(key),'value');value.dataset.overviewValue=key;tile.append(el('small',this.overviewName(key)),value);grid.append(tile);}
    if(!view.fields.length)grid.append(el('p',this.tr('Ingen felter valgt. Vælg felter under Tilpas overblik.','No fields selected. Choose fields in Customize overview.')));
    card.append(grid);return grid;
  }
  overview(card){
    const bar=el('div',undefined,'overview-toolbar');bar.append(el('span',this.tr('Dit overblik','Your overview'),'muted'),this.button(this.overviewDraft?this.tr('Fortryd tilpasning','Cancel customization'):this.tr('Tilpas overblik','Customize overview'),()=>{
      this.overviewDraft=this.overviewDraft?null:JSON.parse(JSON.stringify(this.overviewView));this.render();
    }));card.append(bar);
    if(this.overviewNotice){const notice=el('p',this.overviewNotice,'message');notice.setAttribute('role','status');card.append(notice);}
    if(this.overviewDraft)this.overviewEditor(card);
    this.overviewGrid(card);
    this.overviewControls(card);
  }
  overviewControls(card){
    const mode=this.catalog.find(x=>x.key==='desired_mode');if(mode)card.append(this.settingRow(mode));
    const app=this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application;
    if(app!=='130')return;
    for(const key of ['parallel_displacement','boost']){
      const meta=this.catalog.find(x=>x.key===key);if(!meta)continue;
      card.append(this.settingRow(meta));
      if(!this.find(key))card.append(el('p',this.tr('Aktivér indstillingsentiteten på ECL110-enheden for at ændre denne værdi.','Enable the setting entity on the ECL110 device to change this value.'),'muted'));
    }
    card.append(el('p',this.tr('Parallelforskydning: −20 til +20 °C. Boost: Fra eller 1–99 % ekstra varme efter sænkning; valget starter ikke et boost med det samme. Ændringer gemmes straks.','Parallel displacement: −20 to +20 °C. Boost: Off or 1–99% extra heat after setback; changing it does not start an immediate boost. Changes are saved immediately.'),'muted'));
  }
  overviewEditor(card){
    const draft=this.overviewDraft,editor=el('section',undefined,'overview-editor');editor.append(el('h3',this.tr('Tilpas overblik','Customize overview')));
    const controls=el('div',undefined,'overview-controls');
    for(const [key,title,choices] of [
      ['layout',this.tr('Visning','Layout'),[['tiles',this.tr('Felter','Tiles')],['list',this.tr('Liste','List')],['focus',this.tr('Ét felt i fokus','Focus on first field')]]],
      ['size',this.tr('Størrelse','Size'),[['compact',this.tr('Kompakt','Compact')],['normal',this.tr('Normal','Normal')],['large',this.tr('Stor','Large')]]]
    ]){const label=el('label',title),select=el('select');select.setAttribute('aria-label',title);for(const [value,text] of choices){const option=el('option',text);option.value=value;select.append(option);}select.value=draft[key];select.onchange=()=>{draft[key]=select.value;const grid=card.querySelector('.overview-grid');grid.className=`grid overview-grid ${draft.layout} ${draft.size}`;};label.append(select);controls.append(label);}editor.append(controls);
    const list=el('div',undefined,'overview-choices');
    const draw=()=>{
      const active=this.shadowRoot.activeElement?.getAttribute('aria-label');list.replaceChildren();
      const available=this.catalog.filter(m=>!m.key.startsWith('schedule_')&&this.find(m.key,false)).map(m=>m.key);
      const keys=[...new Set([...draft.fields,...available])];
      for(const key of keys){
        const name=this.overviewName(key),row=el('div',undefined,'overview-choice'),label=el('label'),check=el('input');check.type='checkbox';check.checked=draft.fields.includes(key);check.setAttribute('aria-label',this.tr('Vis ','Show ')+name);
        check.onchange=()=>{draft.fields=check.checked?[...draft.fields,key]:draft.fields.filter(k=>k!==key);draw();};label.append(check,el('span',name));row.append(label);
        const order=el('div',undefined,'overview-order');for(const [delta,text] of [[-1,'↑'],[1,'↓']]){const index=draft.fields.indexOf(key),move=this.button(text,()=>{[draft.fields[index],draft.fields[index+delta]]=[draft.fields[index+delta],draft.fields[index]];draw();});move.setAttribute('aria-label',(delta<0?this.tr('Flyt op: ','Move up: '):this.tr('Flyt ned: ','Move down: '))+name);move.disabled=index<0||index+delta<0||index+delta>=draft.fields.length;order.append(move);}row.append(order);list.append(row);
      }
      const oldGrid=card.querySelector('.overview-grid');const newGrid=this.overviewGrid(card);if(oldGrid)oldGrid.replaceWith(newGrid);
      if(active){const target=[...list.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===active);if(target&&!target.disabled)target.focus();}
    };
    editor.append(list);const actions=el('div',undefined,'actions');actions.append(this.button(this.tr('Gem visning','Save view'),()=>{
      this.overviewView=this.normalizeOverview(draft);
      if(this.config.overview){this.overviewNotice=this.tr('Gem permanente valg gennem dashboardets visuelle korteditor. Denne forhåndsvisning gælder, indtil kortet genindlæses.','Save permanent choices through the dashboard visual card editor. This preview lasts until the card reloads.');this.overviewDraft=null;this.render();return;}
      try{localStorage.setItem(this.overviewKey,JSON.stringify(this.overviewView));this.overviewNotice=this.tr('Visning gemt i denne browser.','View saved in this browser.');}
      catch{this.overviewNotice=this.tr('Browseren tillader ikke lagring. Visningen virker nu, men gemmes ikke efter genindlæsning.','Browser storage is unavailable. The view works now but will not survive a reload.');}
      this.overviewDraft=null;this.render();
    },'primary'),this.button(this.tr('Fortryd','Cancel'),()=>{this.overviewDraft=null;this.render();}),this.button(this.tr('Standardvisning','Default view'),()=>{this.overviewDraft=this.normalizeOverview(this.config.overview);this.render();}));editor.append(actions);
    editor.append(el('p',this.tr('Gemmes for denne bruger og ECL-enhed i denne browser. Nye felter kræver, at deres entiteter er aktiveret i Home Assistant.','Saved for this user and ECL device in this browser. Additional fields require their entities to be enabled in Home Assistant.'),'muted'));card.append(editor);draw();card.querySelector('.overview-grid')?.remove();
  }
  settings(card){
    const groups=[['2',this.tr('Fremløb og varmekurve','Flow and heat curve')],['3',this.tr('Rumregulering','Room control')],['4',this.tr('Returbegrænsning','Return limitation')],['5',this.tr('Optimering','Optimization')],['6',this.tr('Reguleringsparametre','Control parameters')],['7',this.tr('Anlæg og pumpe','System and pump')],['8',this.tr('Display og service','Display and service')]];
    const app=this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application;
    if(!app||app==='all')card.append(el('p',this.tr('Vælg applikation 130 i integrationens opsætning for at aktivere de nye varmeindstillinger.','Select application 130 in the integration setup to enable the new heating settings.'),'muted'));
    for(const [prefix,title] of groups){const d=el('details');d.append(el('summary',title));const list=this.catalog.filter(m=>(m.line?.startsWith(prefix)||(prefix==='3'&&m.key==='desired_room_temperature'))&&(!app||m.applications.includes(app))).sort((a,b)=>(Number(a.line)||0)-(Number(b.line)||0));for(const m of list)d.append(this.settingRow(m));card.append(d);}
    const missing=el('details');missing.append(el('summary',this.tr('Menuer uden Modbus-adresse','Menus without a Modbus address')));missing.append(this.button(this.tr('5081 · S1-filter','5081 · S1 filter'),()=>this.showHelp({line:'5081',name:{da:'S1-filter',en:'S1 filter'}})));card.append(missing);
  }
  settingRow(meta){
    const row=el('div',undefined,'row');const label=el('div',this.name(meta)+(meta.key==='parallel_displacement'?' (°C)':''));label.prepend(el('span',meta.line||'', 'line'));row.append(label);
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
  optionLabel(v){return ({off:this.tr('Fra','Off'),on:this.tr('Til','On'),one_second:this.tr('1 sekund','1 second'),one_minute:this.tr('1 minut','1 minute'),one_percent:'1 %',outdoor:this.tr('Ude','Outdoor'),room:this.tr('Rum','Room'),english:this.tr('Engelsk','English'),danish:this.tr('Dansk','Danish'),swedish:this.tr('Svensk','Swedish'),finnish:this.tr('Finsk','Finnish'),german:this.tr('Tysk','German'),estonian:this.tr('Estisk','Estonian'),lithuanian:this.tr('Litauisk','Lithuanian'),latvian:this.tr('Lettisk','Latvian'),polish:this.tr('Polsk','Polish'),gear:this.tr('Gearmotor','Geared actuator'),comfort:this.tr('Komfort','Comfort'),setback:this.tr('Sænkning','Setback'),standby:'Standby',auto:this.tr('Automatisk','Automatic')})[v]||v;}
  async call(id,value){const domain=id.split('.')[0];const service=domain==='number'?'set_value':domain==='select'?'select_option':value?'turn_on':'turn_off';const data={entity_id:id};if(domain==='number')data.value=value;if(domain==='select')data.option=value;await this._hass.callService(domain,service,data);}
  async saveOne(id,value){this.busy=true;this.message=this.tr('Gemmer…','Saving…');this.render();try{await this.call(id,value);this.message=this.tr('Gemt og genlæst.','Saved and read back.');}catch(e){this.message=this.tr('Ændringen kunne ikke bekræftes: ','Change could not be confirmed: ')+e.message;}finally{this.busy=false;this.render();}}
  modal(title){const d=el('dialog');d.append(el('h2',title));d.addEventListener('close',()=>d.remove());this.shadowRoot.append(d);return d;}
  showHelp(meta){
    const h=this.help[meta.key?.startsWith('schedule_')?'schedule':meta.line||meta.key];const d=this.modal(this.name(meta));
    const localized=value=>typeof value==='string'?value:value?.[this.lang()]||value?.en;
    if(meta.line)d.append(el('small',this.tr('Indstilling ','Setting ')+meta.line));
    d.append(el('p',h?.[this.lang()]||this.tr('Der er endnu ingen forklaring til denne indstilling.','An explanation for this setting is not yet available.')));
    if(localized(h?.effect)){d.append(el('h3',this.tr('Hvad betyder en ændring?','What does a change do?')),el('p',localized(h.effect)));}
    if(localized(h?.example)){const example=el('div',undefined,'formula');example.append(el('strong',this.tr('Eksempel','Example')),el('p',localized(h.example)));d.append(example);}
    if(localized(h?.note))d.append(el('p',localized(h.note)));
    if(localized(h?.formula)){const details=el('details');details.append(el('summary',this.tr('Vis beregning','Show calculation')),el('p',localized(h.formula),'formula'));d.append(details);}
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
    const result=el('p');calc.append(this.button(this.tr('Beregn','Calculate'),()=>{const [flow,out,room]=fields.map(x=>Number(x.value));const denominator=2.5*room-out-30;if(fields.some(x=>x.value==='')||![flow,out,room].every(Number.isFinite)||denominator<=0||flow===40){result.textContent=this.tr('Kontrollér input. Beregningen kræver en fremløbstemperatur over eller under 40 °C; præcis 40 °C understøttes ikke.','Check inputs. The calculation requires a flow temperature above or below 40 °C; exactly 40 °C is not supported.');return;}const slope=flow>40?(flow-25)/denominator:(flow-20)/(1.3*denominator);result.textContent=`S = ${slope.toFixed(3)} → ${slope.toFixed(1)}. `+this.tr('Kun beregnet; intet er ændret. Gyldigt indstillingsområde: 0,1–4,0.','Calculated only; nothing changed. Valid setting range: 0.1–4.0.');}),result);card.append(calc);
  }
  previewProfile(name,slope,knee){
    const jobs=[['heating_curve_slope',slope],['knee_point',knee]].map(([key,value])=>({key,value,match:this.find(key)}));const d=this.modal(name);
    for(const j of jobs)d.append(el('p',`${this.name(this.catalog.find(x=>x.key===j.key))}: ${j.match?this.textState(j.match[1]):'—'} → ${j.value}`));
    d.append(el('p',this.tr('Startværdierne skal tilpasses dit hus og varmeanlæg. Kun de to viste indstillinger ændres.','Adapt these starting values to your home and heating system. Only the two shown settings will change.')));
    const apply=this.button(this.tr('Anvend de viste ændringer','Apply shown changes'),async()=>{d.close();this.busy=true;this.render();let done=0;try{for(const j of jobs){await this.call(j.match[0],j.value);done++;}this.message=this.tr('Forslag gemt og genlæst.','Suggestion saved and read back.');}catch(e){this.message=this.tr(`${done}/2 bekræftet; delvis ændring mulig. `,`${done}/2 confirmed; partial change possible. `)+e.message;}finally{this.busy=false;this.render();}},'primary');
    apply.disabled=this.busy||jobs.some(j=>!j.match||['unknown','unavailable'].includes(j.match[1].state));d.append(apply,this.button(this.tr('Annullér','Cancel'),()=>d.close()));d.showModal();
  }
}
class Ecl110CardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){this.config=JSON.parse(JSON.stringify(config));this.render();if(!this.catalog&&!this.loading)this.load();}
  set hass(value){this._hass=value;if(!this.shadowRoot.activeElement)this.render();}
  tr(da,en){return (this.config?.language||this._hass?.language||'en').startsWith('da')?da:en;}
  async load(){this.loading=true;try{const r=await fetch('/ecl110-static/catalog.json?v=0.4.5');if(!r.ok)throw Error(r.status);this.catalog=await r.json();}catch{this.error=true;}finally{this.loading=false;this.render();}}
  changed(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:JSON.parse(JSON.stringify(this.config))},bubbles:true,composed:true}));}
  render(){
    if(!this.config)return;
    const root=this.shadowRoot;root.replaceChildren();
    const style=el('style');style.textContent=`:host{display:block;color:var(--primary-text-color)}*{box-sizing:border-box}label{display:block;margin:12px 0}input,select,button{font:inherit;color:inherit;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}label>input,label>select{display:block;width:100%;margin-top:6px}.field{border-top:1px solid var(--divider-color);padding:10px 0}.pick{display:flex;gap:8px;align-items:center}.pick input{width:20px;height:20px}.pick span{flex:1}.pick button{cursor:pointer}.alias{width:100%;margin-top:6px}p{color:var(--secondary-text-color);line-height:1.5}`;root.append(style);
    const field=(title,value,change,choices)=>{const label=el('label',title);const input=el(choices?'select':'input');if(choices){for(const [v,n] of choices){const o=el('option',n);o.value=v;input.append(o);}}input.value=value;input.onchange=()=>change(input.value);label.append(input);root.append(label);return input;};
    field(this.tr('Titel','Title'),this.config.title||'ECL110',v=>{this.config.title=v;this.changed();});
    field(this.tr('Sprog','Language'),this.config.language||'',v=>{if(v)this.config.language=v;else delete this.config.language;this.changed();this.render();},[['',this.tr('Følg Home Assistant','Follow Home Assistant')],['da','Dansk'],['en','English']]);
    const entities=Object.entries(this._hass?.states||{}).filter(([,s])=>s.attributes.ecl_device);
    const devices=new Map();for(const [id,s] of entities)if(!devices.has(s.attributes.ecl_device))devices.set(s.attributes.ecl_device,[id,s]);
    const options=[['',this.tr('Automatisk (én regulator)','Automatic (one controller)')],...[...devices.values()].map(([id,s])=>[id,s.attributes.ecl_device])];
    if(this.config.entity&&!options.some(([id])=>id===this.config.entity))options.push([this.config.entity,this.config.entity]);
    field(this.tr('Regulator','Controller'),this.config.entity||'',v=>{if(v)this.config.entity=v;else delete this.config.entity;this.changed();this.render();},options);
    const view=this.config.overview||{fields:[...ECL_DEFAULT_FIELDS],layout:'tiles',size:'normal'};
    const update=(key,value)=>{this.config.overview={...(this.config.overview||view),[key]:value};this.changed();};
    field(this.tr('Layout','Layout'),view.layout||'tiles',v=>update('layout',v),[['tiles',this.tr('Felter','Tiles')],['list',this.tr('Liste','List')],['focus',this.tr('Ét felt i fokus','Focus on first field')]]);
    field(this.tr('Størrelse','Size'),view.size||'normal',v=>update('size',v),[['compact',this.tr('Kompakt','Compact')],['normal',this.tr('Normal','Normal')],['large',this.tr('Stor','Large')]]);
    root.append(el('p',this.tr('Kortet tilpasser sig pladsen. Brug dashboardets Layout-fane til kortbredde og gør afsnittet bredere for at udnytte hele skærmen. Gem med dashboardets Gem-knap; valgene følger derefter dashboardet på alle enheder.','The card adapts to the available space. Use the dashboard Layout tab for card width and widen the section to use the full screen. Save with the dashboard Save button; choices then follow the dashboard across devices.')));
    if(!this.catalog){root.append(el('p',this.error?this.tr('Feltlisten kunne ikke hentes. Luk og åbn editoren igen.','Could not load fields. Close and reopen the editor.'):this.tr('Indlæser felter…','Loading fields…')));return;}
    const fields=view.fields||[...ECL_DEFAULT_FIELDS];
    const selectedDevice=this._hass?.states[this.config.entity]?.attributes.ecl_device||this.config.device||(devices.size===1?[...devices.keys()][0]:null);
    const available=new Set(entities.filter(([,s])=>s.attributes.ecl_device===selectedDevice).map(([,s])=>s.attributes.register_key));
    const keys=[...new Set([...fields,...this.catalog.filter(m=>available.has(m.key)&&!m.key.startsWith('schedule_')).map(m=>m.key)])];
    for(const key of keys){
      const meta=this.catalog.find(m=>m.key===key);if(!meta)continue;
      const title=this.tr(meta.name.da,meta.name.en),row=el('div',undefined,'field'),pick=el('label',undefined,'pick'),check=el('input');check.type='checkbox';check.checked=fields.includes(key);check.onchange=()=>{update('fields',check.checked?[...fields,key]:fields.filter(k=>k!==key));this.render();};pick.append(check,el('span',title));
      for(const [delta,symbol] of [[-1,'↑'],[1,'↓']]){const button=el('button',symbol);button.type='button';const i=fields.indexOf(key);button.disabled=i<0||i+delta<0||i+delta>=fields.length;button.setAttribute('aria-label',this.tr(delta<0?'Flyt op: ':'Flyt ned: ',delta<0?'Move up: ':'Move down: ')+title);button.onclick=()=>{const next=[...fields];[next[i],next[i+delta]]=[next[i+delta],next[i]];update('fields',next);this.render();};pick.append(button);}
      const alias=el('input',undefined,'alias');alias.value=this.config.names?.[key]||'';alias.placeholder=title;alias.setAttribute('aria-label',this.tr('Visningsnavn: ','Display name: ')+title);alias.onchange=()=>{const names={...this.config.names};if(alias.value.trim())names[key]=alias.value.trim();else delete names[key];this.config.names=names;this.changed();};row.append(pick,alias);root.append(row);
    }
    root.append(el('p',this.tr('Egne navne gælder i dette kort og ændrer ikke entitets-ID eller Modbus-registre. Et tomt navn bruger den oversatte standardtekst. Flere felter kræver aktiverede entiteter.','Custom names apply to this card without changing entity IDs or Modbus registers. A blank name uses the translated default. More fields require enabled entities.')));
  }
}
if(!customElements.get('ecl110-card-editor'))customElements.define('ecl110-card-editor',Ecl110CardEditor);
if(!customElements.get('ecl110-card'))customElements.define('ecl110-card',Ecl110Card);
window.customCards=window.customCards||[];window.customCards.push({type:'ecl110-card',name:'ECL110',description:'ECL110 settings, weekly schedule and setting help'});
