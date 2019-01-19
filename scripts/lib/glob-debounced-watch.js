var watch = require('glob-watcher'),
    debounceHashed = require('debounce-hashed');

module.exports = function (glob, opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }

    opts = Object.assign({ debounceTimeout: 100, debounceImmediate: false }, opts);
    cb = cb || function () { };
    return watch(glob, opts, debounceHashed(cb, (vinyl) => vinyl.path, opts.debounceTimeout, opts.debounceImmediate));
};
