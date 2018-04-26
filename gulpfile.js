'use strict';

const fs = require('fs'),
      path = require('path'),
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

function join(...args){
	return path.normalize(path.join(...args));
}

const defaultTempDir = '.temp';

const argv = minimist(process.argv);
const scriptConfigFile = 'config.json';

function readScriptConfig() {

	if(argv.reset && fs.existsSync(scriptConfigFile)){
		console.log(`Deleting ${scriptConfigFile}`);
		fs.unlinkSync(scriptConfigFile);
	}

	if(!fs.existsSync(scriptConfigFile)) {

		console.log(`Creating default ${scriptConfigFile}`);

		fs.writeFileSync(scriptConfigFile, 
			JSON.stringify({
				mods_dir: 'mods',
				temp_dir: '',

				game: 1,

				game_id1: '235540',
				game_id2: '552500',

				tools_id1: '718610',
				tools_id2: '718610',

				fallback_tools_dir1: 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide Mod Tools/',
				fallback_tools_dir2: 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide Mod Tools/',

				fallback_workshop_dir1: 'E:/SteamLibrary/SteamApps/workshop/content/',
				fallback_workshop_dir2: 'E:/SteamLibrary/SteamApps/workshop/content/',

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
let gameNumber = scriptConfig.game;

const UNSPECIFIED_TEMP_DIR = !tempDir;

if(UNSPECIFIED_TEMP_DIR) {
	tempDir = join(modsDir, defaultTempDir);
}

setGameNumber(argv);
setModsDir(argv);

const FALLBACK_TOOLS_DIR = getGameSpecificKey('fallback_tools_dir'),
      FALLBACK_WORKSHOP_DIR = join(getGameSpecificKey('fallback_workshop_dir'), getGameId()),
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
let uploaderDir = 'ugc_uploader/';
let uploaderExe = 'ugc_tool.exe';
let uploaderGameConfig = 'steam_appid.txt';
let stingrayDir = 'bin/';
let stingrayExe = 'stingray_win64_dev_x64.exe';

// Config file for workshop uploader tool
const cfgFile = 'itemV' + gameNumber + '.cfg';


/* TASKS */

// All of these have the optional -f param that sets mods directory and -g for setting game number

// Prints all existing commands with params
// gulp
gulp.task('default', callback => {
	console.log(
		'    gulp <command> [-f <folder>] [-g <game_number>] [--reset]\n' +
		'    gulp config    [--<key1>=<value1> --<key2>=<value2>...]\n' +
		'    gulp create    -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]\n' +
		'    gulp publish   -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]\n' +
		'    gulp upload    -m <mod_name> [-n <changenote>] [--open] [--skip]\n' +
		'    gulp open      {-m <mod_name> | --id <item_id>}\n' +
		'    gulp build     [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]\n' +
		'    gulp watch     [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]'
	);
	callback();
});

// Sets and/or displayes config file values
// Limited to non-object values
// gulp config [--<key1>=<value1> --<key2>=<value2>...]
gulp.task('config', callback => {

	Object.keys(scriptConfig).forEach((key) => {
		if(argv[key] !== undefined){
			if(typeof scriptConfig[key] == 'object'){
				console.error(`Cannot set key "${key}" because it is an object. Modify ${scriptConfigFile} directly.`);
				return;
			}
			console.log(`Set ${key} to ${argv[key]}`);
			scriptConfig[key] = argv[key];
		}
	});

	fs.writeFileSync(scriptConfigFile, JSON.stringify(scriptConfig, null, '\t'));

	console.log(scriptConfig);

	callback();
});

// Creates a copy of the template mod and renames it to the provided name
// Uploads an empty mod file to the workshop to create an id
// gulp create -m <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
gulp.task('create', callback => {

	let config = getWorkshopConfig(argv);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or already exists`);
		return callback();
	}

	console.log('Copying template');

	copyTemplate(config)
		.then(() => createCfgFile(config))
		.then(() => getModToolsDir())
		.then(toolsDir => uploadMod(toolsDir, modName))
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

	let config = getWorkshopConfig(argv);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or doesn't exist`);
		return callback();
	}
	
	let toolsDir = null;
	checkIfPublished(modName)
		.then(cfgExists => {
			if(cfgExists) {
				console.log(`Using existing ${cfgFile}`);
			}
			return cfgExists ? Promise.resolve() : createCfgFile(config);
		})
		.then(() => getModToolsDir())
		.then((dir) => {
			toolsDir = dir;
		})
		.then(() => buildMod(toolsDir, modName, false, true, config.verbose, null))
		.then(() => copyIfDoesntExist(temp, 'item_preview.jpg', temp, modDir, 'item_preview', '.jpg'))
		.then(() => uploadMod(toolsDir, modName))
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

	let modName = argv.m || argv.mod || '';
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or doesn't exist`);
		return callback();
	}

	let changenote = argv.n || argv.note || argv.changenote || '';
	if(typeof changenote != 'string') {
		changenote = '';
	}

	let openUrl = argv.o || argv.open || false;

	let skip = argv.s || argv.skip;

	getModToolsDir()
		.then(toolsDir => uploadMod(toolsDir, modName, changenote, skip))
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

	let modName = argv.m || argv.mod || '';
	let modDir = join(modsDir, modName);
	let modId = argv.id || null;

	if(!modId && (!validModName(modName) || !fs.existsSync(modDir + '/'))) {
		console.error(`Folder ${modDir} doesn't exist`);
		return callback();
	}

	(modId ? Promise.resolve(modId) : getModId(modName))
		.then(modId => opn(formUrl(modId)))
		.catch(error => {
			console.log(error);
		})
		.then(() => callback());
});

// Builds specified mods and copies the bundles to the game workshop folder
// gulp build [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete temp folder before building
// --id - forces item id. can only be passed if building one mod
// --dist - doesn't copy to workshop folder
gulp.task('build', callback => {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy} = getBuildParams(argv);

	console.log('Mods to build:');
	modNames.forEach(modName => console.log('- ' + modName));
	console.log();

	getModToolsDir().then(toolsDir => {

		let promise = Promise.resolve();	
		forEachMod(modNames, noWorkshopCopy, modName => {
			promise = promise.then(() => {
				return buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, modId).catch(error => {
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
// gulp watch [-m "<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]
gulp.task('watch', callback => {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy} = getBuildParams(argv);

	getModToolsDir().then(toolsDir => {
		forEachMod(modNames, noWorkshopCopy, (modName, modDir) => {
			console.log('Watching ', modName, '...');

			let src = [
				modDir, 
				'!' + modsDir + '/' + modName + '/*.tmp', 
				'!' + modsDir + '/' + modName + '/' + distDir + '/*'
			];
			
			gulp.watch(src, () => {
				return buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, modId).catch(error => {
	    			console.log(error);
	    		});
			});
		});
		return callback();
	}).catch(error => {
		console.log(error);
	});
});


/* CONFIG METHODS */

function getGameSpecificKey(key){
	let id = scriptConfig[key + gameNumber];
	if(typeof id != 'string'){
		console.error(`Failed to find '${key + gameNumber}' in ${scriptConfigFile}.`);
		process.exit(1);
	}
	return id;
}

function getGameId(){
	return getGameSpecificKey('game_id');
}

function getToolsId(){
	return getGameSpecificKey('tools_id');
}

function setModsDir(argv) {

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

function setGameNumber(argv) {
	let newGameNumber = argv.g || argv.game;

	if(newGameNumber !== undefined){
		gameNumber = newGameNumber;
	}

	if(gameNumber !== 1 && gameNumber !== 2){
		console.error(`Vermintide ${gameNumber} hasn't been released yet. Check your ${scriptConfigFile}.`);
		process.exit(1);
	}

	console.log('Game is Vermintide ' + gameNumber);
}

/* SHARED METHODS */

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
					`Item ID not found in ${cfgFile} file.\n` +
					`You need to publish your mod to workshop before you can build/view it.\n` +
					`Alternatively you can specify the workshop item id with --id param.`
				);
			}
		});
}

// Gets mod tools placement from Vermintide Mod Tools install location
function getModToolsDir(){
	return new Promise((resolve, reject) => {
		let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + getToolsId() + '"';
		let value = '"InstallLocation"';

		let toolsDir = FALLBACK_TOOLS_DIR;
		let errorMsg = 'Vermintide mod SDK directory not found, using fallback.';
		getRegistryValue(sdkKey, value)
			.catch(err => {
				console.log(errorMsg);
			})
			.then(appPath => {
				if(appPath) {
					toolsDir = appPath;
				}
				else {
					console.log(errorMsg);
				}
				toolsDir = path.normalize(toolsDir);
				console.log('Modding tools dir:', toolsDir);
				console.log();
				resolve(toolsDir);
			});
	});
}


/* CREATE AND UPLOAD METHODS */

function getWorkshopConfig(argv) {

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
	console.log(`${cfgFile}:`);
	console.log(configText);
	return writeFile(join(modsDir, config.name, cfgFile), configText);
}

// Uploads mod to the workshop
function uploadMod(toolsDir, modName, changenote, skip) {
	return new Promise((resolve, reject) => {
		let configPath = modsDir + '\\' + modName + '\\' + cfgFile;
		if(!path.isAbsolute(modsDir)){
			configPath = join(__dirname, configPath);
		}
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

		fs.writeFileSync(join(toolsDir, uploaderDir, uploaderGameConfig), getGameId());
		let uploader = child_process.spawn(
			uploaderExe, 
			uploaderParams, 
			{
				cwd: join(toolsDir, uploaderDir),
				windowsVerbatimArguments: true
			}
		);

		let modId = '';
		uploader.stdout.on('data', data => {
			console.log(rmn(data));
			data = String(data);
			if (data.includes('publisher_id')){
				try {
					modId = data.match(/publisher_id: (\d*)/)[1];
				}
				catch(err) {}
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
			console.error(`Folder ${modDir} doesn\'t exist, invalid or doesn\'t have ${cfgFile} in it.`);
		}
	});
}

// Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
function buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, modId) {
	console.log('Building ', modName);

	let modDir = join(modsDir, modName);

	let modTempDir = join(tempDir, modName);
	let dataDir = join(modTempDir, 'compile');
	let buildDir = join(modTempDir, 'bundle');

	return checkTempFolder(modName, shouldRemoveTemp)
		.then(() => {
			return modId || noWorkshopCopy ? Promise.resolve() : readFile(join(modDir, cfgFile), 'utf8');
		})
		.then(() => runStingray(toolsDir, modDir, dataDir, buildDir, verbose))
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

// Gets the steam workshop folder from vermintide's install location
function getWorkshopDir() {
	return new Promise((resolve, reject) => {
		let gameId = getGameId();
		let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + gameId + '"';
		let value = '"InstallLocation"';

		let workshopDir = FALLBACK_WORKSHOP_DIR;
		let errorMsg = 'Vermintide workshop directory not found, using fallback.';
		getRegistryValue(appKey, value)
			.catch(err => {
				console.error(errorMsg);
			})
			.then(appPath => {
				if(appPath && typeof appPath == 'string') {

					appPath = path.normalize(appPath);
					let parts = appPath.split(path.sep);
					let neededPart = parts[parts.length - 2];
					
					if(!neededPart){
						console.error(errorMsg);
						workshopDir = FALLBACK_WORKSHOP_DIR;
					}
					else{
						workshopDir = appPath.substring(0, appPath.lastIndexOf(neededPart));
						workshopDir = join(workshopDir, 'workshop/content', gameId);
					}
				}
				else {
					console.error(errorMsg);
				}
				console.log('Workshop folder:', workshopDir);
				resolve(workshopDir);
			});
	});
}

// Returns [-m "<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
function getBuildParams(argv) {
	let verbose = argv.verbose || false;
	let shouldRemoveTemp = argv.t || argv.temp || false;
	let modNames = argv.m || argv.mod || argv.mods || '';
	if(!modNames || typeof modNames != 'string') {
		modNames = getFolders(modsDir, IGNORED_DIRS);
	}
	else{
		modNames = modNames.split(/;+\s*/);
	}
	let modId = modNames.length == 1 ? argv.id : null;
	let noWorkshopCopy = argv.dist || false;
	return {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy};
}

// Checks if temp folder exists, optionally removes it
function checkTempFolder(modName, shouldRemove) {
	return new Promise((resolve, reject) => {
		let tempPath = join(tempDir, modName);
		let tempExists = fs.existsSync(tempPath);
		if(tempExists && shouldRemove) {
			child_process.exec('rmdir /s /q "' + tempPath + '"', error => {
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
function runStingray(toolsDir, modDir, dataDir, buildDir, verbose) {
	return new Promise((resolve, reject) => {

		if(!path.isAbsolute(modDir)){
			modDir = join(__dirname, modDir);
		}
		if(!path.isAbsolute(dataDir)){
			dataDir = join(__dirname, dataDir);
		}
		if(!path.isAbsolute(buildDir)){
			buildDir = join(__dirname, buildDir);
		}

		let stingrayParams = [
			`--compile-for win32`,
			`--source-dir "${modDir}"`,
			`--data-dir "${dataDir}"`,
			`--bundle-dir "${buildDir}"`
		];

		let stingray = child_process.spawn(
			stingrayExe, 
			stingrayParams, 
			{
				cwd: join(toolsDir, stingrayDir),
				windowsVerbatimArguments: true
			} 
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
		if(bundle.length < 4){
			console.log(`Incorrect processed_bundles.csv string`, bundle);
			return;
		}
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
		.filter(fileName => {
			return fs.statSync(join(dir, fileName)).isDirectory() && (!except || !except.includes(fileName));
		});
}

function deleteFile(dir, file) {
    return new Promise((resolve, reject) => {
        let filePath = join(dir, file);
        fs.lstat(filePath, (err, stats) => {
            if (err) {
                return reject(err);
            }
            if (stats.isDirectory()) {
                resolve(deleteDirectory(filePath));
            } else {
                fs.unlink(filePath, err => {
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
    return new Promise((resolve, reject) => {
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
