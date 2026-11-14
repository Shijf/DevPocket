import { matchRegex, type RegexInput } from './lib/productivity';
self.onmessage = (event: MessageEvent<RegexInput>) => {
  try { self.postMessage({ result: matchRegex(event.data) }); }
  catch (error) { self.postMessage({ error: (error as Error).message }); }
};
