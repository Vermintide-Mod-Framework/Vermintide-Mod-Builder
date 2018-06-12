const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');
const cl = require('../cl');
const config = require('../config');

const modTools = require('../mod_tools');
const uploader = require('../uploader');

module.exports = async function infoTask() {

    let exitCode = 0;

    let modNames = await cl.getModNames();
    let showCfg = cl.argv['cfg'] || false;

    if (modNames.length > 1) {
        console.log(`Showing information for mods:`);
        for (let modName of modNames) {
            console.log(`  ${modName}`);
        }
    }
    else if (modNames.length === 0) {
        console.log(`No mods found`);
        return { exitCode, finished: true };
    }

    await modTools.forEachMod(
        modNames,
        false,
        async (modName, modDir, cfgExists) => {
            let cfgDir = config.getAbsoluteCfgPath(modDir);

            console.log(`\n${modName} information:`);

            console.log(`Folder: "${modDir}"`);

            try {
                let modId = await modTools.getModId(modName);
                console.log(`Published: ${uploader.formUrl(modId)}`);
            }
            catch (err) {
                let errExplanation = cfgExists ?
                    `"published_id" not found in "${cfgDir}/${config.cfgFile}"` :
                    `"${cfgDir}/${config.cfgFile}" not found`;

                console.warn(`Not published (${errExplanation})`);
            }

            let bundleName = modTools.hashModName(modName) + config.bundleExtension;
            let bundleDir = path.combine(modDir, config.bundleDir);
            let bundlePath = path.combine(bundleDir, bundleName);
            try {
                let stat = await pfs.stat(bundlePath);
                let lastModified = stat.mtime;
                console.log(`Last built: ${lastModified} ("${bundleDir}/${bundleName}")`);
            }
            catch (err) {
                console.warn(`Not built ("${bundleName}" not found in "${bundleDir}")`);
            }

            if (showCfg && cfgExists) {
                console.log(`${config.cfgFile} in "${ cfgDir }":`);
                let cfgData = await pfs.readFile(path.combine(cfgDir, config.cfgFile), 'utf8');
                cfgData = str.rmn(cfgData).replace(/^/gm, '  ');
                console.log(cfgData);
            }
            else if (cfgExists) {
                console.log(`Found ${config.cfgFile} in "${cfgDir}"`);
            }
            else {
                console.warn(`No ${config.cfgFile} in "${cfgDir}"`);
            }
        },
        (error) => {
            console.error(`\n${error}`);
            exitCode = 1;
        }
    );

    return { exitCode, finished: true };
};
