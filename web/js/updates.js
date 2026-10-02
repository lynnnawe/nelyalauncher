import { host } from './host.js';
import { state } from './state.js';

let current = null;
const subs = new Set();

function push(s) {
  if (!s) return current;
  current = s;
  subs.forEach((fn) => fn(s));
  return s;
}

export function updateState() {
  return current;
}

export function onUpdate(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function initUpdates({ notify, toast }) {
  if (!host.native) return;
  host.call('update.state').then((s) => {
    push(s);
    if (s.justUpdated) {
      toast('updated to nelya ' + s.current, 'everything else stayed where it was', 'ok', 5200);
      notify('nelya ' + s.current + ' installed', 'the update finished', 'update');
    }
  }).catch(() => {});
  host.event('update.state', push);
  host.event('update.available', (s) => {
    push(s);
    if (state.autoUpdate === false) notify('nelya ' + s.latest + ' is out', 'open settings to update', 'update');
  });
  host.event('update.ready', (s) => {
    push(s);
    toast('nelya ' + s.latest + ' is ready', 'it installs when you close nelya', 'dl', 6000);
    notify('nelya ' + s.latest + ' downloaded', 'close nelya or restart from settings to install it', 'update');
  });
}

export const checkUpdates = () => host.call('update.check').then(push);
export const downloadUpdate = () => host.call('update.download').then(push);

export async function restartToUpdate() {
  await host.call('update.restart');
  host.send('close');
}
