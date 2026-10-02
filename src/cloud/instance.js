// One Cloud object per page. Sign-in sessions rotate their refresh token, so two
// objects refreshing at once would sign each other out; everything shares this one.

import { Cloud, browserStore } from './client.js';
import { loadProject } from './config.js';

let cloud = null;
let signature = '';

// null when no Supabase project is set up.
export function getCloud() {
  const project = loadProject();
  if (!project) return null;
  const sig = project.url + project.key;
  if (!cloud || sig !== signature) {
    cloud = new Cloud({ ...project, store: browserStore() });
    signature = sig;
  }
  return cloud;
}

export function resetCloud() {
  cloud = null;
  signature = '';
}
