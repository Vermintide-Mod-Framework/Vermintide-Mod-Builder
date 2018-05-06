const child_process = require('child_process');
const gulp = require('gulp');
const rename = require('gulp-rename');
const pfs = require('./lib/pfs');
const path = require('./lib/path');
const config = require('./config');
const reg = require('./lib/reg');
const modTools = require('./mod_tools');
const str = require('./lib/str');

let builder = {
    async forEachMod(modNames, noWorkshopCopy, action, noAction) {
        for (let modName of modNames) {

            if (!modName) {
                continue;
            }

            let modDir = path.combine(config.modsDir, modName);

            let error = '';
            if (!modTools.validModName(modName)) {
                error = `Folder name "${modDir}" is invalid`;
            }
            else if (!await pfs.accessible(modDir + '/')) {
                error = `Folder "${modDir}" doesn't exist`;
            }
            else if (!await pfs.accessible(path.combine(modDir, config.cfgFile)) && !noWorkshopCopy) {
                error = `Folder "${modDir}" doesn't have ${config.cfgFile} in it`;
            }

            if (error) {
                if (typeof noAction == 'function') {
                    await noAction();
                }
                console.error(error);
                continue;
            }

            await action(modName, modDir);
        };
    },

    // Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
    async buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId) {
        console.log(`\nBuilding ${modName}`);

        let modDir = path.combine(config.modsDir, modName);

        let modTempDir = path.combine(config.tempDir, modName);
        let dataDir = path.combine(modTempDir, 'compile');
        let buildDir = path.combine(modTempDir, 'bundle');

        await checkTempFolder(modName, shouldRemoveTemp);

        if (!modId && !noWorkshopCopy && !await pfs.accessible(path.combine(modDir, config.cfgFile))) {
            throw `Mod folder doesn't have ${config.cfgFile}`;
        }

        let stingrayExitCode = await runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
        await processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

        let modWorkshopDir = !noWorkshopCopy && await getModWorkshopDir(modName, modId);
        await moveMod(modName, buildDir, modWorkshopDir);

        console.log(`Successfully built ${modName}`);
    }
};

// Gets the steam workshop folder from vermintide's install location
async function getWorkshopDir() {
    let gameId = config.gameId;
    let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + gameId + '"';
    let value = '"InstallLocation"';

    let workshopDir = config.fallbackSteamAppsDir;

    if (config.useFallback) {
        console.log(`Using fallback SteamApps folder.`);
    }
    else {
        let errorMsg = 'SteamApps folder not found, using fallback.';
        let appPath = await reg.get(appKey, value).catch(err => {
            console.error(err);
        });

        if (appPath && typeof appPath == 'string') {

            appPath = path.fix(appPath);
            let parts = appPath.split('/');
            let neededPart = parts[parts.length - 2];

            if (!neededPart) {
                console.error(errorMsg);
            }
            else {
                workshopDir = appPath.substring(0, appPath.lastIndexOf(neededPart));
            }
        }
        else {
            console.error(errorMsg);
        }
    }

    if (!await pfs.accessible(workshopDir)) {
        throw `SteamApps folder "${workshopDir}" not found.\nYou need to specify a valid fallback path.`;
    }

    workshopDir = path.combine(workshopDir, 'workshop/content', gameId);
    console.log(`Workshop folder ${workshopDir}`);
    return workshopDir;
}

// Checks if temp folder exists, optionally removes it
async function checkTempFolder(modName, shouldRemove) {
    let tempPath = path.combine(config.tempDir, modName);
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

    let workshopDir = await getWorkshopDir();

    return path.combine(workshopDir, String(modId));
}

// Copies the mod to the config.modsDir and modName/dist
async function moveMod(modName, buildDir, modWorkshopDir) {
    return await new Promise((resolve, reject) => {

        let modDistDir = path.combine(config.modsDir, modName, config.distDir);

        let gulpStream = gulp.src([
            buildDir + '/*([0-f])',
            '!' + buildDir + '/dlc'
        ], { base: buildDir })
            .pipe(rename(p => {
                p.basename = modName;
                p.extname = config.bundleExtension;
            }))
            .on('error', reject)
            .pipe(gulp.dest(modDistDir))
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

module.exports = builder;
