const child_process = require('child_process');
const vinyl = require('vinyl-fs');
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

    let { shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId, copySource, useModCore } = params;

    // Check that modName.mod file exists in the mod folder
    let modFilePath = modTools.getModFilePath(modName);
    if (config.get('useNewFormat') && !await pfs.accessibleFile(modFilePath)) {
        throw new Error(`File "${modFilePath}" not found`);
    }

    // Print if temp folder exists, optionally remove it
    let modTempDir = await _getTempDir(modName, shouldRemoveTemp);

    // Folders where stingray output will be placed
    let dataDir = path.combine(modTempDir, 'compile');
    let buildDir = path.combine(modTempDir, 'bundle');

    // Since this method, if used in publish task, doesn't use modTools.validateModNames,
    // we need to check that .cfg file exists here
    // --id=<item_id> and --no-workshop allow .cfg to be absent
    let cfgPath = cfg.getPath(modName);
    let cfgExists = await pfs.accessibleFile(cfgPath);
    let cfgData = cfgExists && await cfg.readFile(cfgPath);
    if (!modId && makeWorkshopCopy && !cfgExists) {
        throw new Error(`${cfg.getBase()} not found in "${cfg.getDir(modName)}"`);
    }

    // Only read bundle folder from .cfg file if it exists, otherwise use default folder
    let { bundleDir, itemPreview, error } = cfgExists ? _getParamsFromCfgData(modName, cfgPath, cfgData) : {};
    if (!bundleDir) {

        bundleDir = modTools.getDefaultBundleDir(modName);

        let errorMessage = `Default bundle folder "${bundleDir}" will be used.`;
        if (error) {
            error.message += `\n${errorMessage}`;
        }
        else {
            error = errorMessage;
        }
        print.warn(error);
    }

    // Get bundle dirs and item previews from all .cfg files
    let { bundleDirs, itemPreviews } = await getRelevantCfgParams(modName, bundleDir, itemPreview);

    // Remove source code from all bundle dirs
    await _deleteSource(bundleDirs);

    console.log(`Building ${modName}`);

    // Run stingray and process its output
    let modDir = modTools.getModDir(modName);
    let sdkDir = await modTools.getModToolsDir();
    let stingrayExitCode = await _runStingray(toolsDir, modDir, dataDir, buildDir, sdkDir, verbose, useModCore);
    await _processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

    // Remove bundle and .mod files from bundle folders
    await _cleanBundleDir(bundleDir);

    let modWorkshopDir;
    if(makeWorkshopCopy) {
        modWorkshopDir = await _getModWorkshopDir(modName, modId);
        await _cleanBundleDir(modWorkshopDir);
    }

    // Copy bundle and .mod file to bundleDir and optionally modWorkshopDir
    await _copyModFiles(modName, buildDir, bundleDir, modWorkshopDir);

    // Copy source code, ignoring bundle dirs, item previews and .cfg files
    if (copySource) {
        await _copySource(modName, bundleDir, bundleDirs, itemPreviews);
    }

    console.log(`Successfully built ${modName}`);
}

// Checks if temp folder exists, optionally removes it
async function _getTempDir(modName, shouldRemove) {
    let tempDir = modTools.getTempDir(modName);
    let tempExists = await pfs.accessibleDir(tempDir);

    if (tempExists && shouldRemove) {

        try {
            await pfs.deleteDirectory(tempDir);
        }
        catch (error) {
            error.message += '\nFailed to delete temp folder';

        }

        console.log(`Removed ${tempDir}`);
    }
    else if (tempExists) {
        console.log(`Overwriting temp folder`);
    }

    return tempDir;
}

// Builds the bundle
async function _runStingray(toolsDir, modDir, dataDir, buildDir, sdkDir, verbose, use_mod_core) {
    let stingrayParams = [
        `--compile-for win32`,
        `--source-dir "${modDir}"`,
        `--data-dir "${dataDir}"`,
        `--bundle-dir "${buildDir}"`,
        `--map-source-dir core "${sdkDir}"`
    ];

    // Removes map-source-dir flag if the mod's "core" folder is to be used
    if (use_mod_core) {
        stingrayParams.pop();
    }

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

    stingray.stderr.on('data', data => {
        console.error(str.rmn(data));
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
            `Check your scripts for syntax errors and .package files for invalid resource paths.`
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
        let bundle = line.split(',');

        // Each line has to be bundle, "resource", "type", "bytes"
        if (bundle.length < 4) {
            print.error(`Incorrect processed_bundles.csv string\n${bundle}`);
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

        console.log(`Copying mod files to "${bundleDir}"`);

        let useNewFormat = config.get('useNewFormat');

        let modFileStream = null;
        if (useNewFormat) {
            modFileStream = vinyl.src([
                modTools.getModFilePath(modName)
            ], { base: modTools.getModDir(modName)});
        }

        let bundleStream = modTools.bundleStreamer('bundleExtension', buildDir, useNewFormat, modName, reject);

        let mergedStream = useNewFormat ? merge(modFileStream, bundleStream) : bundleStream;

        mergedStream = mergedStream.pipe(vinyl.dest(bundleDir)).on('error', reject);

        if (modWorkshopDir) {
            console.log(`Copying mod files to "${modWorkshopDir}"`);
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

// Returns arrays with bundle dirs and item previews from all .cfg files
async function getRelevantCfgParams(modName, targetBundleDir, targetItemPreview) {
    let modDir = modTools.getModDir(modName);
    let fileNames = await pfs.getFileNames(modDir);
    let bundleDirs = targetBundleDir ? [targetBundleDir] : [];
    let itemPreviews = targetItemPreview ? [targetItemPreview] : [];

    for (let fileName of fileNames) {

        let filePath = path.combine(modDir, fileName);

        if (path.parse(filePath).ext == '.cfg' && await pfs.accessibleFile(filePath)) {
            let cfgData = await pfs.readFile(filePath, 'utf8');

            let { bundleDir, itemPreview } = _getParamsFromCfgData(modName, filePath, cfgData);

            if (bundleDir && !bundleDirs.includes(bundleDir)) {
                bundleDirs.push(bundleDir);
            }

            if(itemPreview && !itemPreviews.includes(itemPreview)) {
                itemPreviews.push(itemPreview);
            }
        }

    }

    return { bundleDirs, itemPreviews };
}

function _getParamsFromCfgData(modName, cfgPath, cfgData) {
    let modDir = modTools.getModDir(modName);
    let bundleDir, itemPreview, error;

    try {
        bundleDir = cfg.getMappedValue(cfgPath, cfgData, 'bundleDir');
        bundleDir = path.absolutify(path.fix(bundleDir), modDir);
    }
    catch (err) {
        bundleDir = null;
        error = err;
    }

    try {
        itemPreview = cfg.getMappedValue(cfgPath, cfgData, 'itemPreview');
        itemPreview = path.absolutify(path.fix(itemPreview), modDir);
    }
    catch (err) {
        itemPreview = null;
    }

    return {bundleDir, itemPreview, error};
}

async function _deleteSource(bundleDirs = []) {

    console.log('Deleting old source files');

    for(let bundleDir of bundleDirs) {
        let sourcePath = path.combine(bundleDir, 'source');

        if (await pfs.accessibleDir(sourcePath)) {
            console.log(`Deleting "${sourcePath}"`);
            await pfs.deleteDirectory(sourcePath);
        }
    }
}

// Copies source code, ignoring bundle dirs, ignoredDirsPerMod, item previews and .cfg files
async function _copySource(modName, targetBundleDir, bundleDirs = [], itemPreviews = []) {
    let modDir = modTools.getModDir(modName);

    let src = [
        path.combine(modDir, '/**/*'),
        '!' + path.combine(modDir, '/*.cfg')
    ];

    for(let bundleDir of bundleDirs) {
        src.push('!' + bundleDir);
        src.push('!' + bundleDir + '/**');
    }

    for(let ignoredDir of config.get('ignoredDirsPerMod')) {
        ignoredDir = path.combine(modDir, ignoredDir);
        src.push('!' + ignoredDir);
        src.push('!' + ignoredDir + '/**');
    }

    for (let itemPreview of itemPreviews) {
        src.push('!' + itemPreview);
    }

    let sourcePath = path.combine(targetBundleDir, 'source');

    console.log(`Copying source files to "${sourcePath}"`);
    return await new Promise(function(resolve, reject) {
        vinyl.src(src, {
            base: modDir,
            dot: config.get('includeDotFiles')
        }).pipe(vinyl.dest(sourcePath))
            .on('error', reject)
            .on('end', () => {
                resolve();
            });
    });
}

exports.buildMod = buildMod;
exports.getRelevantCfgParams = getRelevantCfgParams;