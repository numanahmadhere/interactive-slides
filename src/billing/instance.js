import { Billing } from './state.js';
import { getCloud } from '../cloud/instance.js';

let billing = null;
export function getBilling() {
  if (!billing) billing = new Billing({ getCloud });
  return billing;
}
