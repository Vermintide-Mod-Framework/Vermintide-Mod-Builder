
module.exports = function cl(args) {

    module.exports.get = get;
    module.exports.set = set;

    module.exports.getPlainArgs = getPlainArgs;
    module.exports.setPlainArgs = setPlainArgs;

    init(args);

    return module.exports;
};

// Commandline arguments
const minimist = require('../lib/minimist');

let argv = null;
let plainArgs = [];

function init(args) {
    argv = minimist(args);
}

function get(...keys) {
    for(let key of keys) {

        if(argv[key] !== undefined) {
            return argv[key];
        }
    }

    return undefined;
}

function set(key, value) {
    argv[key] = value;
}

function getPlainArgs() {
    return plainArgs.slice();
}

function setPlainArgs(args) {
    plainArgs.length = 0;
    for(let arg of args) {
        plainArgs.push(arg);
    }
}
