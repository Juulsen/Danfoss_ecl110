/* ECL110 dashboard by Juulsen. No external card or CDN dependencies. */
const ECL_VERSION = '0.6.0';
async function eclLoadLibs(){
  if(globalThis.Ecl110Plant&&globalThis.Ecl110Diagram&&globalThis.Ecl110Chart&&globalThis.Ecl110Wizard&&globalThis.Ecl110Art)return;
  for(const file of ['ecl110-plant.js','ecl110-diagram.js','ecl110-chart.js','ecl110-wizard.js','ecl110-art.js']){
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/ecl110-static/'+file+'?v='+ECL_VERSION;
      script.onload=()=>resolve();
      script.onerror=()=>reject(Error(file));
      (document.head||document.documentElement).append(script);
    });
  }
}
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
  connectedCallback(){
    if(typeof ResizeObserver!=='function')return;
    this._widthObserver=new ResizeObserver(()=>{
      const width=this.getBoundingClientRect().width;
      const portrait=width>0&&width<700;
      if(portrait===this._portrait)return;
      this._portrait=portrait;
      if(this._built&&this.tab==='overview'&&this.viewMode()==='graphic')this.render();
    });
    this._widthObserver.observe(this);
  }
  disconnectedCallback(){this._widthObserver?.disconnect();}
  setConfig(config){
    this.config={...config};this.overviewKey=null;this.overviewDraft=null;
    if(this.catalog)this.render();else this.load();
  }
  async load(){
    try{
      const base='/ecl110-static/';
      await eclLoadLibs();
      const results=await Promise.all(['catalog.json','help.json'].map(async f=>{const r=await fetch(base+f+'?v='+ECL_VERSION);if(!r.ok)throw Error(`${f}: ${r.status}`);return r.json();}));
      [this.catalog,this.help]=results;this.render();
    }catch(e){this.message=String(e);this.render();}
  }
  set hass(hass){
    this._hass=hass;
    if(!this._askedPlant){this._askedPlant=true;this.loadPlant();}
    if(!this.catalog)return;
    const interactive=this.shadowRoot.activeElement||this.shadowRoot.querySelector('dialog[open]')||this.busy||this.pending.size||this.overviewDraft;
    if(!this._built){this.render();return;}
    if(interactive){this.patchArt();this.refreshOverview();return;}
    if(this._viewSig!==this.viewSig())this.render();
    else {this.patchArt();this.refreshOverview();}
  }
  getCardSize(){
    if((this.tab&&this.tab!==0&&this.tab!=='overview')||this.overviewDraft)return 9;
    if((!this.tab||this.tab===0||this.tab==='overview')&&this.viewMode()==='graphic')return this.cardPortrait()?16:8;
    const view=this.overviewView||{fields:ECL_DEFAULT_FIELDS,size:'normal',layout:'tiles'};
    const columns=view.layout==='list'?1:view.size==='compact'?3:2;
    return 4+Math.ceil(view.fields.length/columns)*(view.size==='large'?3:2);
  }
  getGridOptions(){return {columns:12,min_columns:6,rows:'auto'};}
  cardPortrait(){return this._portrait===true;}
  viewSig(){
    const plant=this.resolvedPlant();
    return [this.tab,this.viewMode(),this.cardPortrait(),plant.connection,plant.valve,this.message,this.busy,this.overviewDraft?1:0].join('|');
  }
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
      :host{display:block;container-type:inline-size;
        --ecl-bg:var(--ha-card-background,var(--card-background-color,#14171c));
        --ecl-fg:var(--primary-text-color,#e8eef6);
        --ecl-muted:var(--secondary-text-color,#93a0b0);
        --ecl-line:var(--divider-color,#2a3342);
        --ecl-control:var(--secondary-background-color,#1b212b);
        --ecl-font:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,var(--mdc-typography-body1-font-family,Roboto,ui-sans-serif,system-ui,"Segoe UI",sans-serif)));
        font-family:var(--ecl-font);color:var(--ecl-fg)}
      *{box-sizing:border-box;font-family:inherit}
      ha-card{display:block;padding:16px 16px 12px;background:var(--ecl-bg);color:var(--ecl-fg);border-radius:20px;overflow:hidden;border:1px solid var(--ecl-line)}
      header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}h2{font-size:20px;margin:0;font-weight:650}small,.muted{color:var(--ecl-muted)}
      nav{display:flex;gap:2px;flex-wrap:nowrap;overflow:auto;margin-bottom:10px;border-bottom:1px solid var(--ecl-line)}
      button,input,select{font-family:inherit;font-size:14px;border:1px solid var(--ecl-line);border-radius:10px;padding:8px 10px;color:var(--ecl-fg);background:var(--ecl-control)}
      button{cursor:pointer}button:hover{border-color:color-mix(in srgb,var(--ecl-fg) 35%,var(--ecl-line))}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #ff8a3d;outline-offset:2px}
      button.active{background:color-mix(in srgb,var(--ecl-fg) 12%,var(--ecl-control));color:var(--ecl-fg)}
      .primary{background:#ff8a3d;color:#1a1008;border-color:transparent}
      button:disabled{opacity:.5;cursor:wait}
      select{max-width:100%}option{background:var(--ecl-control);color:var(--ecl-fg)}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric{padding:18px;border-radius:14px;background:var(--ecl-control,#1b212b)}.value{font-size:28px;font-weight:600;margin-top:8px}
      details{border-top:1px solid var(--divider-color,#dde5e8);padding:14px 0}summary{cursor:pointer;font-weight:600}.row{display:grid;grid-template-columns:minmax(100px,1fr) auto 36px;align-items:center;gap:8px;padding:11px 0}.row input,.row select{max-width:165px;width:100%}.info{padding:6px;border-radius:50%;width:30px;height:30px;font-style:italic;font-weight:700}
      .line{display:block;font-size:11px;letter-spacing:.05em;color:var(--secondary-text-color,#78878e)}.message{white-space:pre-wrap;padding:12px;background:var(--secondary-background-color,#eef5f6);border-radius:10px;margin-bottom:12px}
      .day{border:1px solid var(--divider-color,#dce4e8);border-radius:12px;padding:14px;margin:10px 0}.periods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.periods select{width:100%;padding:7px 2px}.times{display:grid;grid-template-columns:1fr 1fr;gap:5px}.bar{position:relative;height:10px;background:var(--divider-color,#e2e9ec);border-radius:10px;margin:10px 0;overflow:hidden}.segment{position:absolute;top:0;height:100%;background:var(--primary-color,#168c99)}
      .copy{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.footer{font-size:12px;margin-top:16px;color:var(--secondary-text-color,#78878e)}
      dialog{max-width:min(560px,94vw);max-height:85vh;overflow:auto;border:1px solid var(--ecl-line);border-radius:18px;padding:20px;background:var(--ecl-bg);color:var(--ecl-fg);font-family:inherit}dialog::backdrop{background:#0008}dialog p{line-height:1.5;white-space:pre-wrap}dialog button,dialog input,dialog select{color:var(--ecl-fg);background:var(--ecl-control)}dialog label{display:flex;gap:8px;align-items:center;margin:6px 0}dialog select{display:block;width:100%;margin:8px 0}.formula{padding:14px;background:var(--ecl-control);border-radius:8px;white-space:pre-wrap}.calc label{display:block;margin:12px 0}.calc input{width:100%}
      .overview-toolbar{display:flex;justify-content:flex-end;margin:0 0 4px}
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
      .brand{display:flex;gap:10px;align-items:center;min-width:0}.logo{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:#ff8a3d;color:#1a1008;font-size:18px;flex:none}
      .brand small{display:block;color:var(--ecl-muted)}
      .head-tools{display:flex;align-items:center;gap:8px;flex:none}
      .mode-pill{border-radius:999px;padding:6px 12px;background:#143024;color:#b6f3d0;font-size:13px;font-weight:650}
      .view-toggle{display:flex;border:1px solid var(--ecl-line);border-radius:12px;overflow:hidden;background:var(--ecl-control)}
      .view-toggle button{border:0;border-radius:0;background:transparent;padding:6px 8px;line-height:0;color:var(--ecl-muted)}
      .view-toggle button.active{background:color-mix(in srgb,var(--ecl-fg) 14%,var(--ecl-control));color:var(--ecl-fg)}
      .view-toggle svg{width:16px;height:16px;display:block}
      nav button{display:inline-flex;gap:6px;align-items:center;background:transparent;border-color:transparent;border-radius:0;padding:8px 8px 10px;color:var(--ecl-muted);white-space:nowrap}
      nav button svg{width:16px;height:16px;flex:none}
      nav button.active{background:transparent;color:var(--ecl-fg);box-shadow:inset 0 -2px 0 #ff8a3d}
      nav button.admin .label{display:none}
      .diagram{border-radius:16px;overflow:hidden;background:#10141a}
      .diagram svg{display:block;width:100%;height:auto}
      .ecl-stack{position:relative;width:100%;line-height:0}
      .ecl-layer{position:absolute;inset:0;pointer-events:none}
      .ecl-layer:first-child{position:relative}
      .ecl-layer svg{display:block;width:100%;height:auto;pointer-events:auto}
      .ecl-flow{animation:eclchev 1.2s ease-in-out infinite}
      @keyframes eclchev{0%,100%{opacity:.4}50%{opacity:1}}
      .diagram [data-bind],.metric{cursor:pointer}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
      .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ecl-line);border-radius:999px;padding:4px 8px;font-size:12px;background:transparent;color:var(--ecl-fg)}
      .dot{width:7px;height:7px;border-radius:50%;background:#9aa6b5;display:inline-block}
      .dot.ok{background:#3dd68c}.dot.idle{background:#9aa6b5}.dot.warn{background:#ffb15a}.dot.info{background:#4aa3ff}
      .controls{display:flex;flex-direction:column;gap:8px;margin-top:4px}
      .segmented{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border:1px solid var(--ecl-line);border-radius:14px;overflow:hidden;background:var(--ecl-control)}
      .segmented button{border:0;border-radius:0;background:transparent;color:var(--ecl-fg)}
      .segmented button.active{background:color-mix(in srgb,var(--ecl-fg) 16%,var(--ecl-control));font-weight:650}
      .adjust{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
      .adjust-box{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid var(--ecl-line);border-radius:12px;padding:4px 8px;background:transparent}
      .adjust-box .cap{color:var(--ecl-muted);font-size:12px;flex:none}
      .stepper{display:flex;align-items:center;gap:4px;min-width:0;flex:1}
      .stepper button{width:32px;height:32px;padding:0;border-radius:50%;flex:none}
      .stepper strong{flex:1;text-align:center}
      .adjust-box select{flex:1;min-width:0;width:100%;background:var(--ecl-control);color:var(--ecl-fg)}
      .tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .tiles .metric{background:#171c24;border-radius:14px;padding:12px;color:#f5c16c}
      h3{font-size:13px;font-weight:650;margin:12px 0 4px}
      .curve-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
      .legend{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:12px;margin:6px 0 8px;align-items:center}
      .legend span{display:inline-flex;align-items:center;gap:6px}
      .swatch{width:16px;height:3px;border-radius:2px;display:inline-block;background:#f5c16c}
      .swatch.faint{opacity:0.35}
      .swatch.dot{width:8px;height:8px;border-radius:50%;background:#ff8a3d}
      .history{position:relative;margin-top:8px}
      .tip{position:absolute;top:8px;z-index:2;pointer-events:none;background:#111820ee;color:#fff;padding:6px 8px;border-radius:8px;font-size:12px;max-width:240px}
      .banner{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;border-radius:12px;background:#2a2118;margin-bottom:10px}
      .hidden-view{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
      .alarm{padding:8px 0;border-top:1px solid var(--divider-color,#2c3442)}
      @media (prefers-reduced-motion: reduce){.diagram .flow,.ecl-flow{animation:none}}
      .diagram .flow{animation:eclflow 1.6s linear infinite}
      @keyframes eclflow{to{stroke-dashoffset:-28}}
      .ghost{background:transparent;border-color:transparent;color:var(--ecl-muted);padding:4px 8px}
      .footer{display:flex;justify-content:space-between;gap:8px}
      @container (max-width:440px){
        .adjust{grid-template-columns:1fr}
        nav button .label{display:none}
        nav button.active .label{display:inline}
        ha-card{padding:12px}
      }
    `;
    if(typeof this.tab==='number')this.tab={0:'overview',1:'settings',2:'schedule',3:'suggest'}[this.tab]||'overview';
    const card=el('ha-card');r.append(card);const head=el('header');
    const brand=el('div',undefined,'brand');const logo=el('div','🔥','logo');const titles=el('div');titles.append(el('h2',this.config.title||this.tr('Fjernvarme','District heating')));titles.append(el('small',this.plantSubtitle()));brand.append(logo,titles);head.append(brand);
    const tools=el('div',undefined,'head-tools');
    const mode=this.find('desired_mode',false);if(mode)tools.append(el('div',this.optionLabel(mode[1].state),'mode-pill'));
    if(this.catalog&&this._hass&&this.entities().length){
      const toggle=el('div',undefined,'view-toggle');toggle.setAttribute('role','group');toggle.setAttribute('aria-label',this.tr('Skift visning','Switch view'));
      const icons={graphic:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 7h14M5 3v4"/></svg>',overview:'<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>'};
      for(const [value,label] of [['graphic',this.tr('Grafisk','Graphic')],['overview',this.tr('Felter','Tiles')]]){
        const button=this.button('',()=>this.setView(value),this.viewMode()===value?'active':'');
        button.innerHTML=icons[value];button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',this.viewMode()===value?'true':'false');toggle.append(button);
      }
      tools.append(toggle);
    }
    head.append(tools);card.append(head);
    if(!this.catalog||!this._hass){card.append(el('p',this.message||this.tr('Indlæser…','Loading…')));return;}
    if(!this.entities().length){card.append(el('p',this.tr('Vælg en ECL110-entitet i kortets YAML: entity: sensor.… Ved flere regulatorer kræves dette valg.','Choose an ECL110 entity in the card YAML: entity: sensor.… This is required with multiple controllers.')));return;}
    const nav=el('nav');
    const icon={
      overview:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 10c3-6 5-6 7 0s4 6 7 0"/></svg>',
      curve:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12c2-1 3-6 6-6s3 4 6 3"/></svg>',
      schedule:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>',
      alarms:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2a4 4 0 0 0-4 4v2l-1 2h10l-1-2V6a4 4 0 0 0-4-4zM6.5 13a1.5 1.5 0 0 0 3 0"/></svg>',
      settings:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"/></svg>',
      suggest:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.2 3.6L13 6l-3.8 1.2L8 11 6.8 7.2 3 6l3.8-1.4z"/></svg>'
    };
    const tabs=[['overview',this.tr('Overblik','Overview')],['curve',this.tr('Kurve','Curve')],['schedule',this.tr('Uge','Schedule')],['alarms',this.tr('Alarmer','Alarms')]];
    if(this.isAdmin())tabs.push(['settings',this.tr('Indstillinger','Settings')],['suggest',this.tr('Forslag','Suggestions')]);
    if(!tabs.some(([key])=>key===this.tab))this.tab='overview';
    for(const [key,label] of tabs){
      const button=this.button('',()=>{this.tab=key;this.render();},key===this.tab?'active':'');
      if(key==='settings'||key==='suggest')button.classList.add('admin');
      button.innerHTML=icon[key]+`<span class="label">${label}</span>`;
      button.setAttribute('aria-label',label);
      button.title=label;
      nav.append(button);
    }
    card.append(nav);
    if(this.isAdmin()&&!this.config.plant&&!this.remotePlant){const banner=el('div',undefined,'banner');banner.append(el('span',this.tr('Opsæt anlæg – cirka 1 min.','Set up the plant – about 1 minute.')),this.button(this.tr('Opsæt anlæg','Set up plant'),()=>this.openWizard(),'primary'));card.append(banner);}
    if(this.message){const msg=el('div',this.message,'message');msg.setAttribute('role','status');card.append(msg);}
    if(this.tab==='overview')this.overview(card);
    if(this.tab==='curve')this.curve(card);
    if(this.tab==='schedule')this.schedule(card);
    if(this.tab==='alarms')this.alarms(card);
    if(this.tab==='settings'&&this.isAdmin())this.settings(card);
    if(this.tab==='suggest'&&this.isAdmin())this.suggestions(card);
    this.ensureHistory();
    const foot=el('div',undefined,'footer');
    foot.append(el('span',this.tab==='overview'||this.tab===0?this.tr('Tryk på en værdi for historik','Tap a value for history'):this.tr('Indstillinger gemmes i regulatoren og kontrolleres ved genlæsning.','Settings are saved in the controller and checked by readback.')),el('span','Juulsen · '+ECL_VERSION));
    card.append(foot);
    this._built=true;
    this._viewSig=this.viewSig();
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
  isAdmin(){return !!this._hass?.user?.is_admin;}
  viewKey(){const device=this.entities()[0]?.[1].attributes.ecl_device||'device';return 'ecl110:view:v1:'+JSON.stringify([this._hass?.user?.id||'local',device,this.config.overview_id||'default']);}
  viewMode(){
    const fallback=this.config.view==='overview'?'overview':'graphic';
    try{const saved=localStorage.getItem(this.viewKey());if(saved==='graphic'||saved==='overview')return saved;}catch{}
    return fallback;
  }
  toggleView(){this.setView(this.viewMode()==='graphic'?'overview':'graphic');}
  setView(mode){try{localStorage.setItem(this.viewKey(),mode);}catch{}this.render();}
  fmt(value,digits=1,unit=''){if(!Number.isFinite(Number(value)))return '—';let text=Number(value).toFixed(digits);if(this.lang()==='da')text=text.replace('.',',');return unit?text+' '+unit:text;}
  num(key){const match=this.find(key,false);if(!match)return null;const raw=String(match[1].state??'').trim();if(!raw||raw==='unavailable'||raw==='unknown'||raw==='none')return null;const value=Number(raw.replace(',','.'));return Number.isFinite(value)?value:null;}
  resolvedPlant(){
    if(this.config?.plant)return globalThis.Ecl110Plant?Ecl110Plant.normalize(this.config.plant):this.config.plant;
    if(this.remotePlant)return this.remotePlant;
    return this.detectedPlant();
  }
  detectedPlant(){
    const application=String(this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application||'130');
    const present=(key)=>this.num(key)!=null;
    const components=[];
    for(const key of ['s1','s2','s3','s4'])if(present('temperature_'+key))components.push(key);
    if(application!=='116'){components.push('m1','p1','radiator');}
    const actuator=this.find('actuator_type',false)?.[1].state==='abv'?'abv':'gear';
    const eca=this.find('eca_address',false)?.[1].state;
    if(eca&&eca!=='off'&&eca!=='unavailable')components.push('eca');
    if(this.find('schedule_monday_start_1',false))components.push('eca110');
    return globalThis.Ecl110Plant?Ecl110Plant.normalize({application:application==='116'?'116':'130',type:application==='116'?'dhw_hex':'hex',actuator,components}):{application:'130',type:'hex',components,actuator,entities:{}};
  }
  plantSubtitle(){
    const plant=globalThis.Ecl110Plant?this.resolvedPlant():null;
    if(!plant)return 'ECL 110';
    const type=plant.connection==='direkte'?this.tr('direkte','direct'):plant.connection==='veksler'?this.tr('veksler','exchanger'):({hex:this.tr('veksler','exchanger'),direct:this.tr('direkte','direct'),boiler:this.tr('kedel','boiler'),dhw_hex:this.tr('brugsvand','DHW'),dhw_fs:this.tr('tapning','draw-off')}[plant.type]||plant.type);
    return `A${plant.application} · ${type}`;
  }
  async entryId(){
    if(this._entryId)return this._entryId;
    const entity=this.entities()[0]?.[0];
    if(!entity||!this._hass?.callWS)return null;
    try{const listed=await this._hass.callWS({type:'config/entity_registry/get',entity_id:entity});this._entryId=listed.config_entry_id||null;}catch{this._entryId=null;}
    return this._entryId;
  }
  async loadPlant(){
    const id=await this.entryId();
    if(!id||!this._hass?.callWS)return;
    try{const result=await this._hass.callWS({type:'danfoss_ecl110_modbus/plant/get',entry_id:id});this.remotePlant=result?.plant||null;if(!this.shadowRoot.activeElement)this.render();}catch{}
  }
  async savePlant(plant,target){
    const normalized=Ecl110Plant.normalize(plant);
    if(target==='card'){this.config.plant=normalized;this.message=this.tr('Anlæg gemt på dette kort. Gem dashboardet for at beholde det.','Plant saved on this card. Save the dashboard to keep it.');this.render();return;}
    const id=await this.entryId();
    if(!id){this.message=this.tr('Kunne ikke finde integrationen. Gem i stedet på kortet.','Could not find the integration. Save on the card instead.');this.render();return;}
    await this._hass.callWS({type:'danfoss_ecl110_modbus/plant/set',entry_id:id,plant:normalized});
    this.remotePlant=normalized;this.message=this.tr('Anlæg gemt i integrationen.','Plant saved in the integration.');this.render();
  }
  async disabledCandidates(){
    if(!this._hass?.callWS)return [];
    const id=await this.entryId();
    if(!id)return [];
    try{
      const rows=await this._hass.callWS({type:'config/entity_registry/list'});
      return rows.filter(row=>row.config_entry_id===id&&row.disabled_by).map(row=>{
        const key=['valve_open_signal','valve_close_signal','actual_mode','pump_state'].find(item=>(row.unique_id||'').endsWith('_'+item)||(row.unique_id||'').endsWith('_'+item+'_sensor'));
        return key?{entity_id:row.entity_id,key,name:row.name||row.entity_id}:null;
      }).filter(Boolean);
    }catch{return [];}
  }
  confirmEnable(rows){
    const names=rows.map(row=>row.name||row.key).join(', ');
    return confirm(this.tr('Aktivér disse deaktiverede entiteter? ','Enable these disabled entities? ')+names);
  }
  async enableEntities(ids){
    const id=await this.entryId();
    if(!id||!ids.length)return;
    await this._hass.callWS({type:'danfoss_ecl110_modbus/entities/enable',entry_id:id,entity_ids:ids});
  }
  openWizard(){if(globalThis.Ecl110Wizard)Ecl110Wizard.open(this);}
  diagramValues(){
    const plant=this.resolvedPlant();
    const values={};
    for(const key of ['temperature_s1','temperature_s2','temperature_s3','temperature_s4'])values[key]=this.fmt(this.num(key),1,'°C');
    const room=plant.entities?.room&&this._hass?.states[plant.entities.room];
    if(room&&!plant.components?.includes('s2'))values.room=this.fmt(Number(String(room.state).replace(',','.')),1,'°C');
    const target=this.num('desired_room_temperature')??this.num('desired_s2');
    if(target!=null&&values.room)values.room_target=this.fmt(target,0,'°');
    const power=plant.entities?.heat_power&&this._hass?.states[plant.entities.heat_power];
    if(power)values.heat_power=this.textState(power);
    const desired=this.num('desired_s3');
    if(desired!=null)values.desired_flow='→ '+this.fmt(desired,1,'°');
    if(plant.estimate_valve){const pct=this.valveEstimate();if(pct!=null)values.valve='≈ '+Math.round(pct)+' %';}
    return values;
  }
  valveEstimate(){
    const travel=this.num('valve_running_time')||96;
    const open=this.find('valve_open_signal',false)?.[1].state==='on';
    const close=this.find('valve_close_signal',false)?.[1].state==='on';
    const now=Date.now();
    if(this._valveAt==null){this._valveAt=now;this._valvePct=50;}
    const dt=Math.min(30,(now-this._valveAt)/1000);this._valveAt=now;
    if(open)this._valvePct=Math.min(100,this._valvePct+dt/travel*100);
    if(close)this._valvePct=Math.max(0,this._valvePct-dt/travel*100);
    return this._valvePct;
  }
  artValues(){
    const plant=this.resolvedPlant();
    const dash='–';
    const temp=(key)=>{const value=this.num(key);return value==null?dash:this.fmt(value,1,'°C');};
    const setting=(key,digits)=>{const match=this.find(key,false);if(!match)return {text:dash,bind:''};const state=String(match[1].state??'');if(!state||state==='unavailable'||state==='unknown')return {text:dash,bind:key};if(match[0].startsWith('select.')||match[0].startsWith('switch.'))return {text:this.optionLabel(state),bind:key};const value=this.num(key);if(value==null)return {text:this.optionLabel(state),bind:key};const unit=key==='parallel_displacement'?'°C':(match[1].attributes?.unit_of_measurement||'');return {text:this.fmt(value,digits,unit),bind:key};};
    const roomEntity=plant.entities?.room;
    const roomState=roomEntity&&this._hass?.states?.[roomEntity];
    let room={text:temp('temperature_s2'),bind:'temperature_s2'};
    if(roomState){const value=Number(String(roomState.state).replace(',','.'));room={text:Number.isFinite(value)?this.fmt(value,1,'°C'):dash,bind:roomEntity};}
    const pump=this.find('pump_state',false);
    const pumpText=!pump||['unavailable','unknown',''].includes(String(pump[1].state||''))?dash:(pump[1].state==='on'?this.tr('Til','On'):this.tr('Fra','Off'));
    let valveText=dash;
    if(plant.estimate_valve){const pct=this.valveEstimate();if(pct!=null)valveText=Math.round(pct)+' %';}
    const box=(text,bind)=>({text,bind:bind||''});
    return {
      'val-display':box(dash,''),
      'val-s1':box(temp('temperature_s1'),'temperature_s1'),
      'val-s3':box(temp('temperature_s3'),'temperature_s3'),
      'val-s5':box(temp('temperature_s4'),'temperature_s4'),
      'val-rum':room,
      'val-ventil':box(valveText,plant.estimate_valve?'valve_running_time':''),
      'val-pumpe':box(pumpText,pump?'pump_state':''),
      'val-driftsform':setting('desired_mode',0),
      'val-kredslob':box(dash,''),
      'val-onsket-frem':setting('desired_s3',1),
      'val-ude-akk':box(dash,''),
      'val-varmekurve':setting('heating_curve_slope',1),
      'val-parallel':setting('parallel_displacement',0),
      'val-komfort-spare':setting('desired_room_temperature',0),
      'val-sommerstop':setting('heating_cutout',0),
    };
  }
  patchArt(){
    const host=this.shadowRoot?.querySelector?.('.ecl-stack');
    if(host&&globalThis.Ecl110Art)Ecl110Art.patch(host,this.artValues());
  }
  graphic(card){
    const box=el('div',undefined,'diagram');
    const host=el('div',undefined,'ecl-stack');
    box.append(host);
    const open=(event)=>{const node=event.target.closest?.('[data-bind]');const key=node?.getAttribute('data-bind');if(!key)return;if(this._hass?.states?.[key]){this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:key},bubbles:true,composed:true}));return;}this.moreInfo(key);};
    box.addEventListener('click',open);
    const plant=this.resolvedPlant();
    const portrait=this.cardPortrait();
    if(globalThis.Ecl110Art){
      const token=this._artToken=(this._artToken||0)+1;
      Ecl110Art.mount(host,{portrait,plant,values:this.artValues(),version:ECL_VERSION}).catch((error)=>{if(this._artToken===token)host.textContent=String(error);});
    }
    card.append(box);
  }
  chip(kind,text){const node=el('span',undefined,'chip');const dot=el('i',undefined,'dot '+kind);node.append(dot,document.createTextNode(text));return node;}
  chips(card){
    const row=el('div',undefined,'chips');
    const pump=this.find('pump_state',false);
    const running=!pump||pump[1].state==='on';
    row.append(this.chip(running?'ok':'idle',pump?(running?this.tr('P1 kører','P1 running'):this.tr('P1 stopper','P1 stopped')):this.tr('P1','P1')));
    const open=this.find('valve_open_signal',false)?.[1].state==='on';
    const close=this.find('valve_close_signal',false)?.[1].state==='on';
    const valve=open?this.tr('M1 åbner','M1 opening'):close?this.tr('M1 lukker','M1 closing'):this.tr('M1 hviler','M1 idle');
    const extra=this.resolvedPlant().estimate_valve&&this.valveEstimate()!=null?' · ≈'+Math.round(this.valveEstimate())+' %':'';
    row.append(this.chip('idle',valve+extra));
    const flow=this.num('temperature_s3');const desiredFlow=this.num('desired_s3');
    if(flow!=null&&desiredFlow!=null){const delta=flow-desiredFlow;row.append(this.chip('warn',this.tr('Afv. ','Dev. ')+(delta>=0?'+':'')+this.fmt(delta,1,'K')));}
    const ret=this.num('temperature_s4');const limit=this.num('return_temperature_limit');
    if(ret!=null&&limit!=null)row.append(this.chip(ret<=limit?'info':'warn',ret<=limit?this.tr('Retur under grænse','Return below limit'):this.tr('Retur over grænse','Return above limit')));
    card.append(row);
  }
  quickBar(card){
    const wrap=el('div',undefined,'controls');
    const mode=this.find('desired_mode');
    const seg=el('div',undefined,'segmented');
    for(const [value,label] of [['auto','Auto'],['comfort',this.tr('Komfort','Comfort')],['setback',this.tr('Sænk','Setback')],['standby','Standby']]){
      const button=this.button(label,()=>mode&&this.saveOne(mode[0],value),mode&&mode[1].state===value?'active':'');
      button.disabled=this.busy||!mode||mode[1].state==='unavailable';
      seg.append(button);
    }
    wrap.append(seg);
    const adjust=el('div',undefined,'adjust');
    const shift=this.find('parallel_displacement');
    const shiftBox=el('div',undefined,'adjust-box');shiftBox.append(el('span',this.tr('Parallel','Parallel'),'cap'));
    const stepper=el('div',undefined,'stepper');
    const current=shift?Number(shift[1].state):0;
    const apply=(delta)=>{if(!shift)return;const next=Math.max(-20,Math.min(20,current+delta));this.saveOne(shift[0],next);};
    stepper.append(this.button('−',()=>apply(-1)),el('strong',(Number.isFinite(current)?current:0)+' K'),this.button('+',()=>apply(1)));
    for(const button of stepper.querySelectorAll('button'))button.disabled=this.busy||!shift;
    shiftBox.append(stepper);adjust.append(shiftBox);
    const boost=this.find('boost');
    if(boost){const boostBox=el('div',undefined,'adjust-box');boostBox.append(el('span','Boost','cap'));const select=el('select');select.setAttribute('aria-label','Boost');for(const opt of boost[1].attributes.options||[]){const o=el('option',opt==='off'?this.tr('Fra','Off'):opt);o.value=opt;select.append(o);}select.value=boost[1].state;select.disabled=this.busy||boost[1].state==='unavailable';select.onchange=()=>this.saveOne(boost[0],select.value);boostBox.append(select);adjust.append(boostBox);}
    wrap.append(adjust);
    card.append(wrap);
  }
  overview(card){
    const bar=el('div',undefined,'overview-toolbar');const customize=this.button(this.overviewDraft?this.tr('Fortryd tilpasning','Cancel customization'):this.tr('Tilpas overblik','Customize overview'),()=>{
      this.overviewDraft=this.overviewDraft?null:JSON.parse(JSON.stringify(this.overviewView));this.render();
    },'ghost');bar.append(customize);card.append(bar);
    if(this.overviewNotice){const notice=el('p',this.overviewNotice,'message');notice.setAttribute('role','status');card.append(notice);}
    if(this.overviewDraft)this.overviewEditor(card);
    if(this.viewMode()==='graphic'&&!this.overviewDraft){this.graphic(card);this.chips(card);}
    const grid=this.overviewGrid(card);
    if(this.viewMode()!=='overview'&&!this.overviewDraft)grid.classList.add('hidden-view');
    const trend=el('div',undefined,'history');card.append(trend);this.drawHistory(trend);
    this.quickBar(card);
  }
  curve(card){
    const slope=this.num('heating_curve_slope');
    const parallel=this.num('parallel_displacement')||0;
    const outdoor=this.num('temperature_s1');
    const flow=this.num('temperature_s3');
    const room=this.num('desired_room_temperature')||20;
    if(!this.curveDraft)this.curveDraft={slope,parallel};
    const box=el('div');
    const paintCurve=()=>this.paintCurve(box,slope,parallel,outdoor,flow,room);
    paintCurve();
    card.append(box);
    const legend=el('div',undefined,'legend');
    this.curveLegend(legend,slope,parallel,outdoor,flow,room);
    card.append(legend);
    if(this.isAdmin()){
      const actions=el('div',undefined,'curve-actions');
      const slopeInput=el('input');slopeInput.type='number';slopeInput.min='0.1';slopeInput.max='4';slopeInput.step='0.1';slopeInput.value=this.curveDraft.slope??'';slopeInput.setAttribute('aria-label',this.tr('Hældning','Slope'));
      const shiftInput=el('input');shiftInput.type='number';shiftInput.min='-20';shiftInput.max='20';shiftInput.step='1';shiftInput.value=this.curveDraft.parallel??0;shiftInput.setAttribute('aria-label',this.tr('Parallel','Parallel'));
      const preview=()=>{this.curveDraft={slope:Number(slopeInput.value),parallel:Number(shiftInput.value)};paintCurve();this.curveLegend(legend,slope,parallel,outdoor,flow,room);};
      slopeInput.oninput=preview;shiftInput.oninput=preview;
      actions.append(el('span',this.tr('Hældning','Slope')),slopeInput,el('span',this.tr('Parallel','Parallel')),shiftInput);
      actions.append(this.button(this.tr('Fortryd','Undo'),()=>{this.curveDraft={slope,parallel};this.render();}));
      actions.append(this.button(this.tr('Gem i ECL','Save to ECL'),async()=>{
        if(!confirm(this.tr('Skriv hældning og parallelforskydning til ECL?','Write slope and parallel shift to the ECL?')))return;
        const slopeEntity=this.find('heating_curve_slope');const shiftEntity=this.find('parallel_displacement');
        if(!slopeEntity||!shiftEntity){this.message=this.tr('Aktivér hældning og parallelforskydning på enheden.','Enable slope and parallel displacement on the device.');this.render();return;}
        this.busy=true;this.render();
        try{await this.call(slopeEntity[0],Number(slopeInput.value));await this.call(shiftEntity[0],Number(shiftInput.value));this.message=this.tr('Varmekurve gemt og genlæst.','Heat curve saved and read back.');}
        catch(e){this.message=this.tr('Ændringen kunne ikke bekræftes: ','Change could not be confirmed: ')+e.message;}
        finally{this.busy=false;this.render();}
      },'primary'));
      card.append(actions);
      card.append(el('p',this.tr('Forhåndsvisningen skriver ikke, før du bekræfter Gem i ECL. Kurven er en forenklet beregning.','The preview does not write until you confirm Save to ECL. The curve is a simplified calculation.'),'muted'));
    }else card.append(el('p',this.tr('Kun administratorer kan skrive en ny hældning til ECL.','Only administrators can write a new slope to the ECL.'),'muted'));
    const history=el('div',undefined,'history');card.append(el('h3',this.tr('Seneste 24 timer','Last 24 hours')));card.append(history);this.drawHistory(history);
  }
  curveOpts(slope,parallel,outdoor,flow,room){
    const set=globalThis.Ecl110Chart?Ecl110Chart.flowAt(outdoor,slope,room):null;
    const now=this.tr('Nu: ','Now: ')+this.fmt(outdoor,1,'°C')+this.tr(' ude · ',' outdoor · ')+this.fmt(flow,1,'°C')+this.tr(' frem',' flow');
    return {slope,parallel,previewSlope:this.curveDraft.slope,previewParallel:this.curveDraft.parallel,outdoor,flow,room,comma:this.lang()==='da',nowLabel:this.tr('Nu','Now'),nowText:now,xTitle:this.tr('Udetemperatur','Outdoor temperature'),yTitle:this.tr('Fremløb','Flow'),setpoint:set==null?null:set+parallel};
  }
  paintCurve(box,slope,parallel,outdoor,flow,room){
    if(!globalThis.Ecl110Chart)return;
    box.innerHTML=Ecl110Chart.heatCurve(this.curveOpts(slope,parallel,outdoor,flow,room));
  }
  curveLegend(legend,slope,parallel,outdoor,flow,room){
    const opts=this.curveOpts(slope,parallel,outdoor,flow,room);
    const differs=Math.abs((opts.previewSlope??slope)-slope)>0.001||Math.abs((opts.previewParallel??parallel)-parallel)>0.001;
    const item=(swatch,text)=>{const span=el('span');const mark=el('i',undefined,'swatch '+swatch);span.append(mark,document.createTextNode(text));return span;};
    legend.replaceChildren();
    if(differs){
      legend.append(item('faint',this.tr('Gemt kurve','Saved curve')));
      legend.append(item('',this.tr('Forhåndsvisning','Preview')));
    }else legend.append(item('',this.tr('Kurve (beregnet)','Curve (calculated)')));
    legend.append(item('dot',this.tr('Aktuel','Actual')));
    legend.append(el('span',opts.nowText));
    if(opts.setpoint!=null)legend.append(el('span',this.tr('Beregnet frem ved ','Calculated flow at ')+this.fmt(outdoor,1,'°C')+this.tr(' ude: ',' outdoor: ')+this.fmt(opts.setpoint,1,'°C')));
    const previewSet=globalThis.Ecl110Chart?Ecl110Chart.flowAt(outdoor,opts.previewSlope,room):null;
    if(differs&&previewSet!=null)legend.append(el('span',this.tr('Forhåndsvisning: ','Preview: ')+this.fmt(previewSet+(opts.previewParallel||0),1,'°C')));
  }
  alarms(card){
    const checks=[];
    const ret=this.num('temperature_s4');const limit=this.num('return_temperature_limit');
    if(ret!=null&&limit!=null)checks.push([ret<=limit,ret<=limit?this.tr('Retur er under grænsen','Return is below the limit'):this.tr('Retur er over grænsen','Return is above the limit')]);
    for(const key of ['temperature_s1','temperature_s3','temperature_s4']){
      const state=this.find(key,false)?.[1].state;
      if(state==='unavailable'||state==='unknown')checks.push([false,this.overviewName(key)+' '+this.tr('mangler','is missing')]);
    }
    const fresh=this.entities().some(([,s])=>s.state!=='unavailable');
    checks.push([fresh,fresh?this.tr('Kommunikation OK','Communication OK'):this.tr('Ingen tilgængelige værdier','No available values')]);
    if(!checks.length)card.append(el('p',this.tr('Ingen kontroller endnu.','No checks yet.')));
    for(const [ok,text] of checks)card.append(el('div',(ok?'● ':'○ ')+text,'alarm'));
    const log=el('div');card.append(el('h3',this.tr('Logbog','Logbook')),log);
    this.loadLog(log);
  }
  async loadLog(node){
    if(!this._hass?.callWS){node.textContent=this.tr('Logbog kræver Home Assistant.','Logbook requires Home Assistant.');return;}
    try{
      const events=await this._hass.callWS({type:'logbook/get_events',start_time:new Date(Date.now()-86400000).toISOString(),entity_ids:this.entities().slice(0,12).map(([id])=>id)});
      node.replaceChildren();
      for(const event of (events||[]).slice(-8).reverse())node.append(el('div',`${event.when||event.when_time_fired||''} ${event.name||''} ${event.state||event.message||''}`,'alarm'));
      if(!events?.length)node.append(el('p',this.tr('Ingen nylige hændelser.','No recent events.'),'muted'));
    }catch{node.textContent=this.tr('Logbogen kunne ikke hentes.','The logbook could not be loaded.');}
  }
  async ensureHistory(){
    if(this._historyLoading||!this._hass?.callWS)return;
    const now=Date.now();
    if(this._historyAt&&now-this._historyAt<60000)return;
    this._historyLoading=true;
    try{
      const ids=this.entities().filter(([id,s])=>id.startsWith('sensor.')&&['temperature_s1','temperature_s2','temperature_s3','temperature_s4'].includes(s.attributes.register_key)).map(([id])=>id);
      const room=this.resolvedPlant().entities?.room;
      if(room)ids.push(room);
      if(!ids.length)return;
      const start=new Date(now-86400000).toISOString();
      const rows=await this._hass.callWS({type:'history/history_during_period',start_time:start,entity_ids:ids,minimal_response:true,no_attributes:true});
      this._history=rows;this._historyAt=now;
      for(const box of this.shadowRoot.querySelectorAll('.history'))this.drawHistory(box);
    }catch{}
    finally{this._historyLoading=false;}
  }
  historySeries(){
    const rows=this._history||{};
    const list=Array.isArray(rows)?rows:Object.values(rows);
    return list.map(points=>{
      const id=points?.[0]?.entity_id||points?.entity_id;
      const samples=(Array.isArray(points)?points:[]).map(point=>[new Date(point.last_changed||point.lu||point.last_updated||0).getTime(),Number(point.state??point.s)]).filter(point=>Number.isFinite(point[1]));
      const key=this._hass?.states[id]?.attributes.register_key||id;
      return {id:key,name:this.overviewName(key),points:samples};
    }).filter(item=>item.points.length);
  }
  chartName(key){
    return {temperature_s1:this.tr('Ude','Outdoor'),temperature_s2:this.tr('Rum','Room'),temperature_s3:this.tr('Frem','Flow'),temperature_s4:this.tr('Retur','Return')}[key]||this.overviewName(key);
  }
  liveSeries(){
    return ['temperature_s1','temperature_s2','temperature_s3','temperature_s4'].filter(key=>this.num(key)!=null).map(key=>({id:key,name:this.chartName(key),value:this.num(key)}));
  }
  drawHistory(node){
    const series=this.historySeries().map(item=>({...item,name:this.chartName(item.id)}));
    if(!globalThis.Ecl110Chart){node.textContent='';return;}
    node.innerHTML=Ecl110Chart.history(series,{comma:this.lang()==='da',empty:this.tr('Ingen historik de seneste 24 timer.','No history for the last 24 hours.')});
    const legend=el('div',undefined,'legend');
    const live=this.liveSeries();
    const rows=live.length?live:series.map(item=>({id:item.id,name:item.name,value:item.points.at(-1)?.[1]}));
    for(const item of rows){
      const span=el('span');
      const mark=el('i',undefined,'swatch');
      mark.style.background=Ecl110Chart.color(item.id);
      span.append(mark,document.createTextNode(item.name+' '+this.fmt(item.value,1,'°C')));
      legend.append(span);
    }
    node.append(legend);
    const svg=node.querySelector('svg');
    const tip=el('div',undefined,'tip');tip.hidden=true;node.append(tip);
    const move=(event)=>{
      if(!svg||!series.length)return;
      const rect=svg.getBoundingClientRect();
      const pad=Number(svg.dataset.padX)||0;
      const plot=Number(svg.dataset.plotW)||420;
      const scale=rect.width/420;
      const ratio=(event.clientX-rect.left-pad*scale)/(plot*scale);
      const hit=Ecl110Chart.nearest(series,ratio);
      if(!hit)return;
      const when=new Date(hit.time);
      const clock=`${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}`;
      tip.hidden=false;
      const left=Math.min(rect.width-8,Math.max(8,(event.clientX-rect.left)));
      tip.style.left=left+'px';
      tip.textContent=clock+' · '+hit.rows.map(row=>row.name+' '+this.fmt(row.value,1,'°C')).join(' · ');
      const cursor=svg.querySelector('[data-cursor]');
      if(cursor){const x=pad+Math.min(1,Math.max(0,ratio))*plot;cursor.setAttribute('visibility','visible');cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
    };
    svg?.addEventListener('pointermove',move);
    svg?.addEventListener('pointerdown',move);
    svg?.addEventListener('pointerleave',()=>{tip.hidden=true;const cursor=svg.querySelector('[data-cursor]');if(cursor)cursor.setAttribute('visibility','hidden');});
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
  async persistEquipment(next){
    const plant=Ecl110Plant.normalize(next);
    if(this.config.plant){this.config.plant=plant;this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this.config},bubbles:true,composed:true}));}
    const id=await this.entryId();
    if(id&&this._hass?.callWS)await this._hass.callWS({type:'danfoss_ecl110_modbus/plant/set',entry_id:id,plant});
    this.remotePlant=plant;
    this.message=this.tr('Udstyr gemt. Tegningen er opdateret, og der er ikke skrevet til ECL110.','Equipment saved. The drawing is updated, and nothing was written to the ECL110.');
    this.render();
  }
  equipmentSection(card){
    const plant=this.resolvedPlant();
    const box=el('section',undefined,'overview-editor');
    box.append(el('h3',this.tr('Udstyr','Equipment')));
    box.append(el('p',this.tr('Tilslutning og ventil ændrer kun tegningen.','Connection and valve only change the drawing.'),'muted'));
    const row=(title,key,value,choices)=>{
      const label=el('label',title);
      const select=el('select');
      select.setAttribute('aria-label',title);
      for(const [option,text] of choices){const node=el('option',text);node.value=option;select.append(node);}
      select.value=value;
      select.onchange=()=>{
        const next={...plant};
        next[key]=select.value;
        if(key==='connection')next.veksler=select.value==='veksler';
        if(key==='valve')next.ventil_3vejs=select.value==='3vejs';
        this.persistEquipment(next);
      };
      label.append(select);box.append(label);
    };
    row(this.tr('Tilslutning','Connection'),'connection',plant.connection||'veksler',[['veksler',this.tr('Veksler','Exchanger')],['direkte',this.tr('Direkte','Direct')]]);
    row(this.tr('Ventil','Valve'),'valve',plant.valve||'3vejs',[['3vejs',this.tr('3-vejs','3-way')],['2vejs',this.tr('2-vejs','2-way')]]);
    card.append(box);
  }
  settings(card){
    this.equipmentSection(card);
    const groups=[['2',this.tr('Fremløb og varmekurve','Flow and heat curve')],['3',this.tr('Rumregulering','Room control')],['4',this.tr('Returbegrænsning','Return limitation')],['5',this.tr('Optimering','Optimization')],['6',this.tr('Reguleringsparametre','Control parameters')],['7',this.tr('Anlæg og pumpe','System and pump')],['8',this.tr('Display og service','Display and service')]];
    const app=this.entities().find(([,s])=>s.attributes.ecl_application)?.[1].attributes.ecl_application;
    if(!app||app==='all')card.append(el('p',this.tr('Vælg applikation 130 i integrationens opsætning for at aktivere de nye varmeindstillinger.','Select application 130 in the integration setup to enable the new heating settings.'),'muted'));
    for(const [prefix,title] of groups){const d=el('details');d.append(el('summary',title));const list=this.catalog.filter(m=>(m.line?.startsWith(prefix)||(prefix==='3'&&m.key==='desired_room_temperature'&&this.config?.show_room_temperature))&&(!app||m.applications.includes(app))).sort((a,b)=>(Number(a.line)||0)-(Number(b.line)||0));for(const m of list)d.append(this.settingRow(m));card.append(d);}
    if(this.config?.show_room_temperature&&!this.find('desired_room_temperature'))card.append(el('p',this.tr('Aktivér “Ønsket rumtemperatur” under integrationens Genkonfigurér for at kunne ændre sætpunktet.','Enable “Desired room temperature” in the integration Reconfigure form to change the setpoint.'),'muted'));
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
  resolvedPlant(){return globalThis.Ecl110Plant?Ecl110Plant.normalize(this.config.plant||{}): (this.config.plant||{});}
  diagramValues(){return {};}
  async disabledCandidates(){return [];}
  confirmEnable(rows){return confirm(this.tr('Aktivér disse deaktiverede entiteter? ','Enable these disabled entities? ')+rows.map(row=>row.name||row.key).join(', '));}
  async enableEntities(){}
  async savePlant(plant,target){const normalized=globalThis.Ecl110Plant?Ecl110Plant.normalize(plant):plant;this.config.plant=normalized;if(target==='integration')this.config.plant_target='integration';this.changed();}
  tr(da,en){return (this.config?.language||this._hass?.language||'en').startsWith('da')?da:en;}
  async load(){this.loading=true;try{await eclLoadLibs();const r=await fetch('/ecl110-static/catalog.json?v='+ECL_VERSION);if(!r.ok)throw Error(r.status);this.catalog=await r.json();}catch{this.error=true;}finally{this.loading=false;this.render();}}
  changed(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:JSON.parse(JSON.stringify(this.config))},bubbles:true,composed:true}));}
  render(){
    if(!this.config)return;
    const root=this.shadowRoot;root.replaceChildren();
    const style=el('style');style.textContent=`:host{display:block;color:var(--primary-text-color)}*{box-sizing:border-box}label{display:block;margin:12px 0}input,select,button{font:inherit;color:inherit;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}label>input,label>select{display:block;width:100%;margin-top:6px}label>input[type=checkbox]{display:inline-block;width:auto;margin-left:8px}.field{border-top:1px solid var(--divider-color);padding:10px 0}.pick{display:flex;gap:8px;align-items:center}.pick input{width:20px;height:20px}.pick span{flex:1}.pick button{cursor:pointer}.alias{width:100%;margin-top:6px}p{color:var(--secondary-text-color);line-height:1.5}`;root.append(style);
    const field=(title,value,change,choices)=>{const label=el('label',title);const input=el(choices?'select':'input');if(choices){for(const [v,n] of choices){const o=el('option',n);o.value=v;input.append(o);}}input.value=value;input.onchange=()=>change(input.value);label.append(input);root.append(label);return input;};
    field(this.tr('Titel','Title'),this.config.title||'ECL110',v=>{this.config.title=v;this.changed();});
    field(this.tr('Sprog','Language'),this.config.language||'',v=>{if(v)this.config.language=v;else delete this.config.language;this.changed();this.render();},[['',this.tr('Følg Home Assistant','Follow Home Assistant')],['da','Dansk'],['en','English']]);
    const entities=Object.entries(this._hass?.states||{}).filter(([,s])=>s.attributes.ecl_device);
    const devices=new Map();for(const [id,s] of entities)if(!devices.has(s.attributes.ecl_device))devices.set(s.attributes.ecl_device,[id,s]);
    const options=[['',this.tr('Automatisk (én regulator)','Automatic (one controller)')],...[...devices.values()].map(([id,s])=>[id,s.attributes.ecl_device])];
    if(this.config.entity&&!options.some(([id])=>id===this.config.entity))options.push([this.config.entity,this.config.entity]);
    field(this.tr('Regulator','Controller'),this.config.entity||'',v=>{if(v)this.config.entity=v;else delete this.config.entity;this.changed();this.render();},options);
    const roomLabel=el('label',this.tr('Vis ønsket rumtemperatur','Show desired room temperature'));const room=el('input');room.type='checkbox';room.checked=!!this.config.show_room_temperature;room.onchange=()=>{this.config.show_room_temperature=room.checked;this.changed();};roomLabel.append(room);root.append(roomLabel);
    const setup=el('button',this.tr('Opsæt anlæg…','Set up plant…'));setup.type='button';setup.onclick=()=>globalThis.Ecl110Wizard&&Ecl110Wizard.open(this);root.append(setup);
    const view=this.config.overview||{fields:[...ECL_DEFAULT_FIELDS],layout:'tiles',size:'normal'};
    const update=(key,value)=>{this.config.overview={...(this.config.overview||view),[key]:value};this.changed();};
    const equipment=globalThis.Ecl110Plant?Ecl110Plant.normalize(this.config.plant||this.resolvedPlant()):this.resolvedPlant();
    const storeEquipment=(patch)=>{
      const next=Ecl110Plant.normalize({...equipment,...patch});
      this.config.plant=next;
      this.changed();
    };
    field(this.tr('Tilslutning','Connection'),equipment.connection||'veksler',v=>storeEquipment({connection:v,veksler:v==='veksler'}),[['veksler',this.tr('Veksler','Exchanger')],['direkte',this.tr('Direkte','Direct')]]);
    field(this.tr('Ventil','Valve'),equipment.valve||'3vejs',v=>storeEquipment({valve:v,ventil_3vejs:v==='3vejs'}),[['3vejs',this.tr('3-vejs','3-way')],['2vejs',this.tr('2-vejs','2-way')]]);
    field(this.tr('Standardvisning','Default view'),this.config.view||'graphic',v=>{this.config.view=v;this.changed();},[['graphic',this.tr('Grafisk','Graphic')],['overview',this.tr('Overblik','Overview')]]);
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
