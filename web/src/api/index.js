import { DEMO } from '../config.js';
import { api as demo } from './demo.js';
import { api as live } from './supabase.js';

export const api = DEMO ? demo : live;
