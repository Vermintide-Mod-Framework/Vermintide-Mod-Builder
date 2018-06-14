const opn = require('opn');

const pfs = require('../lib/pfs');

const cl = require('../cl');
const print = require('../print');

const modTools = require('../tools/mod_tools');
const uploader = require('../tools/uploader');

module.exports = async function taskOpen() {

    let exitCode = 0;

    let modName = modTools.getFirstModName();
    let modDir = modTools.getModDir(modName);
    let modId = cl.get('id') || null;

    if (!modId) {
        let error = '';
        if (!modTools.validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessible(modDir + '/')) {
            error = `Folder "${modDir}" doesn't exist`;
        }

        if (error) {
            print.error(error);
            return { exitCode: 1, finished: true };
        }
    }

    try {

        if (!modId) {
            modId = await modTools.getModId(modName);
        }

        let url = uploader.formUrl(modId);
        console.log(`Opening ${url}`);
        await opn(url);
    }
    catch (error) {
        print.error(error);
        exitCode = 1;
    }

    return { exitCode, finished: true };
};
