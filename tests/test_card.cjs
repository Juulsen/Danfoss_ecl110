const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
 const root=require('path').join(__dirname,'../custom_components/danfoss_ecl110_modbus/frontend/');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1050,height:1100}});
 await page.route('http://ecl.test/**',r=>{const name=new URL(r.request().url()).pathname.split('/').pop();if(['help.json','catalog.json'].includes(name))return r.fulfill({contentType:'application/json',body:fs.readFileSync(root+name,'utf8')});return r.fulfill({contentType:'text/html',body:'<style>body{background:#edf3f4;font:15px system-ui;padding:25px}ecl110-card{display:block;max-width:780px;margin:auto}</style><ecl110-card></ecl110-card>'});});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 await page.goto('http://ecl.test/');await page.addScriptTag({path:root+'ecl110-card.js'});
 await page.evaluate(()=>{
  const states={};const put=(key,state,domain='number',attr={})=>{states[domain+'.ecl_'+key]={state:String(state),attributes:{ecl_device:'test',ecl_application:'130',register_key:key,friendly_name:key,min:0,max:150,step:1,...attr}}};
  for(const [i,t] of [16.9,21.2,36.6,35.6].entries())put('temperature_s'+(i+1),t,'sensor',{unit_of_measurement:'°C'});
  put('heating_curve_slope',0.7,'number',{min:.1,max:4,step:.1});put('knee_point','off','select',{options:['off','30 °C','40 °C','50 °C']});put('flow_temperature_min',25);put('flow_temperature_max',43);put('desired_mode','auto','select',{options:['auto','comfort','setback','standby']});
  const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];const slots=['start_1','stop_1','start_2','stop_2'];const times=['06:00','08:00','16:00','22:00'];
  for(const day of days)slots.forEach((slot,i)=>put('schedule_'+day+'_'+slot,times[i],'select',{options:['00:00','06:00','07:00','08:00','16:00','22:00','24:00']}));
  window.calls=[];window.fake={language:'da',states,formatEntityState:s=>s.state+(s.attributes.unit_of_measurement?' '+s.attributes.unit_of_measurement:''),callService:async(d,s,data)=>{window.calls.push([d,s,data]);window.fake.states[data.entity_id].state=String(data.option??data.value);}};
  const card=document.querySelector('ecl110-card');card.setConfig({type:'custom:ecl110-card'});card.hass=window.fake;
 });
 await page.getByRole('button',{name:'Ugeprogram',exact:true}).waitFor();await page.screenshot({path:'/tmp/ecl-overview.png'});
 await page.getByRole('button',{name:'Indstillinger',exact:true}).click();await page.getByText('Fremløb og varmekurve',{exact:true}).click();await page.getByRole('button',{name:'Info om Varmekurvens hældning'}).click();await page.locator('dialog').waitFor();await page.screenshot({path:'/tmp/ecl-help.png'});await page.getByRole('button',{name:'Luk',exact:true}).click();
 await page.getByRole('button',{name:'Ugeprogram',exact:true}).click();await page.screenshot({path:'/tmp/ecl-week.png',fullPage:true});
 await page.getByLabel('Mandag 1 start',{exact:true}).selectOption('07:00');await page.getByRole('button',{name:'Gem dag og valgte kopier',exact:true}).first().click();await page.getByText('Program gemt og genlæst.',{exact:true}).waitFor();
 let calls=await page.evaluate(()=>window.calls);if(calls.length!==1||calls[0][2].option!=='07:00')throw Error('schedule write mismatch');
 await page.getByRole('button',{name:'Forslag',exact:true}).click();await page.getByRole('button',{name:'Vis ændringer',exact:true}).first().click();if((await page.evaluate(()=>window.calls.length))!==1)throw Error('preset wrote before confirmation');await page.getByRole('button',{name:'Anvend de viste ændringer',exact:true}).click();
 await page.getByText('Forslag gemt og genlæst.',{exact:true}).waitFor();calls=await page.evaluate(()=>window.calls);if(calls.length!==3)throw Error('preset missing calls');
 await page.setViewportSize({width:390,height:850});await page.getByRole('button',{name:'Ugeprogram',exact:true}).click();await page.screenshot({path:'/tmp/ecl-mobile.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: desktop/mobile, help dialog, staged day write, profile confirmation, no JS errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
