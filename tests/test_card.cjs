const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
 const root=require('path').join(__dirname,'../custom_components/danfoss_ecl110_modbus/frontend/');
 const options={headless:true,args:['--no-sandbox']};if(process.env.ECL_CHROMIUM_PATH)options.executablePath=process.env.ECL_CHROMIUM_PATH;if(process.env.ECL_CHROMIUM_ARGS)options.args=JSON.parse(process.env.ECL_CHROMIUM_ARGS);const browser=await chromium.launch(options);const page=await browser.newPage({viewport:{width:1050,height:1100}});
 await page.route('http://ecl.test/**',r=>{const name=new URL(r.request().url()).pathname.split('/').pop();if(['help.json','catalog.json'].includes(name))return r.fulfill({contentType:'application/json',body:fs.readFileSync(root+name,'utf8')});return r.fulfill({contentType:'text/html',body:'<style>body{background:#edf3f4;font:15px system-ui;padding:25px}ecl110-card{display:block;max-width:780px;margin:auto}</style><ecl110-card></ecl110-card>'});});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 await page.goto('http://ecl.test/');await page.addScriptTag({path:root+'ecl110-card.js'});
 await page.evaluate(()=>{
  const states={};const put=(key,state,domain='number',attr={})=>{states[domain+'.ecl_'+key]={state:String(state),attributes:{ecl_device:'test',ecl_application:'130',register_key:key,friendly_name:key,min:0,max:150,step:1,...attr}}};
  for(const [i,t] of [16.9,21.2,36.6,35.6].entries())put('temperature_s'+(i+1),t,'sensor',{unit_of_measurement:'°C'});
  put('heating_curve_slope',0.7,'number',{min:.1,max:4,step:.1});put('knee_point','off','select',{options:['off','30 °C','40 °C','50 °C']});put('flow_temperature_min',25);put('flow_temperature_max',43);put('desired_room_temperature',22,'number',{min:10,max:30,step:1,unit_of_measurement:'°C'});put('desired_s2',22,'sensor',{unit_of_measurement:'°C'});put('desired_mode','auto','select',{options:['auto','comfort','setback','standby']});
  const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];const slots=['start_1','stop_1','start_2','stop_2'];const times=['06:00','08:00','16:00','22:00'];
  for(const day of days)slots.forEach((slot,i)=>put('schedule_'+day+'_'+slot,times[i],'select',{options:['00:00','06:00','07:00','08:00','16:00','22:00','24:00']}));
  window.calls=[];window.fake={user:{id:'user1'},language:'da',states,formatEntityState:s=>s.state+(s.attributes.unit_of_measurement?' '+s.attributes.unit_of_measurement:''),callService:async(d,s,data)=>{window.calls.push([d,s,data]);window.fake.states[data.entity_id].state=String(data.option??data.value);}};
  const card=document.querySelector('ecl110-card');card.setConfig({type:'custom:ecl110-card'});card.hass=window.fake;
 });
 await page.getByRole('button',{name:'Ugeprogram',exact:true}).waitFor();await page.screenshot({path:'/tmp/ecl-overview.png'});

 // Overview customization is local only; verify order, persistence and incoming HA updates.
 const assert=require('node:assert/strict');
 await page.getByRole('button',{name:'Tilpas overblik',exact:true}).click();
 await page.getByLabel('Visning',{exact:true}).selectOption('focus');
 await page.getByLabel('Størrelse',{exact:true}).selectOption('large');
 await page.getByRole('checkbox',{name:'Vis Varmekurvens hældning',exact:true}).check();
 await page.getByRole('button',{name:'Flyt op: Varmekurvens hældning',exact:true}).click();
 await page.getByRole('button',{name:'Gem visning',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 assert.deepEqual(await page.evaluate(()=>document.querySelector('ecl110-card').overviewView),{fields:['temperature_s1','temperature_s2','temperature_s3','heating_curve_slope','temperature_s4'],layout:'focus',size:'large'});
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');c.setConfig({type:'custom:ecl110-card'});c.hass=window.fake;});
 assert.equal(await page.locator('.overview-grid.focus.large .metric').count(),5);


 await page.getByRole('button',{name:'Tilpas overblik',exact:true}).click();
 await page.getByLabel('Visning',{exact:true}).selectOption('list');
 await page.evaluate(()=>{window.fake.states['sensor.ecl_temperature_s1'].state='18.2';document.querySelector('ecl110-card').hass=window.fake;});
 assert.equal(await page.locator('[data-overview-value="temperature_s1"]').textContent(),'18.2 °C');
 await page.getByRole('button',{name:'Fortryd',exact:true}).click();
 assert.equal(await page.locator('.overview-grid.focus.large').count(),1);
 // Independent card views, users and devices must not inherit one another's local preferences.
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');c.setConfig({type:'custom:ecl110-card',overview_id:'second'});});
 assert.equal(await page.locator('.overview-grid .metric').count(),4);
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');c.setConfig({type:'custom:ecl110-card'});window.fake.user={id:'user2'};c.hass=window.fake;c.render();});
 assert.equal(await page.locator('.overview-grid .metric').count(),4);
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');window.fake.user={id:'user1'};c.hass=window.fake;c.render();});
 assert.equal(await page.locator('.overview-grid .metric').count(),5);
 // Recreating the element restores the saved view without depending on in-memory state.
 await page.evaluate(()=>{const old=document.querySelector('ecl110-card'),fresh=document.createElement('ecl110-card');old.replaceWith(fresh);fresh.setConfig({type:'custom:ecl110-card'});fresh.hass=window.fake;});
 await page.locator('.overview-grid.focus.large .metric').first().waitFor();
 assert.equal(await page.locator('.overview-grid .metric').count(),5);
 await page.evaluate(()=>{for(const state of Object.values(window.fake.states))state.attributes.ecl_device='second-device';const c=document.querySelector('ecl110-card');c.hass=window.fake;c.render();});
 assert.equal(await page.locator('.overview-grid .metric').count(),4);
 await page.evaluate(()=>{for(const state of Object.values(window.fake.states))state.attributes.ecl_device='test';const c=document.querySelector('ecl110-card');c.hass=window.fake;c.render();});
 assert.equal(await page.locator('.overview-grid .metric').count(),5);
 await page.evaluate(()=>{window.fake.states['sensor.ecl_temperature_s1'].state='unavailable';document.querySelector('ecl110-card').hass=window.fake;});
 assert.equal(await page.locator('[data-overview-value="temperature_s1"]').textContent(),'Utilgængelig');
 await page.evaluate(()=>{window.fake.states['sensor.ecl_temperature_s1'].state='18.2';document.querySelector('ecl110-card').hass=window.fake;});
 // Corrupt storage is ignored; blocked storage reports that choices are only temporary.
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');localStorage.setItem(c.overviewKey,'invalid JSON');c.setConfig({type:'custom:ecl110-card'});});
 await page.getByText('Gemte visningsvalg kunne ikke læses. Standardvisningen bruges.',{exact:true}).waitFor();
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('blocked');};});
 await page.getByRole('button',{name:'Tilpas overblik',exact:true}).click();
 await page.getByRole('button',{name:'Gem visning',exact:true}).click();
 await page.getByText('Browseren tillader ikke lagring. Visningen virker nu, men gemmes ikke efter genindlæsning.',{exact:true}).waitFor();
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;localStorage.clear();});
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.getByRole('button',{name:'Indstillinger',exact:true}).click();await page.getByText('Fremløb og varmekurve',{exact:true}).click();await page.getByRole('button',{name:'Info om Varmekurvens hældning'}).click();await page.locator('dialog').waitFor();await page.screenshot({path:'/tmp/ecl-help.png'});
 assert.equal(await page.getByText('Hvad betyder en ændring?',{exact:true}).count(),1);
 assert.equal(await page.locator('dialog details').getAttribute('open'),null);
 await page.getByText('Vis beregning',{exact:true}).click();
 assert.ok(!(await page.locator('dialog').textContent()).match(/PDF|Danfoss|manual|side [0-9]/i));
 await page.evaluate(()=>{document.querySelector('ecl110-card').hass=window.fake;});
 assert.equal(await page.locator('dialog[open]').count(),1);
await page.getByRole('button',{name:'Luk',exact:true}).click();
 await page.getByText('Rumregulering',{exact:true}).click();
 assert.equal(await page.getByLabel('Ønsket rumtemperatur',{exact:true}).inputValue(),'22');
 await page.getByLabel('Ønsket rumtemperatur',{exact:true}).fill('21');
 await page.getByLabel('Ønsket rumtemperatur',{exact:true}).press('Tab');
 await page.getByText('Gemt og genlæst.',{exact:true}).waitFor();
 let roomCalls=await page.evaluate(()=>window.calls);
 assert.deepEqual(roomCalls.at(-1),['number','set_value',{entity_id:'number.ecl_desired_room_temperature',value:21}]);
 await page.evaluate(()=>{window.calls=[];});
 await page.getByText('Rumregulering',{exact:true}).click();
 await page.getByRole('button',{name:'Info om Ønsket rumtemperatur',exact:true}).click();
 await page.getByText('Den rumtemperatur regulatoren forsøger at holde, når rumføleren bruges.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Luk',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.getByRole('button',{name:'Ugeprogram',exact:true}).click();await page.screenshot({path:'/tmp/ecl-week.png',fullPage:true});
 await page.getByLabel('Mandag 1 start',{exact:true}).selectOption('07:00');await page.getByRole('button',{name:'Gem dag og valgte kopier',exact:true}).first().click();await page.getByText('Program gemt og genlæst.',{exact:true}).waitFor();
 let calls=await page.evaluate(()=>window.calls);if(calls.length!==1||calls[0][2].option!=='07:00')throw Error('schedule write mismatch');
 await page.getByRole('button',{name:'Forslag',exact:true}).click();await page.getByRole('button',{name:'Vis ændringer',exact:true}).first().click();if((await page.evaluate(()=>window.calls.length))!==1)throw Error('preset wrote before confirmation');await page.getByRole('button',{name:'Anvend de viste ændringer',exact:true}).click();
 await page.getByText('Forslag gemt og genlæst.',{exact:true}).waitFor();calls=await page.evaluate(()=>window.calls);if(calls.length!==3)throw Error('preset missing calls');
 await page.setViewportSize({width:390,height:850});await page.getByRole('button',{name:'Ugeprogram',exact:true}).click();await page.screenshot({path:'/tmp/ecl-mobile.png',fullPage:true});

 // English help is fully localized and contains no PDF/page attribution.
 await page.evaluate(()=>{const c=document.querySelector('ecl110-card');c.setConfig({type:'custom:ecl110-card',language:'en'});c.tab=1;c.render();c.showHelp(c.catalog.find(m=>m.line==='3182'));});
 await page.getByText('What does a change do?',{exact:true}).waitFor();
 await page.getByText('Show calculation',{exact:true}).click();
 assert.ok((await page.locator('dialog').textContent()).includes('Flow correction'));
 assert.ok(!(await page.locator('dialog').textContent()).match(/PDF|Danfoss|manual|page [0-9]|rumtemperatur/i));
 await page.getByRole('button',{name:'Close',exact:true}).click();
 // Mobile widths must not clip controls, in any overview layout.
 await page.setViewportSize({width:320,height:900});
 await page.addStyleTag({content:'body{padding:0;margin:0}'});
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('button',{name:'Customize overview',exact:true}).click();
 for(const layout of ['tiles','list','focus']){
   await page.getByLabel('Layout',{exact:true}).selectOption(layout);
   for(const size of ['compact','normal','large']){
     await page.getByLabel('Size',{exact:true}).selectOption(size);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
 }
 await page.screenshot({path:'/tmp/ecl040-mobile.png',fullPage:true});
 // A narrow card on a wide dashboard must reflow without relying on viewport media queries.
 await page.setViewportSize({width:1100,height:900});
 await page.addStyleTag({content:'ecl110-card{max-width:320px}'});
 assert.equal(await page.locator('.overview-controls').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
 const help=JSON.parse(fs.readFileSync(root+'help.json','utf8'));
 assert.equal(Object.keys(help).length,45);
 for(const entry of Object.values(help)){
   for(const language of ['da','en']){
     assert.ok(entry[language]);assert.ok(entry.effect[language]);
     for(const key of ['example','formula','note'])if(entry[key])assert.ok(entry[key][language]);
     const visible=[entry[language],...['effect','example','formula','note'].map(key=>entry[key]?.[language]||'')].join(' ');
     assert.ok(!/PDF|manual|Danfoss|page[s]? [0-9]|side[r]? [0-9]/i.test(visible));
   }
 }
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: overview persistence/isolation/cancel, live updates, zero overview writes, storage failure, DA/EN help, responsive layouts, staged schedule, profile confirmation');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
