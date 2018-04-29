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

const {currentTask, plainArgs} = getCurrentTask(argv._);


/* CONFIG */

const defaultTempDir = '.temp';
const scriptConfigFile = '.vmbrc';
const scriptConfig = readScriptConfig(argv.reset);

// Early execution and exit for certain tasks
if (currentTask == taskDefault || currentTask == taskConfig) {
	runTask(currentTask, argv, plainArgs);
	process.exit(exitCode);
}

// Mods directory and game number
const { modsDir, tempDir } = getModsDir(scriptConfig.mods_dir, scriptConfig.temp_dir, argv);
const gameNumber = getGameNumber(scriptConfig.game, argv);

// Other config params
const fallbackToolsDir = normalize(getGameSpecificKey('fallback_tools_dir') || '');
const fallbackWorkshopDir = join(getGameSpecificKey('fallback_workshop_dir') || '', getGameId());
const ignoredDirs = scriptConfig.ignored_dirs || [];


/* FOR CREATING */

// These will be replaced in the template mod when running tasks
const templateDir = getTemplateDir(scriptConfig.template_dir || 'template', argv);
const templateName = '%%name';
const templateTitle = '%%title';
const templateDescription = '%%description';
const itemPreview = 'item_preview.jpg'

// Folder in which the built bundle is gonna be stored before being copied to workshop folder
const distDir = 'dist';

// Files in template
const { coreSrc, modSrc } = getTemplateSrc(scriptConfig.template_core_files, templateDir);


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

runTask(currentTask, argv, plainArgs);



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

				fallback_tools_dir1: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',
				fallback_tools_dir2: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',

				fallback_workshop_dir1: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',
				fallback_workshop_dir2: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',

				template_dir: "template-vmf",

				template_core_files: [
					'core/**'
				],

				ignored_dirs: [
					'.git',
					defaultTempDir
				],

				ignore_build_errors: false
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
	let plainArgs = [];
	for(var i = 0; i < args.length; i++){
		let task = tasks[args[i]];
		if(task){
			for (var k = i + 1; k < args.length; k++){
				plainArgs.push(args[k]);
			}
			return {currentTask: task, plainArgs};
		}
	}
	return {currentTask: tasks['default'], plainArgs};
}

// Runs specified task
function runTask(task, args, plainArgs) {
	task(callback, args, plainArgs);
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
function taskDefault(callback, args, plainArgs) {
	console.log(
		'vmb <command> [-f <folder>] [-g <game_number>] [--reset]\n' +
		'vmb config    [--<key1>=<value1> --<key2>=<value2>...]\n' +
		'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]\n' +
		'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--temp]\n' +
		'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
		'vmb open      {<mod_name> | --id <item_id>}\n' +
		'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]\n' +
		'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]'
	);
	callback();
}

// Sets and/or displayes config file values
// Limited to non-object values
// vmb config [--<key1>=<value1> --<key2>=<value2>...]
function taskConfig(callback, args, plainArgs) {
	for(let key of Object.keys(scriptConfig)){

		if(args[key] === undefined){
			continue;
		}

		if(typeof scriptConfig[key] == 'object'){
			console.error(`Cannot set key "${key}" because it is an object. Modify ${scriptConfigFile} directly.`);
			return;
		}

		console.log(`Set ${key} to ${args[key]}`);
		scriptConfig[key] = args[key];
	};

	fs.writeFileSync(scriptConfigFile, JSON.stringify(scriptConfig, null, '\t'));

	console.log(scriptConfig);

	callback();
}

// Creates a copy of the template mod and renames it to the provided name
// Uploads an empty mod file to the workshop to create an id
// vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
async function taskCreate(callback, args, plainArgs) {

	let config = getWorkshopParams(args, plainArgs);
	let modName = config.name;
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || fs.existsSync(modDir + '/')) {
		console.error(`Folder "${modDir}" is invalid or already exists`);
		exitCode = 1;
		return callback();
	}

	console.log(`Copying template from "${templateDir}"`);

	try {
		await copyTemplate(config);
		await createCfgFile(config);

		let modId = await uploadMod(await getModToolsDir(), modName);

		let modUrl = formUrl(modId);
		console.log('Now you need to subscribe to ' + modUrl + ' in order to be able to build and test your mod.');
		console.log('Opening url...');
		await opn(modUrl);
	}
	catch(error) {
		console.error(error);
		exitCode = 1;

		// Cleanup directory if it has been created
		let modDir = join(modsDir, modName);
		if (fs.existsSync(modDir)) {
			try {
				await deleteDirectory();
			}
			catch(error) {
				console.error(error);
			}
		}
	}

	callback();
}

// Builds the mod then uploads it to workshop as a new item
// vmb publish <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
async function taskPublish(callback, args, plainArgs) {

	let config = getWorkshopParams(args, plainArgs);
	let modName = config.name;
	let modDir = join(modsDir, modName);
	let buildParams = getBuildParams(args);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder "${modDir}" is invalid or doesn't exist`);
		exitCode = 1;
		return callback();
	}

	if (!templateIsValid(templateDir)) {
		console.error(`Template folder "${templateDir}" doesn't exist or doesn't have "${itemPreview}" in it.`);
		exitCode = 1;
		return callback();
	}

	try {
		let cfgExists = await checkIfCfgExists(modName);

		if (cfgExists) {
			console.log(`Using existing ${cfgFile}`);
		}
		else{
			await createCfgFile(config);
		}

		let toolsDir = await getModToolsDir();
		await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, true, config.verbose, buildParams.ignoreBuildErrors, null);
		await copyIfDoesntExist(join(templateDir, itemPreview), join(modDir, itemPreview));
		await uploadMod(toolsDir, modName);

		let modId = await getModId(modName);
		let modUrl = formUrl(modId);
		console.log('Uploaded to ' + modUrl);
		console.log('Opening url...');
		await opn(modUrl);
	}
	catch (error) {
		console.error(error);
		exitCode = 1;
	}
	callback();
}

// Uploads the last built version of the mod to the workshop
// vmb upload <mod_name> [-n <changenote>] [--open] [--skip]
async function taskUpload(callback, args, plainArgs) {

	let modName = args.m || args.mod || plainArgs[0] || '';
	let modDir = join(modsDir, modName);

	if(!validModName(modName) || !fs.existsSync(modDir + '/')) {
		console.error(`Folder "${modDir}" is invalid or doesn't exist`);
		exitCode = 1;
		return callback();
	}

	let changenote = args.n || args.note || args.changenote || '';
	if(typeof changenote != 'string') {
		changenote = '';
	}

	let openUrl = args.o || args.open || false;

	let skip = args.s || args.skip;

	try {
		await uploadMod(await getModToolsDir(), modName, changenote, skip);

		let modId = await getModId(modName);
		let modUrl = formUrl(modId);
		console.log('Uploaded to ' + modUrl);
		if(openUrl){
			console.log('Opening url...');
			await opn(modUrl);
		}
	}
	catch(error) {
		console.error(error);
		exitCode = 1;
	}

	callback();
}

// Opens mod's workshop page
// vmb open <mod_name> [--id <item_id>]
async function taskOpen(callback, args, plainArgs) {

	let modName = args.m || args.mod || plainArgs[0] || '';
	let modDir = join(modsDir, modName);
	let modId = args.id || null;

	if(!modId && (!validModName(modName) || !fs.existsSync(modDir + '/'))) {
		console.error(`Folder "${modDir}" doesn't exist`);
		exitCode = 1;
		return callback();
	}

	try {

		if(!modId) {
			modId = await getModId(modName);
		}

		let url = formUrl(modId);
		console.log('Opening', url);
		await opn(url);
	}
	catch(error) {
		console.error(error);
		exitCode = 1;
	}

	callback();
}

// Builds specified mods and copies the bundles to the game workshop folder
// vmb build [<mod1> <mod2>...] [--verbose] [-t] [--id <item_id>] [--dist]
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete temp folder before building
// --id - forces item id. can only be passed if building one mod
// --dist - doesn't copy to workshop folder
async function taskBuild (callback, args, plainArgs) {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = getBuildParams(args, plainArgs);

	console.log('Mods to build:');
	for(let modName of modNames) {
		console.log('  ' + modName);
	}

	let toolsDir = await getModToolsDir().catch((error) => {
		exitCode = 1;
		console.error(error);
	});

	if (toolsDir) {
		await forEachMod(
			modNames,
			noWorkshopCopy,
			async modName => {
				try{
					await buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId);
				}
				catch(error) {
					console.error(error);
					exitCode = 1;
				}
			},
			() => {
				console.log();
			}
		);
	}

	callback();
}

// Watches for changes in specified mods and builds them whenever they occur
// vmb watch [<mod1> <mod2>...] [--verbose] [-t] [--id <item_id>] [--dist]
async function taskWatch (callback, args, plainArgs) {

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = getBuildParams(args, plainArgs);

	let toolsDir = await getModToolsDir().catch((error) => {
		console.error(error);
		exitCode = 1;
	});

	if (toolsDir) {
		console.log();

		await forEachMod(
			modNames,
			noWorkshopCopy,
			(modName, modDir) => {
				console.log(`Watching ${modName}...`);

				let src = [
					modDir,
					'!' + modsDir + '/' + modName + '/*.tmp',
					'!' + modsDir + '/' + modName + '/' + distDir + '/*'
				];

				gulp.watch(src, async () => {
					try{
						await buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId);
					}
					catch(error) {
						console.error(error);
					};
				});
			}
		);
	}

	callback(false);
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

function getModsDir(modsDir, tempDir, args) {

	modsDir = (typeof modsDir == 'string' && modsDir !== '') ? normalize(modsDir) : 'mods';
	tempDir = (typeof tempDir == 'string' && tempDir !== '') ? normalize(tempDir) : '';

	let unspecifiedTempDir = !tempDir;
	if (unspecifiedTempDir) {
		tempDir = join(modsDir, defaultTempDir);
	}

	let newModsDir = args.f || args.folder;

	if(!newModsDir) {
		console.log(`Using mods folder "${modsDir}"`);
		console.log(`Using temp folder "${tempDir}"`);
	}
	else {
		if (typeof newModsDir == 'string') {
			console.log(`Using mods folder "${newModsDir}"`);
			modsDir = normalize(newModsDir);
			if (unspecifiedTempDir) {
				tempDir = join(modsDir, defaultTempDir);
			}
		}
		else {
			console.warn(`Couldn't set mods folder "${newModsDir}", using default "${modsDir}"`);
		}
		console.log(`Using temp folder "${tempDir}"`);
	}

	if (!fs.existsSync(modsDir + '/')) {
		console.error(`Mods folder "${modsDir}" doesn't exist`);
		process.exit();
	}

	return {modsDir, tempDir};
}

function getGameNumber(gameNumber, args) {
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

	return gameNumber;
}

function getTemplateDir(templateDir, args) {
	let newTemplateDir = args.template || '';

	if(newTemplateDir && typeof newTemplateDir == 'string'){
		return newTemplateDir;
	}

	return templateDir;
}

function getTemplateSrc(configCoreSrc, templateDir) {

	// Static files from config
	let coreSrc = [
		join(templateDir, itemPreview)
	];
	if (Array.isArray(configCoreSrc)) {
		for(let src of configCoreSrc) {
			coreSrc.push(join(templateDir, src));
		};
	}

	// Folders with mod specific files
	let modSrc = [
		templateDir + '/**'
	];

	// Exclude core files from being altered
	for(let src of coreSrc) {
		modSrc.push('!' + src);
	};

	return {coreSrc, modSrc}
}


/* SHARED METHODS */

function validModName(modName) {
	return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
}

async function getModId(modName) {
	let data = await readFile(join(modsDir, modName, cfgFile), 'utf8');
	let modId = data.match(/^published_id *=? *(\d*)\D*$/m);
	modId = modId && modId[1];

	if(!modId) {
		throw (
			`Item ID not found in ${cfgFile} file.\n` +
			`You need to publish your mod to workshop before you can build/view it.\n` +
			`Alternatively you can specify the workshop item id with --id param.`
		);
	}

	return modId;
}

// Gets mod tools placement from Vermintide Mod Tools install location
async function getModToolsDir(){
	let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + getToolsId() + '"';
	let value = '"InstallLocation"';

	let toolsDir = fallbackToolsDir;
	let errorMsg = 'Vermintide mod SDK directory not found, using fallback.';
	let appPath = await getRegistryValue(sdkKey, value).catch(err => {
		console.error(err);
	});

	if(appPath) {
		toolsDir = appPath;
	}
	else {
		console.error(errorMsg);
	}

	toolsDir = normalize(toolsDir);
	if (!fs.existsSync(join(toolsDir, stingrayDir, stingrayExe))){
		throw 'Mod tools not found. You need to install Vermintide Mod Tools from Steam client or specify valid fallback path.';
	}
	console.log(`Mod tools folder "${toolsDir}"`);
	return toolsDir;
}


/* CREATE AND UPLOAD METHODS */

function templateIsValid(templateDir) {
	return fs.existsSync(templateDir) && fs.existsSync(join(templateDir, itemPreview));
}

// Returns <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--verbose]
function getWorkshopParams(args, plainArgs) {

	let modName = args.m || args.mod || plainArgs[0] || '';
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

	if (!templateIsValid(templateDir)) {
		throw `Template folder "${templateDir}" doesn't exist or doesn't have "${itemPreview}" in it.`;
	}

	return new Promise((resolve, reject) => {

		let regexName = new RegExp(templateName, 'g');
		let regexTitle = new RegExp(templateTitle, 'g');
		let regexDescription = new RegExp(templateDescription, 'g');
		gulp.src(modSrc, { base: templateDir })
			.pipe(replace(regexName, modName))
			.pipe(replace(regexTitle, config.title))
			.pipe(replace(regexDescription, config.description))
			.pipe(rename(p => {
				p.dirname = p.dirname.replace(regexName, modName);
				p.basename = p.basename.replace(regexName, modName);
			}))
			.pipe(gulp.dest(modDir))
			.on('error', reject)
			.on('end', () => {

				if(coreSrc.length > 0){
					gulp.src(coreSrc, { base: templateDir})
						.pipe(gulp.dest(modDir))
						.on('error', reject)
						.on('end', resolve);
				}
				else{
					resolve();
				}
			});
	});
}

// Creates item.cfg file
async function createCfgFile(config) {
	let configText = `title = "${config.title}";\n` +
					`description = "${config.description}";\n` +
					`preview = "${itemPreview}";\n` +
					`content = "dist";\n` +
					`language = "${config.language}";\n` +
					`visibility = "${config.visibility}";\n`;
	console.log(`${cfgFile}:`);
	console.log('  ' + rmn(configText).replace(/\n/g, '\n  '));
	return await writeFile(join(modsDir, config.name, cfgFile), configText);
}

// Uploads mod to the workshop
async function uploadMod(toolsDir, modName, changenote, skip) {

	let configPath = modsDir + '\\' + modName + '\\' + cfgFile;

	if (!path.isAbsolute(modsDir)) {
		configPath = join(process.cwd(), configPath);
	}
	let uploaderParams = [
		'-c', '"' + configPath + '"'
	];

	if (changenote) {
		uploaderParams.push('-n');
		uploaderParams.push('"' + changenote + '"');
	}

	if (skip) {
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
		if (data.includes('publisher_id')) {
			try {
				modId = data.match(/publisher_id: (\d*)/)[1];
			}
			catch (err) { }
		}
	});

	return await new Promise((resolve, reject) => {
		uploader.on('error', error => reject(error));

		uploader.on('close', code => {
			if(code) {
				reject(
					'Uploader exited with error code: ' + code +
					(code == 3221225477 ? `\nCheck if Steam is running` : '')
				);
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
async function checkIfCfgExists(modName) {

	let modCfg = join(modsDir, modName, cfgFile);

	if(!fs.existsSync(modCfg)){
		return false;
	}

	let data = await readFile(modCfg, 'utf8')

	if(data.match(/^published_id *=? *(\d*)\D*$/m)) {
		throw `Mod has already been published for Vermintide ${gameNumber}, use gulp upload instead.`;
	}

	return true;
}


/* BUILD METHODS */

async function forEachMod(modNames, noWorkshopCopy, action, noAction) {
	for(let modName of modNames){

		if(!modName) {
			return;
		}

		let modDir = join(modsDir, modName);

		if(validModName(modName) && fs.existsSync(modDir + '/') && (fs.existsSync(join(modDir, cfgFile)) || noWorkshopCopy)) {
			await action(modName, modDir);
		}
		else {
			if(typeof noAction == 'function'){
				await noAction();
			}
			exitCode = 1;
			console.error(`Folder "${modDir}" doesn't exist, invalid or doesn't have ${cfgFile} in it.`);
		}
	};
}

// Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
async function buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId) {
	console.log('\nBuilding ', modName);

	let modDir = join(modsDir, modName);

	let modTempDir = join(tempDir, modName);
	let dataDir = join(modTempDir, 'compile');
	let buildDir = join(modTempDir, 'bundle');

	await checkTempFolder(modName, shouldRemoveTemp);

	if (!modId && !noWorkshopCopy && !fs.existsSync(join(modDir, cfgFile))){
		throw `Mod folder doesn't have ${cfgFile}`;
	}

	let stingrayExitCode = await runStingray(toolsDir, modDir, dataDir, buildDir, verbose);
	await processStingrayOutput(modName, dataDir, stingrayExitCode, ignoreBuildErrors);

	let modWorkshopDir = !noWorkshopCopy && await getModWorkshopDir(modName, modId);
	await moveMod(modName, buildDir, modWorkshopDir);

	console.log('Successfully built ' + modName);
}

// Returns a promise with specified registry entry value
async function getRegistryValue(key, value) {

	let spawn = child_process.spawn(
		'REG',
		['QUERY', key, '/v', value],
		{ windowsVerbatimArguments: true }
	);

	let result = '';

	spawn.stdout.on('data', data => {
		result += String(data);
	});

	return await new Promise((resolve, reject) => {

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
			catch(err){
				reject('Unexpected REG QUERY output');
			}

			resolve(result);
		});
	});
}

// Gets the steam workshop folder from vermintide's install location
async function getWorkshopDir() {
	let gameId = getGameId();
	let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + gameId + '"';
	let value = '"InstallLocation"';

	let workshopDir = fallbackWorkshopDir;
	let errorMsg = 'Vermintide workshop directory not found, using fallback.';

	let appPath = await	getRegistryValue(appKey, value).catch(err => {
		console.error(err);
	});

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
	return workshopDir;
}

// Returns ["<mod1>; <mod2>;<mod3>"] [--verbose] [-t] [--id <item_id>]
function getBuildParams(args, plainArgs) {

	let verbose = args.verbose || false;
	let shouldRemoveTemp = args.temp || false;
	let modNames = plainArgs;

	if (!modNames || !Array.isArray(modNames) || modNames.length === 0) {
		modNames = getFolders(modsDir, ignoredDirs);
	}

	let modId = modNames.length == 1 ? args.id : null;
	let noWorkshopCopy = args.dist || false;
	let ignoreBuildErrors = args.e || args['ignore-errors'] || args['ignore-build-errors'] || scriptConfig.ignore_build_errors;
	return {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors};
}

// Checks if temp folder exists, optionally removes it
async function checkTempFolder(modName, shouldRemove) {
	let tempPath = join(tempDir, modName);
	let tempExists = fs.existsSync(tempPath);

	if (tempExists && shouldRemove) {
		return await new Promise((resolve, reject) => {
			child_process.exec('rmdir /s /q "' + tempPath + '"', error => {

				if(error){
					return reject(error + '\nFailed to delete temp folder');
				}

				console.log('Removed ', tempPath);
				return resolve();
			});
		});
	}
	else if (tempExists) {
		console.log('Overwriting temp folder');
	}
}

// Builds the mod
async function runStingray(toolsDir, modDir, dataDir, buildDir, verbose) {

	if (!path.isAbsolute(modDir)) {
		modDir = join(process.cwd(), modDir);
	}
	if (!path.isAbsolute(dataDir)) {
		dataDir = join(process.cwd(), dataDir);
	}
	if (!path.isAbsolute(buildDir)) {
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
		if (verbose) {
			console.log(rmn(data));
		}
	});

	return await new Promise((resolve, reject) => {
		stingray.on('error', error => reject(error));

		stingray.on('close', code => {
			console.log('Finished building');
			resolve(code);
		});
	});
}

// Reads and outputs processed_bundles.csv
async function processStingrayOutput(modName, dataDir, code, ignoreBuildErrors) {

	if(code){
		console.error('Stingray exited with error code: ' + code + '. Please check your scripts for syntax errors.');
	}

	let data = await readFile(join(dataDir, 'processed_bundles.csv'), 'utf8').catch(error => {
		console.error(error + '\nFailed to read processed_bundles.csv');
	});


	if(data) {
		outputFailedBundles(data, modName);
	}

	if(ignoreBuildErrors) {
		console.log('Ignoring build errors');
	}

	if (!ignoreBuildErrors && (code || !data)) {
		throw `Failed to build ${modName}`;
	}
}

// Outputs built files which are empty
function outputFailedBundles(data, modName) {
	let bundles = rmn(data).split('\n');
	bundles.splice(0, 1);

	for(let line of bundles) {
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
	};
}

// Returns mod's directory in workshop folder
async function getModWorkshopDir(modName, modId) {
	if(modId) {
		console.log('Using specified item ID');
	}

	if(!modId) {
		modId = await getModId(modName);
	}
	console.log('Item ID:', modId);

	let workshopDir = await getWorkshopDir();

	return join(workshopDir, String(modId));
}

// Copies the mod to the modsDir and modName/dist
async function moveMod(modName, buildDir, modWorkshopDir) {
	return await new Promise((resolve, reject) => {

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
			resolve();
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
async function deleteFile(dir, file) {
    return await new Promise((resolve, reject) => {
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
async function deleteDirectory(dir) {
    return await new Promise((resolve, reject) => {
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

// Copy sourceFile to destFile if it doesn't exist
async function copyIfDoesntExist(sourceFile, destFile) {
	let sourcePath = path.parse(sourceFile);
	let destPath = path.parse(destFile);

	if (fs.existsSync(destFile)) {
		return;
	}

	return await new Promise((resolve, reject) => {
		gulp.src(sourceFile, { base: sourcePath.dir })
			.pipe(rename(p => {
				p.basename = destPath.name;
				p.extname = destPath.ext;
			}))
			.pipe(gulp.dest(destPath.dir))
			.on('error', reject)
			.on('end', resolve);
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
