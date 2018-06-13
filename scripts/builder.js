const child_process = require('child_process');
const vinyl = require('vinyl-fs');
const rename = require('gulp-rename');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const cfg = require('./cfg');
const modTools = require('./mod_tools');
const str = require('./lib/str');
const del = require('del');

// Builds modName, optionally deleting its temp folder, and copies it to the bundle and workshop dirs
async function buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId) {
    console.log(`\nPreparing to build ${modName}`);

    let modDir = path.combine(config.get('modsDir'), modName);

    let modTempDir = path.combine(config.get('tempDir'), `${modName}V${config.get('gameNumber')}`);
    let dataDir = path.combine(modTempDir, 'compile');
    let buildDir = path.combine(modTempDir, 'bundle');

    await _checkTempFolder(modName, shouldRemoveTemp);

    if (!modId && makeWorkshopCopy && !await cfg.fileExists(modName)) {
        throw new Error(`${cfg.getBase()} not found in "${cfg.getDir(modName)}"`);
    }

    console.log(`Building ${modName}`);
    let stingrayExitCode = await _runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
    await _processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

    let modWorkshopDir = makeWorkshopCopy && await _getModWorkshopDir(modName, modId);
    await _cleanBundleDirs(modName, modWorkshopDir);
    await _moveMod(modName, buildDir, modWorkshopDir);

    console.log(`Successfully built ${modName}`);
}

// Checks if temp folder exists, optionally removes it
async function _checkTempFolder(modName, shouldRemove) {
    let tempPath = path.combine(config.get('tempDir'), `${modName}V${config.get('gameNumber')}`);
    let tempExists = await pfs.accessible(tempPath);

    if (tempExists && shouldRemove) {
        return await new Promise((resolve, reject) => {
            child_process.exec(`rmdir /s /q "${tempPath}"`, error => {

                if (error) {
                    error.message += '\nFailed to delete temp folder';
                    return reject(error);
                }

                console.log(`Removed ${tempPath}`);
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
        console.error(`Stingray exited with error code: ${code}. Please check your scripts for syntax errors.`);
    }

    let data = '';
    try {
        data = await pfs.readFile(path.combine(dataDir, 'processed_bundles.csv'), 'utf8');
    }
    catch (error) {
        console.error(error);
        console.error(`Failed to read processed_bundles.csv`);
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
            console.error(`Incorrect processed_bundles.csv string`, bundle);
            continue;
        }

        if (bundle[3] == 0) {
            console.error('Failed to build %s/%s/%s.%s', config.get('modsDir'), modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
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

// Copies the mod to the config.get('modsDir') and modName/bundle
async function _moveMod(modName, buildDir, modWorkshopDir) {
    return await new Promise((resolve, reject) => {

        let modBundleDir = path.combine(config.get('modsDir'), modName, config.get('bundleDir'));

        let gulpStream = vinyl.src([
            buildDir + '/*([0-f])',
            '!' + buildDir + '/dlc'
        ], { base: buildDir })
            .pipe(rename(p => {
                p.basename = modTools.hashModName(modName);
                p.extname = config.get('bundleExtension');
            }))
            .on('error', reject)
            .pipe(vinyl.dest(modBundleDir))
            .on('error', reject);

        if (modWorkshopDir) {
            console.log(`Copying to ${modWorkshopDir}`);
            gulpStream = gulpStream.pipe(vinyl.dest(modWorkshopDir)).on('error', reject);
        }

        gulpStream.on('end', () => {
            resolve();
        });
    });
}

async function _cleanBundleDirs(modName, modWorkshopDir) {

    let bundleMask = '*' + config.get('bundleExtension');
    let modBundleMask = path.combine(config.get('modsDir'), modName, config.get('bundleDir'), bundleMask);
    let workshopBundleMask = modWorkshopDir ? path.combine(modWorkshopDir, bundleMask) : null;

    await del([modBundleMask], { force: true });

    if (workshopBundleMask) {
        await del([workshopBundleMask], { force: true });
    }
}

module.exports = buildMod;
