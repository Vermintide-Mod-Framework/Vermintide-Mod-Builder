const pfs = require('./lib/pfs');
//const config = require('./config');

// Commandline arguments
const minimist = require('./lib/minimist');
let argv = null;
let plainArgs = [];

function init(args) {
    argv = minimist(args);
}

function get(key) {
    return argv[key];
}

function getKeys() {
    return Object.keys(argv);
}

function set(key, value) {
    argv[key] = value;
}

function getPlainArgs() {
    return plainArgs;
}

function setPlainArgs(args) {
    plainArgs.length = 0;
    for(let arg of args) {
        plainArgs.push(arg);
    }
}

// Returns an object with all create/upload/publish params
function getWorkshopParams() {

    let modName = getFirstModName();
    let modTitle = argv.t || argv.title || modName;

    return {
        name: modName,
        title: modTitle,
        description: argv.d || argv.desc || argv.description || modTitle + ' description',
        language: argv.l || argv.language || 'english',
        visibility: argv.v || argv.visibility || 'private',
        tags: argv.tags || '',
        verbose: argv.verbose
    };
}

function getFirstModName() {
    let modName = plainArgs[0] || '';
    return modName;
}

async function getModNames() {
    let config = require('./config');
    let modNames = plainArgs.slice();

    if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
        try {
            modNames = await pfs.getDirs(config.get('modsDir'), config.get('ignoredDirs'));
        }
        catch (err) {
            console.error(err);
        }
    }

    return modNames;
}

// Returns an object with all build params
async function getBuildParams() {

    let config = require('./config');

    let verbose = argv.verbose || false;
    let shouldRemoveTemp = argv.clean || false;
    let modNames = await getModNames();

    let modId = modNames && modNames.length == 1 ? argv.id : null;
    let makeWorkshopCopy = !argv['no-workshop'];
    let ignoreBuildErrors = argv.e || argv['ignore-errors'] || argv['ignore-build-errors'] || config.get('ignoreBuildErrors');

    return { modNames, verbose, shouldRemoveTemp, modId, makeWorkshopCopy, ignoreBuildErrors };
}

module.exports = function(args) {

    module.exports.get = get;
    module.exports.getKeys = getKeys;
    module.exports.set = set;

    module.exports.getPlainArgs = getPlainArgs;
    module.exports.setPlainArgs = setPlainArgs;
    module.exports.getWorkshopParams = getWorkshopParams;
    module.exports.getFirstModName = getFirstModName;
    module.exports.getModNames = getModNames;
    module.exports.getBuildParams = getBuildParams;

    init(args);

    return module.exports;
};
