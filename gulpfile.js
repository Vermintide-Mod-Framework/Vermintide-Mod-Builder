'use strict';

const 
	fs = require('fs'),
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

const 
	readFile = util.promisify(fs.readFile),
	writeFile = util.promisify(fs.writeFile);


// CHANGE THESE:
// Fallback paths to stingray executable and steam workshop folder
let fallbackStingrayExe = 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide Mod Tools/bin/stingray_win64_dev_x64.exe';
let fallbackWorkshopDir = 'E:/SteamLibrary/SteamApps/workshop/content/235540';

// CHANGE THESE maybe:
// Folders that will be ignored when building/watching all mods
const ignoredDirs = [
	'%%template',
	'.git',
	'.temp',
	'node_modules',
	'ugc_tool'
];

// Probably don't CHANGE THESE:
// These will be replaced in the template mod when running tasks
const temp = '%%template',
	tempTitle = '%%title',
	tempDescription = '%%description';

// Path to workshop uploader tool
// The tool and all its dlls should be placed in ./ugc_tool folder as paths are relative to current directory
let uploaderExe = 'ugc_tool/ugc_tool.exe';

// Config file for workshop uploader tool
const cfgFile = 'item.cfg';

// Folders with scripts and resources
const resDir = '/resource_packages';
const scriptDir = '/scripts/mods';
const localDir = '/localization';
const distDir = '/dist';
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

// Creates a copy of the template mod and renames it to the provided name
// Uploads the an empty mod file to the workshop to create an id
// gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
gulp.task('create', (callback) => {
	let argv = minimist(process.argv);

	let modName = argv.m || argv.mod || '';
	let modTitle = argv.t || argv.title || modName;
	let config = {
		name: modName,
		title: modTitle,
		description: argv.d || argv.desc || argv.description || modTitle + ' description',
		language: argv.l || argv.language || 'english',
		visibility: argv.v || argv.visibility || 'private'
	};
	if(!modName || fs.existsSync(modName + '/')) {
		throw Error(`Folder ${modName} is invalid or already exists`);
	}
	console.log('Copying template');
	copyTemplate(config)
		.then(() => createCfgFile(config))
		.then(() => uploadMod(modName))
		.then((modId) => {
			let modUrl = 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
			console.log('Now you need to subscribe to ' + modUrl + ' in order to be able to build and test your mod.');
			console.log('Opening url...');
			return opn(modUrl);
		})
		.catch((error) => {
			console.log(error);
			return deleteDirectory(modName);
		})
		.catch((error) => {
			console.log(error);
		})
		.then(() => callback());
});

// Uploads the last built version of the mod to the workshop
// gulp upload -m <mod_name> [-n <changenote>] --open
gulp.task('upload', (callback) => {
	let argv = minimist(process.argv);

	let modName = argv.m || argv.mod || '';
	if(!fs.existsSync(modName + '/')) {
		throw Error(`Folder ${modName} doesn't exist`);
	}

	let changenote = argv.n || argv.note || argv.changenote || '';
	if(typeof changenote != 'string') {
		changenote = '';
	}

	let openUrl = argv.o || argv.open || false;

	uploadMod(modName, changenote)
		.then(() => getModId(modName))
		.then((modId) => {
			let modUrl = 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
			console.log('Uploaded to '+ modUrl);
			if(openUrl){
				console.log('Opening url...');
				return opn(modUrl);
			}
			else{
				return Promise.resolve();
			}
		})
		.catch((error) => {
			console.log(error);
		})
		.then(() => callback());
});

// Builds specified mods and copies the bundles to the game workshop folder
// gulp build [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete .temp folder before building
// --id - forces item id. can only be passed if building one mod
gulp.task('build', (callback) => {

	let {modNames, verbose, leaveTemp, modId} = getBuildParams(process.argv);

	console.log('Mods to build:');
	modNames.forEach(modName => console.log('- ' + modName));
	console.log();

	getStingrayExe().then(stingrayExe => {

		let promise = Promise.resolve();	
		modNames.forEach(modName => {
			if(modName){
		    	promise = promise.then(() => buildMod(stingrayExe, modName, !leaveTemp, verbose, modId));
			}
		});
		return promise;
	})
	.then(() => callback());
});

// Watches for changes in specified mods and builds them whenever they occur
// gulp watch [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
gulp.task('watch', (callback) => {
	let {modNames, verbose, leaveTemp, modId} = getBuildParams(process.argv);
	getStingrayExe().then(stingrayExe => {
		modNames.forEach((modName) => {
			console.log('Watching ', modName, '...');
			gulp.watch([
				modName, 
				'!' + modName + '/*.tmp', 
				'!' + modName + distDir + '/*'
			], buildMod.bind(null, stingrayExe, modName, !leaveTemp, verbose, modId));
		});
		return callback();
	});
});

//////////////

function copyTemplate(config) {
	let modName = config.name;
	return new Promise((resolve, reject) => {
		gulp.src(modSrc, {base: temp})
			.pipe(replace(temp, modName))
			.pipe(replace(tempTitle, config.title))
			.pipe(replace(tempDescription, config.description))
			.pipe(rename((p) => {
				p.basename = p.basename.replace(temp, modName);
			}))
			.pipe(gulp.dest(modName))
			.on('error', reject)
			.on('end', () => {
				renameDirs.forEach((dir) => {				
					fs.renameSync(join(modName, dir, temp), join(modName, dir, modName));
				});
				gulp.src(coreSrc, {base: temp})
					.pipe(gulp.dest(modName))
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
	return writeFile(join(config.name, cfgFile), configText);
}

function uploadMod(modName, changenote, skip) {
	return new Promise((resolve, reject) => {
		let configPath = modName + '\\' + cfgFile;
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
		uploader.stdout.on('data', (data) => {
			console.log(rmn(data));
			data = String(data);
			if (data.includes('publisher_id')){
				modId = data.match(/publisher_id: (\d*)/)[1];
			}
		});

		uploader.on('error', (error) => reject(error));

		uploader.on('close', (code) => {
			if(code) {
				reject(code);
			}
			else {
				resolve(modId);
			}
		});
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
        fs.access(dir, function (err) {
            if (err) {
                return reject(err);
            }
            fs.readdir(dir, function (err, files) {
                if (err) {
                    return reject(err);
                }
                Promise.all(files.map(function (file) {
                    return deleteFile(dir, file);
                })).then(function () {
                    fs.rmdir(dir, function (err) {
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


//////////////

// Builds modName, optionally deleting its .temp folder, and copies it to the dist and workshop dirs
function buildMod(stingrayExe, modName, removeTemp = true, verbose, modId) {
	console.log('Building ', modName);

	let tempDir = join('.temp', modName);
	let dataDir = join(tempDir, 'compile');
	let buildDir = join(tempDir, 'bundle');

	return checkTempFolder(modName, removeTemp)
		.then(() => readFile(join(modName, cfgFile), 'utf8'))
		.then(() => runStingray(stingrayExe, modName, dataDir, buildDir, verbose))
		.then((code) => readProcessedBundles(modName, dataDir, code))
		.then(() => getModDir(modName, modId))
		.then(modDir => moveMod(modName, buildDir, modDir))
		.then(success => {
			console.log(success);
			return Promise.resolve();
		})
		.catch(error => {
			console.error(error + '\n');
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

		spawn.stdout.on('data', (data) => {
			result += String(data);
		});

		spawn.on('error', (err) => {
			reject(err);
		});

		spawn.on('close', (code) => {
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

function getStingrayExe(){
	return new Promise((resolve, reject) => {
		let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 718610"';
		let value = '"InstallLocation"';

		let stingrayExe = fallbackStingrayExe;
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

function getWorkshopDir() {
	return new Promise((resolve, reject) => {
		let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 235540"';
		let value = '"InstallLocation"';

		let workshopDir = fallbackWorkshopDir;
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
						workshopDir = fallbackWorkshopDir;
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

function getBuildParams(pargv) {
	let argv = minimist(pargv);
	let verbose = argv.verbose || false;
	let leaveTemp = argv.t || argv.temp || false;
	let modNames = argv.m || argv.mod || argv.mods || '';
	if(!modNames || typeof modNames != 'string') {
		modNames = getFolders('./', ignoredDirs);
	}
	else{
		modNames = modNames.split(/;+\s*/);
	}
	let modId = modNames.length == 1 ? argv.id : null;
	return {modNames, verbose, leaveTemp, modId};
}

// Returns an array of folders in dir, except the ones in second param
function getFolders(dir, except) {
	return fs.readdirSync(dir)
		.filter(function(fileName) {
			return fs.statSync(join(dir, fileName)).isDirectory() && (!except || !except.includes(fileName));
		});
}

function checkTempFolder(modName, shouldRemove) {
	return new Promise((resolve, reject) => {
		let tempPath = join('.temp', modName);
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
				console.log('Overwriting .temp folder');
			}
			return resolve();
		}
	});
}

function runStingray(stingrayExe, modName, dataDir, buildDir, verbose) {
	return new Promise((resolve, reject) => {


		let stingrayParams = [
			`--compile-for win32`,
			`--source-dir "${modName}"`,
			`--data-dir "${dataDir}"`,
			`--bundle-dir "${buildDir}"`
		];

		let stingray = child_process.spawn(
			stingrayExe, 
			stingrayParams, 
			{windowsVerbatimArguments: true} // fucking WHY???
		);

		stingray.stdout.on('data', (data) => {
			if(verbose){
			    console.log(rmn(data));
			}
		});

		stingray.on('error', (error) => reject(error));

		stingray.on('close', (code) => {
			console.log('Finished building');
			resolve(code);
		});
	});
}

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
			console.log('Failed to build %s/%s.%s', modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
		}
	});
}

function getModDir(modName, modId) {
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

function getModId(modName) {
	return readFile(join(modName, cfgFile), 'utf8')
		.then((data) => {
			let modId = data.match(/^published_id *=? *(\d*)\D*$/m);
			modId = modId && modId[1];
			if(modId) {
				return Promise.resolve(modId);
			}
			else {
				return Promise.reject(
					'Item ID not found in item.cfg file.\n' +
					'You need to upload your mod to workshop before you can build it.\n' +
					'Alternatively you can specify the workshop item id with --id param.'
				);
			}
		});
}

// Copies the mod to the modsDir
function moveMod(modName, buildDir, modDir) {
	return new Promise((resolve, reject) => {
		console.log('Copying to ', modDir);
		let modDistDir = join(modName, distDir);
		gulp.src([
				buildDir + '/*([0-f])', 
				'!' + buildDir + '/dlc'
			], {base: buildDir})
			.pipe(rename((p) => {
				p.basename = modName;
				p.extname = '';
			}))
			.on('error', reject)
			.pipe(gulp.dest(modDistDir))
			.on('error', reject)
			.pipe(gulp.dest(modDir))
			.on('error', reject)
			.on('end', () => {
				resolve('Successfully built ' + modName + '\n');
			});
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
