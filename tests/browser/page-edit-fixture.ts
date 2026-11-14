import { debugInPage, debugCSS, cleanDebugState } from '../../src/lib/pageTools';
const target = document.querySelector<HTMLElement>('#edit-target')!;
const result = document.querySelector('#result')!;
const initialMode = document.designMode;
let style: HTMLStyleElement | undefined;
document.querySelector('#legacy')!.addEventListener('click', () => {
  document.designMode = 'on';
  result.textContent = target.isContentEditable ? 'LEGACY EDITABLE' : 'LEGACY BLOCKED: contenteditable=false';
  document.designMode = initialMode;
});
document.querySelector('#enable')!.addEventListener('click', () => {
  style?.remove();
  style = document.createElement('style'); style.textContent = debugCSS.editable; document.head.append(style);
  debugInPage(location.origin, { outlines: false, animations: false, editable: true });
  result.textContent = target.isContentEditable && getComputedStyle(target).userSelect === 'text' ? 'READY FOR KEYBOARD INPUT' : 'FAIL enabling edit';
});
document.querySelector('#verify')!.addEventListener('click', () => {
  const typed = target.textContent !== 'Editable demo' && target.textContent?.includes('x');
  debugInPage(location.origin, cleanDebugState()); style?.remove();
  const restored = document.designMode === initialMode && document.body.getAttribute('contenteditable') === 'false' && target.getAttribute('contenteditable') === 'false' && getComputedStyle(target).userSelect === 'none';
  result.textContent = typed && restored ? `PAGE EDIT KEYBOARD AND RESTORE PASSED: ${target.textContent}` : `FAIL typed=${typed} restored=${restored}`;
});
