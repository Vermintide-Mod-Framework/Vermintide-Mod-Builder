const path = Object.assign({}, require('path'));
const normalizePath = require('normalize-path');

path.fix = function(pth) {
    return normalizePath(path.normalize(pth));
};

// Normalizes path after joining
path.combine = function(...args) {
    return path.fix(path.join(...args));
};

path.absolutify = function(pth, dirname) {
    if (!path.isAbsolute(pth)) {
        pth = path.combine(dirname || process.cwd(), pth);
    }
    return pth;
};

module.exports = path;
