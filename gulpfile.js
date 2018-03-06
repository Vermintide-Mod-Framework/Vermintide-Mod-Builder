'use strict';

const fs = require('fs'),
      path = require('path'),
      join = path.join,
      gulp = require('gulp'),
      minimist = require('minimist'),
      merge = require('merge-stream'),
      replace = require('gulp-replace'),
      rename = require('gulp-rename'),
      child_process = require('child_process'),
      util = require('util'),
      opn = require('opn');

const readFile = util.promisify(fs.readFile),
      writeFile = util.promisify(fs.writeFile);

const defaultTempDir = '.temp';

function readScriptConfig() {

	let scriptConfigFile = 'config.json';

	if(!fs.existsSync(scriptConfigFile)) {

		console.log('Creating default config.json');

		fs.writeFileSync(scriptConfigFile, 
			JSON.stringify({
				mods_dir: 'mods',
				temp_dir: '',

				fallback_stingray_exe: 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide Mod Tools/bin/stingray_win64_dev_x64.exe',
				fallback_workshop_dir: 'E:/SteamLibrary/SteamApps/workshop/content/235540',

				ignored_dirs: [
					'.git',
					defaultTempDir
				]
			}, null, '\t')
		);
	}

	return JSON.parse(fs.readFileSync(scriptConfigFile, 'utf8'));
}

const scriptConfig = readScriptConfig();

let modsDir = scriptConfig.mods_dir || 'mods';
let tempDir = scriptConfig.temp_dir;

const UNSPECIFIED_TEMP_DIR = !tempDir;

if(UNSPECIFIED_TEMP_DIR) {
	tempDir = join(modsDir, defaultTempDir);
}

const FALLBACK_STINGRAY_EXE = scriptConfig.fallback_stingray_exe,
      FALLBACK_WORKSHOP_DIR = scriptConfig.fallback_workshop_dir,
      IGNORED_DIRS = scriptConfig.ignored_dirs || [];


/* FOR CREATING */

// These will be replaced in the template mod when running tasks
const temp = '%%template',
	tempTitle = '%%title',
	tempDescription = '%%description';

// Folders with scripts and resources
const resDir = 'resource_packages';
const scriptDir = 'scripts/mods';
const localDir = 'localization';
const distDir = 'dist';
const renameDirs = [
	resDir,
	scriptDir
];

// Folders with static files
const coreSrc = [
	join(temp, '/core/**/*'),
	join(temp, 'item_preview.jpg')
];

// Folders with mod specific files
const modSrc = [
	join(temp, resDir, temp, temp + '.package'),
	join(temp, scriptDir, temp, temp + '.lua'),	
	join(temp, localDir, temp + '.lua'),	
	join(temp, distDir, temp),	
	join(temp, temp + '.mod')
];


/* FOR BUILDING */

// Path to workshop uploader tool
// The tool and all its files should be placed in ./ugc_tool folder as paths are relative to current directory
let uploaderExe = 'ugc_tool/ugc_tool.exe';

// Config file for workshop uploader tool
const cfgFile = 'item.cfg';


/* TASKS */

// All of these have the optional -f param that sets mods directory

// Creates a copy of the template mod and renames it to the provided name
// Uploads an empty mod file to the workshop to create an id
// gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
gulp.task('create', callback => {

	setModsDir(process.argv);

	let config = getWorkshopConfig(process.argv);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || fs.existsSync(modDir + '/')) {
		throw Error(`Folder ${modDir} is invalid or already exists`);
	}

	console.log('Copying template');

	copyTemplate(config)
		.then(() => createCfgFile(config))
		.then(() => uploadMod(modName))
		.then(modId => {
			let modUrl = formUrl(modId);
			console.log('Now you need to subscribe to ' + modUrl + ' in order to be able to build and test your mod.');
			console.log('Opening url...');
			return opn(modUrl);
		})
		.catch(error => {
			console.log(error);
			return deleteDirectory(join(modsDir, modName));
		})
		.catch(error => {
			console.log(error);
		})
		.then(() => callback());
});

// Builds the mod then uploads it to workshop as a new item
// gulp publish -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
gulp.task('publish', callback => {

	setModsDir(process.argv);

	let config = getWorkshopConfig(process.argv);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		throw Error(`Folder ${modDir} is invalid or doesn't exist`);
	}
	
	checkIfPublished(modName)
		.then(cfgExists => {
			if(cfgExists) {
				console.log('Using existing item.cfg');
			}
			return cfgExists ? Promise.resolve() : createCfgFile(config);
		})
		.then(() => getStingrayExe())
		.then(stingrayExe => buildMod(stingrayExe, modName, false, true, config.verbose, null))
		.then(() => copyIfDoesntExist(temp, 'item_preview.jpg', temp, modDir, 'item_preview', '.jpg'))
		.then(() => uploadMod(modName))
		.then(() => getModId(modName))
		.then(modId => {
			let modUrl = formUrl(modId);
			console.log('Uploaded to ' + modUrl);
			console.log('Opening url...');
			return opn(modUrl);
		})
		.catch(error => {
			console.log(error);
		})
		.then(() => callback());
});

// Uploads the last built version of the mod to the workshop
// gulp upload -m <mod_name> [-n <changenote>] [--open] [--skip]
gulp.task('upload', callback => {

	setModsDir(process.argv);

	let argv = minimist(process.argv);
	let modName = argv.m || argv.mod || '';
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		throw Error(`Folder ${modDir} is invalid or doesn't exist`);
	}

	let changenote = argv.n || argv.note || argv.changenote || '';
	if(typeof changenote != 'string') {
		changenote = '';
	}

	let openUrl = argv.o || argv.open || false;

	let skip = argv.s || argv.skip;

	uploadMod(modName, changenote, skip)
		.then(() => getModId(modName))
		.then(modId => {
			let modUrl = formUrl(modId);
			console.log('Uploaded to ' + modUrl);
			if(openUrl){
				console.log('Opening url...');
				return opn(modUrl);
			}
			else{
				return Promise.resolve();
			}
		})
		.catch(error => {
			console.log(error);
		})
		.then(() => callback());
});

// Opens mod's workshop page
// gulp open -m <mod_name> [--id <item_id>]
gulp.task('open', callback => {

	setModsDir(process.argv);

	let argv = minimist(process.argv);
	let modName = argv.m || argv.mod || '';
	let modDir = join(modsDir, modName);
	let modId = argv.id || null;

	if(!modId && (!validModName(modName) || !fs.existsSync(modDir + '/'))) {
		throw Error(`Folder ${modDir} doesn't exist`);
	}

	(modId ? Promise.resolve(modId) : getModId(modName))
		.then(modId => opn(formUrl(modId)))
		.catch(error => {
			console.log(error);
		})
		.then(() => callback());
});

// Builds specified mods and copies the bundles to the game workshop folder
// gulp build [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>] [--dist]
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete temp folder before building
// --id - forces item id. can only be passed if building one mod
// --dist - doesn't copy to workshop folder
gulp.task('build', callback => {

	setModsDir(process.argv);

	let {modNames, verbose, leaveTemp, modId, noWorkshopCopy} = getBuildParams(process.argv);

	console.log('Mods to build:');
	modNames.forEach(modName => console.log('- ' + modName));
	console.log();

	getStingrayExe().then(stingrayExe => {

		let promise = Promise.resolve();	
		forEachMod(modNames, noWorkshopCopy, modName => {
			promise = promise.then(() => {
				return buildMod(stingrayExe, modName, leaveTemp, noWorkshopCopy, verbose, modId).catch(error => {
					console.log(error);
				});
			});
		});
		return promise;
	}).catch(error => {
		console.log(error);
	})
	.then(() => callback());
});

// Watches for changes in specified mods and builds them whenever they occur
// gulp watch [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>] [--dist]
gulp.task('watch', callback => {

	setModsDir(process.argv);

	let {modNames, verbose, leaveTemp, modId, noWorkshopCopy} = getBuildParams(process.argv);

	getStingrayExe().then(stingrayExe => {
		forEachMod(modNames, noWorkshopCopy, (modName, modDir) => {
			console.log('Watching ', modName, '...');

			let src = [
				modDir, 
				'!' + modDir + '/*.tmp', 
				'!' + modDir + distDir + '/*'
			];

			gulp.watch(src, () => {
				return buildMod(stingrayExe, modName, leaveTemp, noWorkshopCopy, verbose, modId).catch(error => {
	    			console.log(error);
	    		});
			});
		});
		return callback();
	}).catch(error => {
		console.log(error);
	});
});


/* SHARED METHODS */

function setModsDir(pargv) {
	let argv = minimist(pargv);

	let newModsDir = argv.f || argv.folder;

	if(!newModsDir) {
		console.log(`Using mods folder '${modsDir}'`);
		console.log(`Using temp folder '${tempDir}'`);
		return;
	}

	if(typeof newModsDir == 'string') {
		console.log(`Using mods folder '${newModsDir}'`);
		modsDir = newModsDir;
		if(UNSPECIFIED_TEMP_DIR) {
			tempDir = join(modsDir, defaultTempDir);
		}
	}
	else {
		console.log(`Couldn't set mods folder '${newModsDir}', using default '${modsDir}'`);
	}
	console.log(`Using temp folder '${tempDir}'`);
}

function validModName(modName) {
	return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- ]+$/);
}

function getModId(modName) {
	return readFile(join(modsDir, modName, cfgFile), 'utf8')
		.then(data => {
			let modId = data.match(/^published_id *=? *(\d*)\D*$/m);
			modId = modId && modId[1];
			if(modId) {
				return Promise.resolve(modId);
			}
			else {
				return Promise.reject(
					'Item ID not found in item.cfg file.\n' +
					'You need to upload your mod to workshop before you can build/view it.\n' +
					'Alternatively you can specify the workshop item id with --id param.'
				);
			}
		});
}


/* CREATE AND UPLOAD METHODS */

function getWorkshopConfig(pargv) {
	let argv = minimist(pargv);

	let modName = argv.m || argv.mod || '';
	let modTitle = argv.t || argv.title || modName;

	return {
		name: modName,
		title: modTitle,
		description: argv.d || argv.desc || argv.description || modTitle + ' description',
		language: argv.l || argv.language || 'english',
		visibility: argv.v || argv.visibility || 'private',
		verbose: argv.verbose
	};
}

function copyTemplate(config) {
	let modName = config.name;
	let modDir = join(modsDir, modName);
	return new Promise((resolve, reject) => {
		gulp.src(modSrc, {base: temp})
			.pipe(replace(temp, modName))
			.pipe(replace(tempTitle, config.title))
			.pipe(replace(tempDescription, config.description))
			.pipe(rename(p => {
				p.basename = p.basename.replace(temp, modName);
			}))
			.pipe(gulp.dest(modDir))
			.on('error', reject)
			.on('end', () => {
				renameDirs.forEach(dir => {				
					fs.renameSync(join(modDir, dir, temp), join(modDir, dir, modName));
				});
				gulp.src(coreSrc, {base: temp})
					.pipe(gulp.dest(modDir))
					.on('error', reject)
					.on('end', resolve);
			});
	});
}

function createCfgFile(config) {
	let configText = `title = "${config.title}";\n` +
					`description = "${config.description}";\n` +
					`preview = "item_preview.jpg";\n` +
					`content = "dist";\n` +
					`language = "${config.language}";\n` +
					`visibility = "${config.visibility}";\n`;
	console.log('item.cfg:');
	console.log(configText);
	return writeFile(join(modsDir, config.name, cfgFile), configText);
}

// Uploads mod to the workshop
function uploadMod(modName, changenote, skip) {
	return new Promise((resolve, reject) => {
		let configPath = modsDir + '\\' + modName + '\\' + cfgFile;
		let uploaderParams = [
			'-c', '"' + configPath + '"'
		];
		if(changenote) {
			uploaderParams.push('-n');
			uploaderParams.push('"' + changenote + '"');
		}
		if(skip) {			
			uploaderParams.push('-s');
		}

		let uploader = child_process.spawn(
			uploaderExe, 
			uploaderParams, 
			{windowsVerbatimArguments: true}
		);

		let modId = '';
		uploader.stdout.on('data', data => {
			console.log(rmn(data));
			data = String(data);
			if (data.includes('publisher_id')){
				modId = data.match(/publisher_id: (\d*)/)[1];
			}
		});

		uploader.on('error', error => reject(error));

		uploader.on('close', code => {
			if(code) {
				reject('Uploader exited with code: ' + code);
			}
			else {
				resolve(modId);
			}
		});
	});
}

function formUrl(modId) {
	return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
}

function checkIfPublished(modName) {
	let modCfg = join(modsDir, modName, cfgFile);
	if(!fs.existsSync(modCfg)){
		return Promise.resolve(false);
	}
	return readFile(modCfg, 'utf8').then(data => {
		if(data.match(/^published_id *=? *(\d*)\D*$/m)) {
			return Promise.reject('Mod has already been published, use gulp upload instead.');
		}
		else {
			return Promise.resolve(true);
		}
	});
}


/* BUILD METHODS */

function forEachMod(modNames, noWorkshopCopy, action) {
	modNames.forEach(modName => {

		if(!modName) return;
		let modDir = join(modsDir, modName);

		if(validModName(modName) && fs.existsSync(modDir + '/') && (fs.existsSync(join(modDir, cfgFile)) || noWorkshopCopy)) {
			action(modName, modDir);
		}
		else {
			console.error('Folder', modDir, 'doesn\'t exist, invalid or doesn\'t have item.cfg in it');
		}
	});
}

// Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
function buildMod(stingrayExe, modName, leaveTemp, noWorkshopCopy, verbose, modId) {
	console.log('Building ', modName);

	let modDir = join(modsDir, modName);

	let modTempDir = join(tempDir, modName);
	let dataDir = join(modTempDir, 'compile');
	let buildDir = join(modTempDir, 'bundle');

	return checkTempFolder(modName, !leaveTemp)
		.then(() => {
			return modId || noWorkshopCopy ? Promise.resolve() : readFile(join(modDir, cfgFile), 'utf8');
		})
		.then(() => runStingray(stingrayExe, modDir, dataDir, buildDir, verbose))
		.then(code => readProcessedBundles(modName, dataDir, code))
		.then(() => {
			return noWorkshopCopy ? Promise.resolve() : getModWorkshopDir(modName, modId);
		})
		.then(modWorkshopDir => moveMod(modName, buildDir, modWorkshopDir))
		.then(success => {
			console.log(success);
			return Promise.resolve();
		});
}

// Returns a promise with specified registry entry value
function getRegistryValue(key, value) {

	return new Promise((resolve, reject) => {

		let spawn = child_process.spawn(
			'REG',
			['QUERY', key, '/v', value],
			{windowsVerbatimArguments: true}
		);

		let result = '';

		spawn.stdout.on('data', data => {
			result += String(data);
		});

		spawn.on('error', err => {
			reject(err);
		});

		spawn.on('close', code => {
			if(code || !result){
				reject(code);
				return;
			}
			try{
				result = result.split('\r\n')[2].split('    ')[3];
			}
			catch(e){
				reject();
			}
			resolve(result);
		});
	});
}

// Gets stingray.exe placement from Vermintide Mod Tools install location
function getStingrayExe(){
	return new Promise((resolve, reject) => {
		let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 718610"';
		let value = '"InstallLocation"';

		let stingrayExe = FALLBACK_STINGRAY_EXE;
		getRegistryValue(sdkKey, value)
			.catch(err => {
				console.log('Vermintide mod SDK directory not found, using fallback.');
			})
			.then(appPath => {
				if(appPath) {
					stingrayExe = join(appPath, 'bin/stingray_win64_dev_x64.exe');
				}
				console.log('Stingray executable:', stingrayExe);
				console.log();
				resolve(stingrayExe);
			});
	});
}

// Gets the steam workshop folder from vermintide's install location
function getWorkshopDir() {
	return new Promise((resolve, reject) => {
		let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 235540"';
		let value = '"InstallLocation"';

		let workshopDir = FALLBACK_WORKSHOP_DIR;
		let error = 'Vermintide workshop directory not found, using fallback.';
		getRegistryValue(appKey, value)
			.catch(err => {
				console.log(error);
			})
			.then(appPath => {
				if(appPath) {
					workshopDir = appPath.match(/(.*)common[\\\/]Warhammer End Times Vermintide[\\\/]?$/);
					workshopDir = workshopDir[1];
					if(!workshopDir){
						console.log(error);
						workshopDir = FALLBACK_WORKSHOP_DIR;
					}
					else{
						workshopDir = join(workshopDir, '\\workshop\\content\\235540\\');
					}
				}
				console.log('Workshop folder:', workshopDir);
				resolve(workshopDir);
			});
	});
}

// Returns [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
function getBuildParams(pargv) {
	let argv = minimist(pargv);
	let verbose = argv.verbose || false;
	let leaveTemp = argv.t || argv.temp || false;
	let modNames = argv.m || argv.mod || argv.mods || '';
	if(!modNames || typeof modNames != 'string') {
		modNames = getFolders(modsDir, IGNORED_DIRS);
	}
	else{
		modNames = modNames.split(/;+\s*/);
	}
	let modId = modNames.length == 1 ? argv.id : null;
	let noWorkshopCopy = argv.dist || false;
	return {modNames, verbose, leaveTemp, modId, noWorkshopCopy};
}

// Checks if temp folder exists, optionally removes it
function checkTempFolder(modName, shouldRemove) {
	return new Promise((resolve, reject) => {
		let tempPath = join(tempDir, modName);
		let tempExists = fs.existsSync(tempPath);
		if(tempExists && shouldRemove) {
			child_process.exec('rmdir /s /q "' + tempPath + '"', function (error) {
				if(error){
					return reject(error + '\nFailed to delete temp folder');
				}
				console.log('Removed ', tempPath);	
				return resolve();
			});
		}
		else{
			if(tempExists) {
				console.log('Overwriting temp folder');
			}
			return resolve();
		}
	});
}

// Builds the mod
function runStingray(stingrayExe, modDir, dataDir, buildDir, verbose) {
	return new Promise((resolve, reject) => {

		let stingrayParams = [
			`--compile-for win32`,
			`--source-dir "${modDir}"`,
			`--data-dir "${dataDir}"`,
			`--bundle-dir "${buildDir}"`
		];

		let stingray = child_process.spawn(
			stingrayExe, 
			stingrayParams, 
			{windowsVerbatimArguments: true} // fucking WHY???
		);

		stingray.stdout.on('data', data => {
			if(verbose){
			    console.log(rmn(data));
			}
		});

		stingray.on('error', error => reject(error));

		stingray.on('close', code => {
			console.log('Finished building');
			resolve(code);
		});
	});
}

// Reads and outputs processed_bundles.csv
function readProcessedBundles(modName, dataDir, code) {
	return readFile(join(dataDir, 'processed_bundles.csv'), 'utf8')
		.catch(error => {
			console.log(error + '\nFailed to read processed_bundles.csv');
		})
		.then(data => {
			return new Promise((resolve, reject) => {
				if(data) {
					outputFailedBundles(data, modName);
				}
				if(code) {
					console.log('Stingray exited with code: ' + code + '. Please check your scripts for syntax errors.');
					return resolve();
				}
				resolve();
			});
		});
}

// Outputs built files which are empty
function outputFailedBundles(data, modName) {
	let bundles = rmn(data).split('\n');
	bundles.splice(0, 1);
	bundles.forEach(line => {
		let bundle = line.split(', ');
		if(bundle[3] == 0) {
			console.log('Failed to build %s/%s/%s.%s', modsDir, modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
		}
	});
}

// Returns mod's directory in workshop folder
function getModWorkshopDir(modName, modId) {
	if(modId) {
		console.log('Using specified item ID');
	}
	let promise = modId ? Promise.resolve(modId) : getModId(modName);
	return promise.then(modId => {
		console.log('Item ID:', modId);
		return getWorkshopDir().then(workshopDir => {
			return Promise.resolve(join(workshopDir, String(modId)));
		});
	});
}

// Copies the mod to the modsDir and modName/dist
function moveMod(modName, buildDir, modWorkshopDir) {
	return new Promise((resolve, reject) => {
		let modDistDir = join(modsDir, modName, distDir);
		let gulpStream = gulp.src([
				buildDir + '/*([0-f])', 
				'!' + buildDir + '/dlc'
			], {base: buildDir})
			.pipe(rename(p => {
				p.basename = modName;
				p.extname = '';
			}))
			.on('error', reject)
			.pipe(gulp.dest(modDistDir))
			.on('error', reject);

		if(modWorkshopDir){
			console.log('Copying to ', modWorkshopDir);
			gulpStream.pipe(gulp.dest(modWorkshopDir)).on('error', reject);
		}

		gulpStream.on('end', () => {
			resolve('Successfully built ' + modName + '\n');
		});
	});
}


/* MISC METHODS */

// Returns an array of folders in dir, except the ones in second param
function getFolders(dir, except) {
	return fs.readdirSync(dir)
		.filter(function(fileName) {
			return fs.statSync(join(dir, fileName)).isDirectory() && (!except || !except.includes(fileName));
		});
}

function deleteFile(dir, file) {
    return new Promise(function (resolve, reject) {
        var filePath = path.join(dir, file);
        fs.lstat(filePath, function (err, stats) {
            if (err) {
                return reject(err);
            }
            if (stats.isDirectory()) {
                resolve(deleteDirectory(filePath));
            } else {
                fs.unlink(filePath, function (err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            }
        });
    });
}

function deleteDirectory(dir) {
    return new Promise(function (resolve, reject) {
        fs.access(dir, err => {
            if (err) {
                return reject(err);
            }
            fs.readdir(dir, (err, files) => {
                if (err) {
                    return reject(err);
                }
                Promise.all(files.map(file => {
                    return deleteFile(dir, file);
                })).then(() => {
                    fs.rmdir(dir, err => {
                        if (err) {
                            return reject(err);
                        }
                        resolve();
                    });
                }).catch(reject);
            });
        });
    });
}

function copyIfDoesntExist(filePath, fileName, base, dest, destBase, destExt) {
	return new Promise((resolve, reject) => {
		if(fs.existsSync(join(dest, destBase + destExt))) {
			resolve();
		}
		else{
			gulp.src(join(filePath, fileName), {base: base})
				.pipe(rename(p => {
					p.basename = destBase;
					p.extname = destExt;
				}))
				.pipe(gulp.dest(dest))
				.on('error', reject)
				.on('end', resolve);
		}
	});
}

// Removes trailing /n
function rmn(str) {
	str = String(str);
	if(str[str.length - 1] == '\n'){
		return str.slice(0, -1);
	}
	else {
		return str;
	}
}
