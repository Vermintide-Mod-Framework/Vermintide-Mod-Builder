const child_process = require('child_process');
const vinyl = require('vinyl-fs');
const rename = require('gulp-rename');
const del = require('del');
const merge = require('merge-stream');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const config = require('../config');
const cfg = require('../cfg');
const print = require('../print');

const modTools = require('./mod_tools');

// Builds modName, optionally deleting its temp folder, and copies it to the bundle and workshop dirs
async function buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId) {
    console.log(`\nPreparing to build ${modName}`);

    let modFilePath = modTools.getModFilePath(modName);
    if (config.get('useExternalModFile') && !await pfs.accessible(modFilePath)) {
        throw new Error(`File "${modFilePath}" not found`);
    }

    let modTempDir = modTools.getTempDir(modName);
    let dataDir = path.combine(modTempDir, 'compile');
    let buildDir = path.combine(modTempDir, 'bundle');

    await _checkTempFolder(modName, shouldRemoveTemp);

    if (!modId && makeWorkshopCopy && !await cfg.fileExists(modName)) {
        throw new Error(`${cfg.getBase()} not found in "${cfg.getDir(modName)}"`);
    }

    console.log(`Building ${modName}`);

    let modDir = modTools.getModDir(modName);
    let stingrayExitCode = await _runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
    await _processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

    let bundleDir;
    try {
        bundleDir = await modTools.getBundleDir(modName);
    }
    catch (error) {
        print.warn(error);
        bundleDir = modTools.getDefaultBundleDir(modName);
    }

    let modWorkshopDir = makeWorkshopCopy && await _getModWorkshopDir(modName, modId);
    await _cleanBundleDirs(bundleDir, modWorkshopDir);
    await _copyModFiles(modName, buildDir, bundleDir, modWorkshopDir);

    console.log(`Successfully built ${modName}`);
}

// Checks if temp folder exists, optionally removes it
async function _checkTempFolder(modName, shouldRemove) {
    let tempDir = modTools.getTempDir(modName);
    let tempExists = await pfs.accessible(tempDir);

    if (tempExists && shouldRemove) {
        return await new Promise((resolve, reject) => {
            child_process.exec(`rmdir /s /q "${tempDir}"`, error => {

                if (error) {
                    error.message += '\nFailed to delete temp folder';
                    return reject(error);
                }

                console.log(`Removed ${tempDir}`);
                return resolve();
            });
        });
    }
    else if (tempExists) {
        console.log(`Overwriting temp folder`);
    }
}

// Builds the mod
async function _runStingray(toolsDir, modDir, dataDir, buildDir, verbose) {

    let stingrayParams = [
        `--compile-for win32`,
        `--source-dir "${modDir}"`,
        `--data-dir "${dataDir}"`,
        `--bundle-dir "${buildDir}"`
    ];

    let stingray = child_process.spawn(
        config.get('stingrayExe'),
        stingrayParams,
        {
            cwd: path.combine(toolsDir, config.get('stingrayDir')),
            windowsVerbatimArguments: true
        }
    );

    stingray.stdout.on('data', data => {
        if (verbose) {
            console.log(str.rmn(data));
        }
    });

    let buildTime = Date.now();

    return await new Promise((resolve, reject) => {
        stingray.on('error', error => reject(error));

        stingray.on('close', code => {
            buildTime = Date.now() - buildTime;
            buildTime = Math.round(buildTime / 10) / 100;
            console.log(`Finished building in ${buildTime}s`);
            resolve(code);
        });
    });
}

// Reads and outputs processed_bundles.csv
async function _processStingrayOutput(modName, dataDir, code, ignoreBuildErrors) {

    if (code) {
        print.error(
            `Stingray exited with error code: ${code}.\n` +
            `Please check your scripts for syntax errors and .package files for invalid resource paths.`
        );
    }

    let data = '';
    try {
        data = await pfs.readFile(path.combine(dataDir, 'processed_bundles.csv'), 'utf8');
    }
    catch (error) {
        print.error(error);
        print.error(`Failed to read processed_bundles.csv`);
    }

    if (data) {
        _outputFailedBundles(data, modName);
    }

    if (ignoreBuildErrors) {
        console.log(`Ignoring build errors`);
    }
    else if (code || !data) {
        throw new Error(`Failed to build ${modName}`);
    }
}

// Outputs built files which are empty
function _outputFailedBundles(data, modName) {
    let bundles = str.rmn(data).split('\n');
    bundles.splice(0, 1);

    for (let line of bundles) {
        let bundle = line.split(', ');

        if (bundle.length < 4) {
            print.error(`Incorrect processed_bundles.csv string`, bundle);
            continue;
        }

        if (bundle[3] == 0) {
            let name = bundle[1].replace(/"/g, '');
            let ext = bundle[2].replace(/"/g, '');
            print.error(`Failed to build ${modTools.getModDir(modName)}/${name}.${ext}`);
        }
    };
}

// Returns mod's directory in workshop folder
async function _getModWorkshopDir(modName, modId) {

    if (modId) {
        console.log(`Using specified item ID`);
    }
    else {
        modId = await modTools.getModId(modName);
    }

    console.log(`Item ID: ${modId}`);

    let workshopDir = await modTools.getWorkshopDir();

    return path.combine(workshopDir, String(modId));
}

async function _copyModFiles(modName, buildDir, bundleDir, modWorkshopDir) {
    return await new Promise((resolve, reject) => {

        console.log(`Copying to "${bundleDir}"`);

        let useExternalModFile = config.get('useExternalModFile');

        let modFileStream = null;
        if (useExternalModFile) {
            modFileStream = vinyl.src([
                modTools.getModFilePath(modName)
            ], { base: modTools.getModDir(modName)});
        }

        let bundleStream = vinyl.src([
            buildDir + '/*([0-f])',
            '!' + buildDir + '/dlc'
        ], { base: buildDir })
            .pipe(rename(p => {
                p.extname = config.get('bundleExtension');
            }))
            .on('error', reject);

        let mergedStream = useExternalModFile ? merge(modFileStream, bundleStream) : bundleStream;

        mergedStream = mergedStream.pipe(vinyl.dest(bundleDir)).on('error', reject);

        if (modWorkshopDir) {
            console.log(`Copying to "${modWorkshopDir}"`);
            mergedStream = mergedStream.pipe(vinyl.dest(modWorkshopDir)).on('error', reject);
        }

        mergedStream.on('end', () => {
            resolve();
        });
    });
}

async function _cleanBundleDirs(bundleDir, modWorkshopDir) {

    let bundleMask = '*' + config.get('bundleExtension');
    let modMask = '*' + config.get('modFileExtension');

    let modBundleMask = [
        path.combine(bundleDir, bundleMask),
        path.combine(bundleDir, modMask),
    ];

    let workshopBundleMask = modWorkshopDir ? [
        path.combine(modWorkshopDir, bundleMask),
        path.combine(modWorkshopDir, modMask),
    ] : null;

    await del(modBundleMask, { force: true });

    if (workshopBundleMask) {
        await del(workshopBundleMask, { force: true });
    }
}

module.exports = buildMod;
