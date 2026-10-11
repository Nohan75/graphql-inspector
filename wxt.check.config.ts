import { defineConfig } from 'wxt';
import config from './wxt.config';

// The same production build, in a folder of its own. `.output/chrome-mv3` is
// the folder the maintainer loads in the browser: a build made to check a
// change stays out of it.
export default defineConfig({
  ...config,
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}-check',
});
