import { cacheInPage, debugInPage, debugCSS, cleanDebugState } from '../../src/lib/pageTools';
import { hashBytes, type RegexInput, type matchRegex } from '../../src/lib/productivity';
import { sendRequest } from '../../src/lib/requestTool';
const output = document.querySelector('#result')!;
const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); output.textContent += `PASS ${label}\n`; };
function regex(input: RegexInput): Promise<ReturnType<typeof matchRegex>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../src/regex-worker.ts', import.meta.url), { type: 'module' });
    const deadline = setTimeout(() => { worker.terminate(); reject(new Error('timeout')); }, 800);
    worker.onmessage = event => { clearTimeout(deadline); worker.terminate(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result); };
    worker.onerror = event => { clearTimeout(deadline); worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage(input);
  });
}
document.querySelector('#run')!.addEventListener('click', async () => {
  const cacheA = `devpocket-test-assets-${crypto.randomUUID()}`, cacheB = `devpocket-test-api-${crypto.randomUUID()}`;
  let registration: ServiceWorkerRegistration | undefined; const styles: HTMLStyleElement[] = [];
  const initialMode = document.designMode;
  output.textContent = '';
  try {
    const captures = await regex({ pattern: '(?<word>\\w+)', flags: 'g', text: 'one two', replacement: '[$<word>]' }); check(captures.matches.length === 2 && captures.replaced === '[one] [two]', 'Worker captures and replacement');
    const pathological = regex({ pattern: '(a+)+$', flags: 'g', text: 'a'.repeat(10000) + '!', replacement: '' });
    check(await pathological.then(() => false, e => e.message === 'timeout'), 'pathological regex terminated');
    check((await regex({ pattern: 'a', flags: 'g', text: 'abc', replacement: 'x' })).replaced === 'xbc', 'Worker recovers after timeout');
    const file = new File(['abc'], 'hash-test.txt', { type: 'text/plain' }); check(await hashBytes(new Uint8Array(await file.arrayBuffer()), 'SHA-256') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'real File hash');
    const response = await sendRequest({ url: new URL('./native.json', location.href).href, method: 'GET', headers: '', body: '' }, new AbortController().signal); check(response.status === 200 && JSON.parse(response.body).native === true, 'browser fetch response');
    await (await caches.open(cacheA)).put('/devpocket-test-cache', new Response('demo')); await caches.open(cacheB);
    const inventory = await cacheInPage(location.origin); check('caches' in inventory && inventory.caches.includes(cacheA), 'real Cache Storage read');
    registration = await navigator.serviceWorker.register('./productivity-worker/sw.js');
    const workers = await cacheInPage(location.origin); check('workers' in workers && workers.workers.some(worker => worker.scope === registration!.scope), 'real Service Worker enumeration');
    const clear = await cacheInPage(location.origin, { caches: [cacheA], workers: [registration.scope] });
    check('deleted' in clear && clear.deleted === 2 && !clear.failed.length, 'selected cache and Worker removed');
    check(!(await caches.keys()).includes(cacheA) && (await caches.keys()).includes(cacheB), 'unselected cache preserved');
    let refused = false; try { await cacheInPage('https://elsewhere.example', { caches: [cacheB], workers: [] }); } catch { refused = true; } check(refused && (await caches.keys()).includes(cacheB), 'origin mismatch refuses clearing');
    for (const css of Object.values(debugCSS)) { const style = document.createElement('style'); style.textContent = css; document.head.append(style); styles.push(style); }
    debugInPage(location.origin, { outlines: true, animations: true, editable: true });
    check(document.designMode === 'on' && getComputedStyle(document.querySelector('#animated')!).animationName === 'none' && getComputedStyle(document.querySelector('#animated')!).outlineStyle === 'solid', 'real page outline / CSS animation / editing');
    check(debugInPage(location.origin).editable, 'debug state retained');
    for (const style of styles) style.remove(); debugInPage(location.origin, cleanDebugState());
    check(document.designMode === initialMode && getComputedStyle(document.querySelector('#animated')!).animationName === 'move', 'debug mode and styles restored');
    output.textContent += 'ALL PRODUCTIVITY RUNTIME CHECKS PASSED';
  } catch (e) { output.textContent += `FAIL ${(e as Error).message}`; }
  finally { for (const style of styles) style.remove(); debugInPage(location.origin, cleanDebugState()); await caches.delete(cacheA); await caches.delete(cacheB); await registration?.unregister(); }
});
