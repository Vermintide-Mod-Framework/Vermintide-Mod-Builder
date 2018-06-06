const child_process = require('child_process');
const gulp = require('gulp');
const rename = require('gulp-rename');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const modTools = require('./mod_tools');
const str = require('./lib/str');
const del = require('del');

let builder = {
    async forEachMod(modNames, cfgMustExist, action, onError) {
        for (let modName of modNames) {

            if (!modName) {
                continue;
            }

            let modDir = path.combine(config.modsDir, modName);

            let error = '';
            let cfgExists = await pfs.accessible(path.combine(modDir, config.cfgFile));
            if (!modTools.validModName(modName)) {
                error = `Folder name "${modDir}" is invalid`;
            }
            else if (!await pfs.accessible(modDir + '/')) {
                error = `Folder "${modDir}" doesn't exist`;
            }
            else if (!cfgExists && cfgMustExist) {
                error = `Folder "${modDir}" doesn't have ${config.cfgFile} in it`;
            }

            if (error) {
                if (typeof onError == 'function') {
                    await onError(error);
                }
                else {
                    throw error;
                }
                continue;
            }

            await action(modName, modDir, cfgExists);
        };
    },

    // Builds modName, optionally deleting its temp folder, and copies it to the bundle and workshop dirs
    async buildMod(toolsDir, modName, shouldRemoveTemp, makeWorkshopCopy, verbose, ignoreBuildErrors, modId) {
        console.log(`\nPreparing to build ${modName}`);

        let modDir = path.combine(config.modsDir, modName);

        let modTempDir = path.combine(config.tempDir, `${modName}V${config.gameNumber}`);
        let dataDir = path.combine(modTempDir, 'compile');
        let buildDir = path.combine(modTempDir, 'bundle');

        await checkTempFolder(modName, shouldRemoveTemp);

        if (!modId && makeWorkshopCopy && !await pfs.accessible(path.combine(modDir, config.cfgFile))) {
            throw `Mod folder doesn't have ${config.cfgFile}`;
        }

        console.log(`Building ${modName}`);
        let stingrayExitCode = await runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
        await processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

        let modWorkshopDir = makeWorkshopCopy && await getModWorkshopDir(modName, modId);
        await cleanBundleDirs(modName, modWorkshopDir);
        await moveMod(modName, buildDir, modWorkshopDir);

        console.log(`Successfully built ${modName}`);
    }
};

// Checks if temp folder exists, optionally removes it
async function checkTempFolder(modName, shouldRemove) {
    let tempPath = path.combine(config.tempDir, `${modName}V${config.gameNumber}`);
    let tempExists = await pfs.accessible(tempPath);

    if (tempExists && shouldRemove) {
        return await new Promise((resolve, reject) => {
            child_process.exec(`rmdir /s /q "${tempPath}"`, error => {

                if (error) {
                    return reject(`${error}\nFailed to delete temp folder`);
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
async function runStingray(toolsDir, modDir, dataDir, buildDir, verbose) {

    let stingrayParams = [
        `--compile-for win32`,
        `--source-dir "${modDir}"`,
        `--data-dir "${dataDir}"`,
        `--bundle-dir "${buildDir}"`
    ];

    let stingray = child_process.spawn(
        config.stingrayExe,
        stingrayParams,
        {
            cwd: path.combine(toolsDir, config.stingrayDir),
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
async function processStingrayOutput(modName, dataDir, code, ignoreBuildErrors) {

    if (code) {
        console.error(`Stingray exited with error code: ${code}. Please check your scripts for syntax errors.`);
    }

    let data = await pfs.readFile(path.combine(dataDir, 'processed_bundles.csv'), 'utf8').catch(error => {
        console.error(error);
        console.error(`Failed to read processed_bundles.csv`);
    });


    if (data) {
        outputFailedBundles(data, modName);
    }

    if (ignoreBuildErrors) {
        console.log(`Ignoring build errors`);
    }

    if (!ignoreBuildErrors && (code || !data)) {
        throw `Failed to build ${modName}`;
    }
}

// Outputs built files which are empty
function outputFailedBundles(data, modName) {
    let bundles = str.rmn(data).split('\n');
    bundles.splice(0, 1);

    for (let line of bundles) {
        let bundle = line.split(', ');

        if (bundle.length < 4) {
            console.log(`Incorrect processed_bundles.csv string`, bundle);
            continue;
        }

        /* jshint ignore:start */
        if (bundle[3] == 0) {
            console.log('Failed to build %s/%s/%s.%s', config.modsDir, modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
        }
        /* jshint ignore:end */
    };
}

// Returns mod's directory in workshop folder
async function getModWorkshopDir(modName, modId) {
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

// Copies the mod to the config.modsDir and modName/bundle
async function moveMod(modName, buildDir, modWorkshopDir) {
    return await new Promise((resolve, reject) => {

        let modBundleDir = path.combine(config.modsDir, modName, config.bundleDir);

        let gulpStream = gulp.src([
            buildDir + '/*([0-f])',
            '!' + buildDir + '/dlc'
        ], { base: buildDir })
            .pipe(rename(p => {
                p.basename = modTools.hashModName(modName);
                p.extname = config.bundleExtension;
            }))
            .on('error', reject)
            .pipe(gulp.dest(modBundleDir))
            .on('error', reject);

        if (modWorkshopDir) {
            console.log(`Copying to ${modWorkshopDir}`);
            gulpStream = gulpStream.pipe(gulp.dest(modWorkshopDir)).on('error', reject);
        }

        gulpStream.on('end', () => {
            resolve();
        });
    });
}

async function cleanBundleDirs(modName, modWorkshopDir) {

    let bundleMask = '*' + config.bundleExtension;
    let modBundleMask = path.combine(config.modsDir, modName, config.bundleDir, bundleMask);
    let workshopBundleMask = modWorkshopDir ? path.combine(modWorkshopDir, bundleMask) : null;

    await del([modBundleMask], { force: true });

    if (workshopBundleMask) {
        await del([workshopBundleMask], { force: true });
    }
}

module.exports = builder;
