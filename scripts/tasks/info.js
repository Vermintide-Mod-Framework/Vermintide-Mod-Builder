const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const cl = require('../cl');
const config = require('../config');
const cfg = require('../cfg');
const print = require('../print');

const modTools = require('../tools/mod_tools');
const uploader = require('../tools/uploader');

module.exports = async function taskInfo() {

    let exitCode = 0;

    let modNames = await modTools.getModNames();
    let showCfg = cl.get('cfg') || false;

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

    for(let { modName, modDir, cfgExists, error } of await modTools.validateModNames(modNames, false)) {

        if (error) {
            print.error(`\n${error}`);
            exitCode = 1;
            continue;
        }

        let cfgDir = cfg.getDir(modName);
        let cfgBase = cfg.getBase();

        console.log(`\n${modName} information:`);

        console.log(`Folder: "${modDir}"`);

        try {
            let modId = await modTools.getModId(modName);
            console.log(`Published: ${uploader.formUrl(modId)}`);
        }
        catch (err) {
            let errExplanation = cfgExists ?
                `"published_id" not found in "${cfgDir}/${cfgBase}"` :
                `"${cfgDir}/${cfgBase}" not found`;

            print.warn(`Not published (${errExplanation})`);
        }

        let bundleDir = null;

        let reason = `bundle not found`;
        if(cfgExists) {

            try {
                bundleDir = await modTools.getBundleDir(modName);
            }
            catch(err) {
                reason = `bundle folder not found`;
            }
        }

        if(!bundleDir) {
            bundleDir = modTools.getDefaultBundleDir(modName);
        }

        let bundleNames = null;
        let bundleName = null;

        try {
            bundleNames = await pfs.getFileNames(bundleDir);
        }
        catch(err) {
            reason = `bundle folder "${bundleDir}" not found`;
        }

        if (bundleNames) {

            for (let fileName of bundleNames) {
                if (path.parse(fileName).ext == config.get('bundleExtension')) {
                    bundleName = fileName;
                    break;
                }
            }

            if(!bundleName) {
                reason = `bundle not found in "${bundleDir}"`;
            }
        }

        let bundlePath = bundleDir && bundleName && path.combine(bundleDir, bundleName);

        try {
            let stat = await pfs.stat(bundlePath);
            let lastModified = stat.mtime;
            console.log(`Last built: ${lastModified} ("${bundleDir}/${bundleName}")`);
        }
        catch (err) {
            print.warn(`Not built (${reason})`);
        }

        if (showCfg && cfgExists) {
            console.log(`${cfgBase} in "${cfgDir}":`);
            let cfgData = await cfg.readFile(modName);
            cfgData = str.rmn(cfgData).replace(/^/gm, '  ');
            console.log(cfgData);
        }
        else if (cfgExists) {
            console.log(`Found ${cfgBase} in "${cfgDir}"`);
        }
        else {
            print.warn(`No ${cfgBase} in "${cfgDir}"`);
        }
    };

    return { exitCode, finished: true };
};
