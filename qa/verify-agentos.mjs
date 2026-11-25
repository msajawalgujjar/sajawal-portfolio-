import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import axe from 'axe-core';
const url='https://sajawal-agentos-studio.extraordinarylion8.chatgpt.site';
const out='evidence';mkdirSync(out,{recursive:true});
const record={url,started:new Date().toISOString(),layouts:[],accessibility:[],journeys:[],errors:[]};
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
const session=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:900}});
const page=await session.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>record.errors.push(e.message));
async function audit(name){
  await page.evaluate(axe.source);
  const findings=await page.evaluate(async()=>{const output=await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa']});return output.violations.map(v=>({rule:v.id,severity:v.impact,nodes:v.nodes.map(n=>n.target)}));});
  record.accessibility.push({name,findings});
}
const click=(name)=>page.getByRole('button',{name,exact:true}).filter({visible:true}).click();
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  await page.getByRole('button',{name:'Source analyst, Research'}).waitFor();
  for(const width of [320,375,390,430,768,1024,1440,1920]){
    await page.setViewportSize({width,height:width<768?850:900});
    const views=[];
    for(const name of ['Run history','Agent memory','Settings','Workflow studio']){
      await click(name);
      const size=await page.evaluate(()=>({client:document.documentElement.clientWidth,page:document.documentElement.scrollWidth}));
      assert.equal(size.client,width);assert.ok(size.page<=width+1,'Overflow in '+name+' at '+width);views.push(name);
    }
    const action=page.getByRole('button',{name:'Run workflow'});const rectangle=await action.boundingBox();
    assert.ok(rectangle&&rectangle.x>=0&&rectangle.x+rectangle.width<=width+1);
    await page.screenshot({path:out+'/studio-'+width+'.png',fullPage:true});record.layouts.push({width,views});
    if([390,1440].includes(width))await audit('Studio '+width);
  }
  await page.setViewportSize({width:1440,height:900});
  await click('Agent memory');await click('Add memory');
  await page.getByLabel('Title',{exact:true}).fill('Synthetic QA policy');
  await page.getByLabel('Context for future runs').fill('Use only the supplied synthetic brief.');await click('Save memory');
  await page.getByRole('heading',{name:'Synthetic QA policy'}).waitFor();await audit('Memory');
  await click('Workflow studio');
  const analyst=page.getByRole('button',{name:'Source analyst, Research'});
  const before=await analyst.boundingBox();await analyst.focus();await analyst.press('ArrowRight');
  const moved=await analyst.boundingBox();assert.ok(moved.x>before.x);
  await page.mouse.move(moved.x+30,moved.y+16);await page.mouse.down();await page.mouse.move(moved.x+75,moved.y+45,{steps:6});await page.mouse.up();assert.ok((await analyst.boundingBox()).x>moved.x+4);
  await click('Arrange nodes automatically');
  await page.getByRole('textbox',{name:'Workflow name'}).fill('Synthetic release check');await click('Save');
  await page.getByText('Workflow saved.',{exact:true}).waitFor();await page.reload();
  await page.waitForFunction(()=>document.querySelector('#workflowName')?.value==='Synthetic release check');
  record.journeys.push('Persist memory and workflow; move nodes by keyboard and pointer.');
  await click('Run workflow');await click('Start run');await page.getByRole('button',{name:'Approve step'}).waitFor();
  await page.getByText('Review input',{exact:true}).click();
  assert.match(await page.locator('#runDetail').innerText(),/Synthetic QA policy/);
  await page.screenshot({path:out+'/approval.png',fullPage:true});await audit('Approval');
  await click('Approve step');await page.waitForFunction(()=>document.querySelector('#runDetail .badge')?.textContent==='complete');
  const download=page.waitForEvent('download');await click('Export report');assert.match((await download).suggestedFilename(),/^agentos-.*\.json$/);
  await page.screenshot({path:out+'/execution.png',fullPage:true});record.journeys.push('Run four nodes; review context; approve; complete; export JSON.');
  await click('Settings');await audit('Settings');await click('Workflow studio');
  await click('Workflow templates').catch(async()=>{await click('Templates');});
  await page.getByRole('button',{name:/Code review Inspect/}).click();await click('Run workflow');await click('Start run');await page.getByRole('button',{name:'Approve step'}).waitFor();await click('Cancel run');
  await page.waitForFunction(()=>document.querySelector('#runDetail .badge')?.textContent==='cancelled');
  record.journeys.push('Switch templates and cancel a second run at review.');
  assert.deepEqual(record.errors,[]);
  assert.deepEqual(record.accessibility.filter(x=>x.findings.length),[]);
  record.result='passed';
}catch(error){record.result='failed';record.failure=error.message;await page.screenshot({path:out+'/observed-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{
  record.finished=new Date().toISOString();writeFileSync(out+'/results.json',JSON.stringify(record,null,2));
  await session.request.delete(url+'/api/session',{headers:{Origin:url,'Content-Type':'application/json'},data:{}}).catch(()=>{});
  await browser.close();
}
