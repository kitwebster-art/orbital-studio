const assert=require('node:assert/strict');
const {chromium}=require(process.env.ORBITAL_PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
assert(process.env.ORBITAL_TEST_OUTPUT, 'Set ORBITAL_TEST_OUTPUT to a task scratch directory');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4178');await page.waitForSelector('#test-ball-diameter');
assert.equal(await page.locator('#test-ball-diameter').inputValue(),'50');
console.log('DEFAULT',await page.locator('#test-layout-summary').textContent());
await page.locator('#test-ball-diameter').fill('70');await page.locator('#test-projector-x').fill('-0.4');await page.locator('#test-projector-y').fill('1.2');await page.locator('#test-projector-z').fill('2.5');await page.locator('#test-camera-x').fill('0.5');
await page.locator('#test-release').click();assert.match(await page.locator('#test-message').textContent(),/Apply the pending/);
await page.locator('#test-apply-rig').click();assert.match(await page.locator('#test-message').textContent(),/Layout applied/);
assert.match(await page.locator('#test-layout-summary').textContent(),/70 cm/);
assert.equal(await page.locator('[data-test-projector-position]').getAttribute('data-test-projector-position'),JSON.stringify({x:-.4,y:1.2,z:2.5}));
assert.equal(await page.locator('[data-test-camera-position]').getAttribute('data-test-camera-position'),JSON.stringify({x:.5,y:1,z:2}));
await page.reload();await page.waitForSelector('#test-ball-diameter');assert.equal(await page.locator('#test-ball-diameter').inputValue(),'70');assert.equal(await page.locator('#test-projector-x').inputValue(),'-0.4');assert.equal(await page.locator('#test-blackout').getAttribute('aria-pressed'),'true');
await page.locator('#test-ball-diameter').fill('0');await page.locator('#test-apply-rig').click();assert.match(await page.locator('#test-message').textContent(),/Ball diameter/);
await page.locator('#test-ball-diameter').fill('50');await page.locator('#test-projector-x').fill('0');await page.locator('#test-projector-y').fill('1');await page.locator('#test-projector-z').fill('0');await page.locator('#test-apply-rig').click();assert.match(await page.locator('#test-message').textContent(),/outside the ball/);
await page.locator('#test-projector-z').fill('2');await page.locator('#test-reset-rig').click();assert.equal(await page.locator('#test-ball-diameter').inputValue(),'50');
await page.getByText('3 / Calibration and output',{exact:true}).click();await page.locator('#test-release').click();const pop=page.waitForEvent('popup');await page.locator('#test-open-output').click();const output=await pop;await output.waitForSelector('canvas');
assert.equal(await output.locator('canvas').getAttribute('width'),'1920');assert.equal(await output.locator('canvas').getAttribute('height'),'1080');
await output.waitForTimeout(300);await output.screenshot({path:`${process.env.ORBITAL_TEST_OUTPUT}/output.png`});
await page.locator('#test-ball-diameter').fill('60');await page.locator('#test-apply-rig').click();await page.waitForTimeout(150);assert(output.isClosed(),'old output closes on geometry changes');
await page.locator('#test-reset-rig').click();await page.locator('.control-column').evaluate(e=>e.scrollTop=0);
await page.screenshot({path:`${process.env.ORBITAL_TEST_OUTPUT}/setup.png`});
console.log('ERRORS',errors);assert.equal(errors.length,0);console.log('PASS: default50cm, independent device positions, persistence, pending-edit gate, validation, reset, landscape output and blackout/reopen on setup change.');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
