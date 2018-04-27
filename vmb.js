'use strict';

const fs = require('fs'),
      path = require('path'),
      gulp = require('gulp'),
      minimist = require('minimist'),
      replace = require('gulp-replace'),
      rename = require('gulp-rename'),
      child_process = require('child_process'),
      util = require('util'),
	  opn = require('opn'),
	  setupCleanup = require('node-cleanup'),
	  normalizePath = require('normalize-path');

const readFile = util.promisify(fs.readFile),
      writeFile = util.promisify(fs.writeFile);


/* SETUP */

let exitCode = 0;
let taskFinished = false;
setupCleanup(checkTaskFinished);

// Commandline arguments
const argv = minimist(process.argv);

// Tasks
let tasks = {};
addTask('default', taskDefault);
addTask('config', taskConfig);
addTask('create', taskCreate);
addTask('publish', taskPublish);
addTask('upload', taskUpload);
addTask('open', taskOpen);
addTask('build', taskBuild);
addTask('watch', taskWatch);

const {currentTask, plainArg} = getCurrentTask(argv._);


/* CONFIG */

const defaultTempDir = '.temp';
const scriptConfigFile = 'config.json';
const scriptConfig = readScriptConfig(argv.reset);

// Early execution and exit for certain tasks
if(currentTask == taskDefault || currentTask == taskConfig) {
	runTask(currentTask, argv, plainArg);
	process.exit(exitCode);
}

// Mods directory and game number
let modsDir = scriptConfig.mods_dir;
modsDir = (typeof modsDir == 'string' && modsDir !== '') ? normalize(modsDir) : 'mods';

let tempDir = scriptConfig.temp_dir;
tempDir = (typeof tempDir == 'string' && tempDir !== '') ? normalize(tempDir) : '';

let gameNumber = scriptConfig.game;

const unspecifiedTempDir = !tempDir;

if(unspecifiedTempDir) {
	tempDir = join(modsDir, defaultTempDir);
}

// Set temporary config options
setGameNumber(argv);
setModsDir(argv);

// Other config params
const fallbackToolsDir = normalize(getGameSpecificKey('fallback_tools_dir') || '');
const fallbackWorkshopDir = join(getGameSpecificKey('fallback_workshop_dir') || '', getGameId());
const ignoredDirs = scriptConfig.ignored_dirs || [];


/* FOR CREATING */

// These will be replaced in the template mod when running tasks
const temp = '%%template';
const tempTitle = '%%title';
const tempDescription = '%%description';

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

// Paths to mod tools relative to the mod tools folder
const uploaderDir = 'ugc_uploader/';
const uploaderExe = 'ugc_tool.exe';
const uploaderGameConfig = 'steam_appid.txt';
const stingrayDir = 'bin/';
const stingrayExe = 'stingray_win64_dev_x64.exe';

// Config file for workshop uploader tool
const cfgFile = 'itemV' + gameNumber + '.cfg';


/* EXECUTION */

runTask(currentTask, argv, plainArg);



///////////////////////////////////
/// TASK AND METHOD DEFINITIONS ///
///////////////////////////////////

function normalize(pth) {
	return normalizePath(path.normalize(pth));
}

// Normalizes path after joining
function join(...args) {
	return normalize(path.join(...args));
}

// Creates, reads or deletes
function readScriptConfig(shouldReset) {

	if(shouldReset && fs.existsSync(scriptConfigFile)){
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


/* TASKS */

// Adds a task to the tasks object
function addTask(name, action){
	tasks[name] = action;
}

// Returns first task specified in commandline arguments
function getCurrentTask(args) {
	let plainArg;
	for(var i = 0; i < args.length; i++){
		let task = tasks[args[i]];
		if(task){
			plainArg = args[i + 1];
			return {currentTask: task, plainArg};
		}
	}
	return {currentTask: tasks['default'], plainArg};
}

// Runs specified task
function runTask(task, args, plainArg) {
	task(callback, args, plainArg);
}

// This will be called at the end of tasks
function callback(shouldExit = true){
	taskFinished = true;
	if (shouldExit) {
		process.exit(exitCode);
	}
}

// Checks if the callback function has been called from a task and exits if it hasn't
function checkTaskFinished(code) {
	if(!taskFinished) {
		console.error(`\nProgram exited prematurely`);
		process.exit(2);
	}
}

// All of these have the optional -f param that sets mods directory and -g for setting game number

// Prints all existing commands with params
// vmb
function taskDefault(callback, args, plainArg) {
	console.log(
		'vmb <command> [-f <folder>] [-g <game_number>] [--reset]\n' +
		'vmb config    [--<key1>=<value1> --<key2>=<value2>...]\n' +
		'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]\n' +
		'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [-e] [--verbose] [--temp]\n' +
		'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
		'vmb open      {<mod_name> | --id <item_id>}\n' +
		'vmb build     ["<mod1>; <mod2>; <mod3>;..."] [-e] [--verbose] [-t] [--id <item_id>] [--dist]\n' +
		'vmb watch     ["<mod1>; <mod2>; <mod3>;..."] [-e] [--verbose] [-t] [--id <item_id>] [--dist]'
	);
	callback();
}

// Sets and/or displayes config file values
// Limited to non-object values
// vmb config [--<key1>=<value1> --<key2>=<value2>...]
function taskConfig(callback, args, plainArg) {
	Object.keys(scriptConfig).forEach((key) => {
		if(args[key] !== undefined){
			if(typeof scriptConfig[key] == 'object'){
				console.error(`Cannot set key "${key}" because it is an object. Modify ${scriptConfigFile} directly.`);
				return;
			}
			console.log(`Set ${key} to ${args[key]}`);
			scriptConfig[key] = args[key];
		}
	});

	fs.writeFileSync(scriptConfigFile, JSON.stringify(scriptConfig, null, '\t'));

	console.log(scriptConfig);

	callback();
}

// Creates a copy of the template mod and renames it to the provided name
// Uploads an empty mod file to the workshop to create an id
// vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
function taskCreate(callback, args, plainArg) {

	let config = getWorkshopConfig(args, plainArg);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or already exists`);
		exitCode = 1;
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
			console.error(error);
			exitCode = 1;
			return deleteDirectory(join(modsDir, modName));
		})
		.catch(error => {
			console.error(error);
			exitCode = 1;
		})
		.then(() => callback());
}

// Builds the mod then uploads it to workshop as a new item
// vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
function taskPublish(callback, args, plainArg) {

	let config = getWorkshopConfig(args, plainArg);
	let modName = config.name;
	let modDir = join(modsDir, modName);
	let buildParams = getBuildParams(args);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or doesn't exist`);
		exitCode = 1;
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
		.then(() => buildMod(
			toolsDir,
			modName,
			buildParams.shouldRemoveTemp,
			true,
			config.verbose,
			buildParams.ignoreBuildErrors,
			null
		))
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
			console.error(error);
			exitCode = 1;
		})
		.then(() => callback());
}

// Uploads the last built version of the mod to the workshop
// vmb upload <mod_name> [-n <changenote>] [--open] [--skip]
function taskUpload(callback, args, plainArg) {

	let modName = args.m || args.mod || plainArg || '';
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder ${modDir} is invalid or doesn't exist`);
		exitCode = 1;
		return callback();
	}

	let changenote = args.n || args.note || args.changenote || '';
	if(typeof changenote != 'string') {
		changenote = '';
	}

	let openUrl = args.o || args.open || false;

	let skip = args.s || args.skip;

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
			console.error(error);
			exitCode = 1;
		})
		.then(() => callback());
}

// Opens mod's workshop page
// vmb open <mod_name> [--id <item_id>]
function taskOpen(callback, args, plainArg) {

	let modName = args.m || args.mod || plainArg || '';
	let modDir = join(modsDir, modName);
	let modId = args.id || null;

	if(!modId && (!validModName(modName) || !fs.existsSync(modDir + '/'))) {
		console.error(`Folder ${modDir} doesn't exist`);
		exitCode = 1;
		return callback();
	}

	(modId ? Promise.resolve(modId) : getModId(modName))
		.then(modId => {
			let url = formUrl(modId);
			console.log('Opening', url);
			return opn(url);
		})
		.catch(error => {
			console.error(error);
			exitCode = 1;
		})
		.then(() => callback());
}

// Builds specified mods and copies the bundles to the game workshop folder
// vmb build ["<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete temp folder before building
// --id - forces item id. can only be passed if building one mod
// --dist - doesn't copy to workshop folder
function taskBuild (callback, args, plainArg) {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = getBuildParams(args, plainArg);

	console.log('Mods to build:');
	modNames.forEach(modName => console.log('  ' + modName));

	getModToolsDir().then(toolsDir => {

		let promise = Promise.resolve();
		forEachMod(
			modNames,
			noWorkshopCopy,
			modName => {
				promise = promise.then(() => {
					return buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId).catch(error => {
						console.error(error);
						exitCode = 1;
					});
				});
			},
			() => {
				console.log();
			}
		);
		return promise;
	}).catch(error => {
		console.error(error);
		exitCode = 1;
	})
	.then(() => callback());
}

// Watches for changes in specified mods and builds them whenever they occur
// vmb watch ["<mod1>; <mod2>; <mod3>;..."] [--verbose] [-t] [--id <item_id>] [--dist]
function taskWatch (callback, args, plainArg) {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = getBuildParams(args, plainArg);

	getModToolsDir().then(toolsDir => {
		console.log();

		forEachMod(
			modNames,
			noWorkshopCopy,
			(modName, modDir) => {
				console.log(`Watching ${modName}...`);

				let src = [
					modDir,
					'!' + modsDir + '/' + modName + '/*.tmp',
					'!' + modsDir + '/' + modName + '/' + distDir + '/*'
				];

				gulp.watch(src, () => {
					return buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId).catch(error => {
		    			console.error(error);
		    		});
				});
			}
		);
		return callback(false);
	}).catch(error => {
		console.error(error);
		callback();
	});
}


/* CONFIG METHODS */

function getGameSpecificKey(key){
	let id = scriptConfig[key + gameNumber];
	if(typeof id != 'string'){
		console.error(`Failed to find '${key + gameNumber}' in ${scriptConfigFile}.`);
		process.exit();
	}
	return id;
}

function getGameId(){
	return getGameSpecificKey('game_id');
}

function getToolsId(){
	return getGameSpecificKey('tools_id');
}

function setModsDir(args) {

	let newModsDir = args.f || args.folder;

	if(!newModsDir) {
		console.log(`Using mods folder '${modsDir}'`);
		console.log(`Using temp folder '${tempDir}'`);
		return;
	}

	if(typeof newModsDir == 'string') {
		console.log(`Using mods folder '${newModsDir}'`);
		modsDir = normalize(newModsDir);
		if(unspecifiedTempDir) {
			tempDir = join(modsDir, defaultTempDir);
		}
	}
	else {
		console.warn(`Couldn't set mods folder '${newModsDir}', using default '${modsDir}'`);
	}
	console.log(`Using temp folder '${tempDir}'`);
}

function setGameNumber(args) {
	let newGameNumber = args.g || args.game;

	if(newGameNumber !== undefined){
		gameNumber = newGameNumber;
	}

	gameNumber = Number(gameNumber);

	if(gameNumber !== 1 && gameNumber !== 2){
		console.error(`Vermintide ${gameNumber} hasn't been released yet. Check your ${scriptConfigFile}.`);
		process.exit();
	}

	console.log('Game: Vermintide ' + gameNumber);
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

		let toolsDir = fallbackToolsDir;
		let errorMsg = 'Vermintide mod SDK directory not found, using fallback.';
		getRegistryValue(sdkKey, value)
			.catch(err => {
				console.error(errorMsg);
			})
			.then(appPath => {
				if(appPath) {
					toolsDir = appPath;
				}
				else {
					console.error(errorMsg);
				}
				toolsDir = normalize(toolsDir);
				console.log('Modding tools dir:', toolsDir);
				resolve(toolsDir);
			});
	});
}


/* CREATE AND UPLOAD METHODS */

// Returns <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
function getWorkshopConfig(args, plainArg) {

	let modName = args.m || args.mod || plainArg || '';
	let modTitle = args.t || args.title || modName;

	return {
		name: modName,
		title: modTitle,
		description: args.d || args.desc || args.description || modTitle + ' description',
		language: args.l || args.language || 'english',
		visibility: args.v || args.visibility || 'private',
		verbose: args.verbose
	};
}

// Copies and renames mod template from %%template folder
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

// Creates item.cfg file
function createCfgFile(config) {
	let configText = `title = "${config.title}";\n` +
					`description = "${config.description}";\n` +
					`preview = "item_preview.jpg";\n` +
					`content = "dist";\n` +
					`language = "${config.language}";\n` +
					`visibility = "${config.visibility}";\n`;
	console.log(`${cfgFile}:`);
	console.log('  ' + rmn(configText).replace(/\n/g, '\n  '));
	return writeFile(join(modsDir, config.name, cfgFile), configText);
}

// Uploads mod to the workshop
function uploadMod(toolsDir, modName, changenote, skip) {
	return new Promise((resolve, reject) => {
		let configPath = modsDir + '\\' + modName + '\\' + cfgFile;
		if(!path.isAbsolute(modsDir)){
			configPath = join(process.cwd(), configPath);
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

		console.log(`\nRunning uploader with steam app id ${getGameId()}`);
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
				reject('Uploader exited with error code: ' + code);
			}
			else {
				resolve(modId);
			}
		});
	});
}

// Returns steam workshop url for mod
function formUrl(modId) {
	return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
}

// Checks if the mod has published_id in its item.cfg
function checkIfPublished(modName) {
	let modCfg = join(modsDir, modName, cfgFile);
	if(!fs.existsSync(modCfg)){
		return Promise.resolve(false);
	}
	return readFile(modCfg, 'utf8').then(data => {
		if(data.match(/^published_id *=? *(\d*)\D*$/m)) {
			return Promise.reject(`Mod has already been published for Vermintide ${gameNumber}, use gulp upload instead.`);
		}
		else {
			return Promise.resolve(true);
		}
	});
}


/* BUILD METHODS */

function forEachMod(modNames, noWorkshopCopy, action, noAction) {
	modNames.forEach(modName => {

		if(!modName) {
			return;
		}
		let modDir = join(modsDir, modName);

		if(validModName(modName) && fs.existsSync(modDir + '/') && (fs.existsSync(join(modDir, cfgFile)) || noWorkshopCopy)) {
			action(modName, modDir);
		}
		else {
			if(typeof noAction == 'function'){
				noAction();
			}
			console.error(`Folder ${modDir} doesn\'t exist, invalid or doesn\'t have ${cfgFile} in it.`);
			exitCode = 1;
		}
	});
}

// Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
function buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId) {
	console.log('\nBuilding ', modName);

	let modDir = join(modsDir, modName);

	let modTempDir = join(tempDir, modName);
	let dataDir = join(modTempDir, 'compile');
	let buildDir = join(modTempDir, 'bundle');

	return checkTempFolder(modName, shouldRemoveTemp)
		.then(() => {
			return modId || noWorkshopCopy ? Promise.resolve() : readFile(join(modDir, cfgFile), 'utf8');
		})
		.then(() => runStingray(toolsDir, modDir, dataDir, buildDir, verbose))
		.then(code => processStingrayOutput(modName, dataDir, code, ignoreBuildErrors))
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

		let workshopDir = fallbackWorkshopDir;
		let errorMsg = 'Vermintide workshop directory not found, using fallback.';
		getRegistryValue(appKey, value)
			.catch(err => {
				console.error(errorMsg);
			})
			.then(appPath => {
				if(appPath && typeof appPath == 'string') {

					appPath = normalize(appPath);
					let parts = appPath.split('/');
					let neededPart = parts[parts.length - 2];

					if(!neededPart){
						console.error(errorMsg);
						workshopDir = fallbackWorkshopDir;
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

// Returns ["<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
function getBuildParams(args, plainArg) {

	let verbose = args.verbose || false;
	let shouldRemoveTemp = args.t || args.temp || false;
	let modNames = args.m || args.mod || args.mods || plainArg || '';

	if(!modNames || typeof modNames != 'string') {
		modNames = getFolders(modsDir, ignoredDirs);
	}
	else{
		modNames = modNames.split(/;+\s*/);
	}
	let modId = modNames.length == 1 ? args.id : null;
	let noWorkshopCopy = args.dist || false;
	let ignoreBuildErrors = args.e || args['ignore-errors'] || args['ignore-build-errors'] || scriptConfig.ignore_build_errors;
	return {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors};
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
			modDir = join(process.cwd(), modDir);
		}
		if(!path.isAbsolute(dataDir)){
			dataDir = join(process.cwd(), dataDir);
		}
		if(!path.isAbsolute(buildDir)){
			buildDir = join(process.cwd(), buildDir);
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
function processStingrayOutput(modName, dataDir, code, ignoreBuildErrors) {

	if(code){
		console.error('Stingray exited with error code: ' + code + '. Please check your scripts for syntax errors.');
	}

	return readFile(join(dataDir, 'processed_bundles.csv'), 'utf8')
		.catch(error => {
			console.error(error + '\nFailed to read processed_bundles.csv');
		})
		.then(data => {
			return new Promise((resolve, reject) => {

				if(data) {
					outputFailedBundles(data, modName);
				}

				if(ignoreBuildErrors) {
					console.log('Ignoring build errors');
				}

				return !code && data || ignoreBuildErrors ? resolve() : reject('Failed to build ' + modName);
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
		/* jshint ignore:start */
		if(bundle[3] == 0) {
			console.log('Failed to build %s/%s/%s.%s', modsDir, modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
		}
		/* jshint ignore:end */
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
			resolve('Successfully built ' + modName);
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

// Safely deletes file or directory
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

// Recursively and safely deletes directory
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

// A super convoluted way to copy filePath/fileName to dest/destBase.destExt if it doesn't exist
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
