const pfs = require('../lib/pfs');
const path = require('../lib/path');
const opn = require('opn');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const uploader = require('../uploader');

module.exports = async function openTask() {

    let exitCode = 0;

    let modName = cl.getFirstModName();
    let modDir = path.combine(config.modsDir, modName);
    let modId = cl.argv.id || null;

    if (!modId) {
        let error = '';
        if (!modTools.validModName(modName)) {
            error = `Folder name "${modDir}" is invalid`;
        }
        else if (!await pfs.accessible(modDir + '/')) {
            error = `Folder "${modDir}" doesn't exist`;
        }

        if (error) {
            console.error(error);
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
        console.error(error);
        exitCode = 1;
    }

    return { exitCode, finished: true };
};
