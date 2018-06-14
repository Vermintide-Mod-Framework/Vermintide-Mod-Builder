
module.exports = function cfg() {

    module.exports.setBase = setBase;
    module.exports.getBase = getBase;
    module.exports.setRelativeDir = setRelativeDir;
    module.exports.getPath = getPath;
    module.exports.getDir = getDir;
    module.exports.writeFile = writeFile;
    module.exports.fileExists = fileExists;
    module.exports.readFile = readFile;
    module.exports.getValue = getValue;

    init();

    return module.exports;
};

const pfs = require('./lib/pfs');
const path = require('./lib/path');
const str = require('./lib/str');

const config = require('./config');
const cl = require('./cl');

const modTools = require('./tools/mod_tools');

let base = '';
let relativeDir = '';

function init() {
    let cfgArg = cl.get('cfg');

    if (cfgArg && typeof cfgArg == 'string') {
        let cfgPath = path.parse(cfgArg);
        setBase(cfgPath.base);
        setRelativeDir(cfgPath.dir);
    }
    else {
        setBase('itemV' + config.get('gameNumber') + '.cfg');
    }
}

function setBase(newBase) {
    base = newBase;
}

function getBase() {
    return base;
}

function setRelativeDir(newDir) {
    relativeDir = newDir;
}

function getPath(modName) {
    return path.combine(getDir(modName), base);
}

function getDir(modName) {
    let modDir = modTools.getModDir(modName);
    return path.absolutify(relativeDir, modDir);
}

// Creates item.cfg file
async function writeFile(params) {

    let tagArray = String(params.tags).split(/;\s*/);
    let tags = '';
    for (let tag of tagArray) {

        if (tag.length === 0) {
            continue;
        }

        if (tags.length > 0) {
            tags += ', ';
        }

        tags += `"${tag}"`;
    };

    let configText = `title = "${params.title}";\n` +
        `description = "${params.description}";\n` +
        `preview = "${config.get('itemPreview')}";\n` +
        `content = "${config.get('defaultBundleDir')}";\n` +
        `language = "${params.language}";\n` +
        `visibility = "${params.visibility}";\n` +
        `tags = [${tags}]`;
    console.log(`${base}:`);
    console.log(`  ${str.rmn(configText).replace(/\n/g, '\n  ')}`);

    return await pfs.writeFile(getPath(params.name), configText);
}

async function fileExists(modName) {
    return await pfs.accessible(getPath(modName));
}

async function readFile(modName) {
    return await pfs.readFile(getPath(modName), 'utf8');
}

function getValue(data, key, type) {
    let regEx;

    switch (type) {

        case 'number':
            regEx = `(?:^|;)\\s*${key}\\s*=\\s*(\\d+)\\D?\\s*;`;
            break;

        case 'string':
            regEx = `(?:^|;)\\s*${key}\\s*=\\s*"([^"]*)"\\s*;`;
            break;

        default:
            throw new Error(`Unsupported cfg value type "${type}"`);
    }

    regEx = new RegExp(regEx);
    let match = data.match(regEx);

    return match && Array.isArray(match) && match.length > 1 ? match[1] : null;
}
