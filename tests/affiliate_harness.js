/**
 * tests/affiliate_harness.js
 * Shared minimal mock environment and helper for executing actual app scripts
 * in Node.js (via VM or eval) without duplicating business or DOM logic.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMockElement(id = '', tagName = 'div') {
  return {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    className: '',
    children: [],
    dataset: {},
    appendChild(child) { this.children.push(child); },
    addEventListener(event, fn) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
    },
    trigger(event, eventObj = {}) {
      if (this._listeners && this._listeners[event]) {
        for (const fn of this._listeners[event]) fn(eventObj);
      }
    },
    click() { this.trigger('click'); },
    classList: {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
      toggle(cls, force) {
        if (force === undefined) {
          if (this._classes.has(cls)) this._classes.delete(cls);
          else this._classes.add(cls);
        } else if (force) {
          this._classes.add(cls);
        } else {
          this._classes.delete(cls);
        }
      }
    },
    setAttribute() {},
    focus() { this._focused = true; },
    showPicker() { this._showPickerCalled = true; },
    showModal() { this._open = true; },
    close() { this._open = false; if (typeof this.onclose === 'function') this.onclose(); },
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
}

function createMockDOM() {
  const elements = {};
  const getOrCreate = (id, tag = 'div') => {
    if (!elements[id]) elements[id] = createMockElement(id, tag);
    return elements[id];
  };

  const storageStore = {};
  const mockChrome = {
    runtime: {
      getURL: (p) => 'chrome-extension://mock-id/' + p,
      connect: () => ({
        onDisconnect: { addListener: () => {} },
        postMessage: () => {},
        onMessage: { addListener: () => {} }
      }),
      sendMessage: () => {}
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://affiliate.shopee.vn/payment/payout_record' }],
      create: () => {}
    },
    scripting: {
      executeScript: async () => [{ result: null }]
    },
    storage: {
      local: {
        _store: storageStore,
        get: (keys, cb) => {
          let res = {};
          if (keys === null || keys === undefined) {
            res = Object.assign({}, storageStore);
          } else if (Array.isArray(keys)) {
            for (const k of keys) {
              if (storageStore[k] !== undefined) res[k] = storageStore[k];
            }
          } else if (typeof keys === 'string') {
            if (storageStore[keys] !== undefined) res[keys] = storageStore[keys];
          } else if (typeof keys === 'object') {
            for (const [k, defaultVal] of Object.entries(keys)) {
              res[k] = storageStore[k] !== undefined ? storageStore[k] : defaultVal;
            }
          }
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (items, cb) => {
          Object.assign(storageStore, items);
          if (cb) cb();
          return Promise.resolve();
        },
        remove: (keys, cb) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          for (const k of keyArr) delete storageStore[k];
          if (cb) cb();
          return Promise.resolve();
        }
      }
    }
  };

  const documentMock = {
    body: getOrCreate('mock-body', 'body'),
    getElementById: (id) => getOrCreate(id),
    createElement: (tag) => createMockElement('', tag),
    querySelectorAll: (sel) => {
      if (sel.includes('.view-tab')) {
        const m1 = getOrCreate('tab-btn-monthly', 'button'); m1.dataset.tab = 'tab-monthly';
        const m2 = getOrCreate('tab-btn-simple', 'button'); m2.dataset.tab = 'tab-simple';
        const m3 = getOrCreate('tab-btn-daily', 'button'); m3.dataset.tab = 'tab-daily';
        const m4 = getOrCreate('tab-btn-s1a', 'button'); m4.dataset.tab = 'tab-s1a';
        return [m1, m2, m3, m4];
      }
      if (sel.includes('.tab-content')) {
        return [
          getOrCreate('tab-monthly'),
          getOrCreate('tab-simple'),
          getOrCreate('tab-daily'),
          getOrCreate('tab-s1a')
        ];
      }
      if (sel.includes('.tab-btn')) return [];
      return [];
    },
    querySelector: () => null,
    addEventListener: () => {}
  };

  const localStorageMock = {
    _data: {},
    getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };

  return {
    elements,
    document: documentMock,
    chrome: mockChrome,
    localStorage: localStorageMock,
    window: {
      location: { href: 'chrome-extension://mock/tax_report.html' },
      print() { this.printCalled = true; }
    }
  };
}

/**
 * Extracts the async func: async (...) => { ... } passed to chrome.scripting.executeScript
 * Uses standard Node vm.runInThisContext so globals deliberately supplied/mocked by tests
 * (fetch, window, timers) are preserved in the execution context without using eval() or Function().
 */
function extractInjectedFunc(filePath) {
  const code = fs.readFileSync(path.resolve(filePath), 'utf8');
  let match = code.match(/func:\s*async\s*\((startTime,\s*endTime)\)\s*=>\s*\{([\s\S]*?^\s+\},\s*args:)/m);
  if (!match) {
    match = code.match(/func:\s*async\s*\((.*?)\)\s*=>\s*\{([\s\S]*?^\s+\},\s*args:)/m);
  }
  if (!match) throw new Error('Could not find func in ' + filePath);
  const funcStr = 'async (' + match[1] + ') => {' + match[2].replace(/\s*,\s*args:$/, '');
  return vm.runInThisContext('(' + funcStr + ')');
}

const extractExecuteScriptFunc = extractInjectedFunc;

module.exports = {
  createMockDOM,
  createMockElement,
  extractExecuteScriptFunc,
  extractInjectedFunc
};
