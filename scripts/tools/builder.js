const child_process = require('child_process');
const vinyl = require('vinyl-fs');
const rename = require('gulp-rename');
const del = require('del');
const merge = require('merge-stream');

const print = require('../print');

const pfs = require('../lib/pfs');
const path = require('../lib/path');
const str = require('../lib/str');

const config = require('../modules/config');
const cfg = require('../modules/cfg');

const modTools = require('./mod_tools');

// Builds modName, optionally deleting its temp folder, and copies it to the bundle and workshop dirs
async function buildMod(toolsDir, modName, params) {
    console.log(`\nPreparing to build ${modName}`);

    let { shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId } = params;

    // Check that modName.mod file exists in the mod folder
    let modFilePath = modTools.getModFilePath(modName);
    if (config.get('useNewFormat') && !await pfs.accessible(modFilePath)) {
        throw new Error(`File "${modFilePath}" not found`);
    }

    // Folders where stingray output will be placed
    let modTempDir = modTools.getTempDir(modName);
    let dataDir = path.combine(modTempDir, 'compile');
    let buildDir = path.combine(modTempDir, 'bundle');

    // Print if temp folder exists, optionally remove it
    await _checkTempFolder(modName, shouldRemoveTemp);

    // Since this method if used in publish task that doesn't have use modTools.validateModNames,
    // we need to check that .cfg file exists here
    // --id=<item_id> and --no-workshop allow .cfg to be absent
    let cfgExists = await cfg.fileExists(modName);
    if (!modId && makeWorkshopCopy && !cfgExists) {
        throw new Error(`${cfg.getBase()} not found in "${cfg.getDir(modName)}"`);
    }

    console.log(`Building ${modName}`);

    // Run stingray and process its output
    let modDir = modTools.getModDir(modName);
    let stingrayExitCode = await _runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
    await _processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

    // Only read bundle folder from .cfg file if it exists, otherwise use default folder
    let bundleDir = modTools.getDefaultBundleDir(modName);
    if (cfgExists) {
        try {
            bundleDir = await modTools.getBundleDir(modName);
        }
        catch (error) {
            error.message += `\nDefault bundle folder "${bundleDir}" will be used.`;
            print.warn(error);
        }
    }

    // Remove bundle and .mod files from bundle folders
    await _cleanBundleDir(bundleDir);

    let modWorkshopDir;
    if(makeWorkshopCopy) {
        modWorkshopDir = await _getModWorkshopDir(modName, modId);
        await _cleanBundleDir(modWorkshopDir);
    }

    // Copy bundle and .mod file to bundleDir and optionally modWorkshopDir
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

// Builds the bundle
async function _runStingray(toolsDir, modDir, dataDir, buildDir, verbose) {

    let stingrayParams = [
        `--compile-for win32`,
        `--source-dir "${modDir}"`,
        `--data-dir "${dataDir}"`,
        `--bundle-dir "${buildDir}"`
    ];

    // Spawn stingray.exe
    let stingray = child_process.spawn(
        config.get('stingrayExe'),
        stingrayParams,
        {
            // Working from stingray's location
            cwd: path.combine(toolsDir, config.get('stingrayDir')),
            windowsVerbatimArguments: true
        }
    );

    // Print stingray output if --verbose flag is set
    stingray.stdout.on('data', data => {
        if (verbose) {
            console.log(str.rmn(data));
        }
    });

    let buildTime = Date.now();

    return await new Promise((resolve, reject) => {
        stingray.on('error', error => reject(error));

        stingray.on('close', code => {

            // Build time in seconds
            buildTime = Date.now() - buildTime;
            buildTime = Math.round(buildTime / 10) / 100;

            console.log(`Finished building in ${buildTime}s`);
            resolve(code);
        });
    });
}

// Reads and outputs processed_bundles.csv
async function _processStingrayOutput(modName, dataDir, code, ignoreBuildErrors) {

    // Suggest what user needs to do if stingray exited with an exit code
    if (code) {
        print.error(
            `Stingray exited with error code: ${code}.\n` +
            `Please check your scripts for syntax errors and .package files for invalid resource paths.`
        );
    }

    // Read and output processed_bundles.csv generated by stingray.exe
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

    // Throw on error if --ignore-errors flag isn't set
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

        // Each line has to be bundle, "resource", "type", "bytes"
        if (bundle.length < 4) {
            print.error(`Incorrect processed_bundles.csv string`, bundle);
            continue;
        }

        // processed_bundles.csv has a list of processed files with how much space they take up in the bundle
        // If it's 0, that means the file failed to be included
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

// Copies bundle and .mod file to bundleDir, and optionally modWorkshopDir, from buildDir
async function _copyModFiles(modName, buildDir, bundleDir, modWorkshopDir) {
    return await new Promise((resolve, reject) => {

        console.log(`Copying to "${bundleDir}"`);

        let useNewFormat = config.get('useNewFormat');

        let modFileStream = null;
        if (useNewFormat) {
            modFileStream = vinyl.src([
                modTools.getModFilePath(modName)
            ], { base: modTools.getModDir(modName)});
        }

        let bundleStream = vinyl.src([
            buildDir + '/*([0-f])',
            '!' + buildDir + '/dlc'
        ], { base: buildDir })
            .pipe(rename(p => {

                if(!config.get('useNewFormat')) {
                    p.basename = modTools.hashModName(modName);
                }

                p.extname = config.get('bundleExtension');
            }))
            .on('error', reject);

        let mergedStream = useNewFormat ? merge(modFileStream, bundleStream) : bundleStream;

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

// Removes bundle and .mod files from bundleDir
async function _cleanBundleDir(bundleDir) {

    let bundleMask = '*' + config.get('bundleExtension');
    let modMask = '*' + config.get('modFileExtension');

    let modBundleMask = [
        path.combine(bundleDir, bundleMask),
        path.combine(bundleDir, modMask),
    ];

    await del(modBundleMask, { force: true });
}

exports.buildMod = buildMod;
