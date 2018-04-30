const path = require('path');
const normalizePath = require('normalize-path');

path.fix = function(pth) {
    return normalizePath(path.normalize(pth));
};

// Normalizes path after joining
path.combine = function(...args) {
    return path.fix(path.join(...args));
};

module.exports = path;