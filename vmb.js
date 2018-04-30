(async function(){
'use strict';

const pfs = require('./scripts/pfs'),
	  path = require('./scripts/path'),
	  str = require('./scripts/str'),
      gulp = require('gulp'),
      replace = require('gulp-replace'),
      rename = require('gulp-rename'),
      child_process = require('child_process'),
	  opn = require('opn'),
	  setupCleanup = require('node-cleanup');


const cl = require('./scripts/cl');

/* SETUP */

let exitCode = 0;
let taskFinished = false;
setupCleanup(checkTaskFinished);


// Tasks
let tasks = {};
addTask('default', taskDefault);
addTask('params', taskConfig);
addTask('create', taskCreate);
addTask('publish', taskPublish);
addTask('upload', taskUpload);
addTask('open', taskOpen);
addTask('build', taskBuild);
addTask('watch', taskWatch);

const {currentTask, plainArgs} = getCurrentTask(cl.argv._);


/* CONFIG */

const config = await (require('./scripts/config').init('.vmbrc', cl.argv));

if(!config.data){
	process.exit();
}

// Early execution and exit for certain tasks
if (currentTask == taskDefault || currentTask == taskConfig) {
	await runTask(currentTask, cl.argv, plainArgs);
	process.exit();
}

/* EXECUTION */

await runTask(currentTask, cl.argv, plainArgs);


///////////////////////////////////
/// TASK AND METHOD DEFINITIONS ///
///////////////////////////////////



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
async function runTask(task, args, plainArgs) {
	await task(callback, args, plainArgs);
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
		'vmb params    [--<key1>=<value1> --<key2>=<value2>...]\n' +
		'vmb create    <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--template <template_folder>]\n' +
		'vmb publish   <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>] [--ignore-errors] [--verbose] [--temp]\n' +
		'vmb upload    <mod_name> [-n <changenote>] [--open] [--skip]\n' +
		'vmb open      {<mod_name> | --id <item_id>}\n' +
		'vmb build     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]\n' +
		'vmb watch     [<mod_name1> <mod_name2>...] [--ignore-errors] [--verbose] [--temp] [--id <item_id>] [--dist]'
	);
	callback();
}

// Sets and/or displayes params file values
// Limited to non-object values
// vmb params [--<key1>=<value1> --<key2>=<value2>...]
async function taskConfig(callback, args, plainArgs) {

	config.setData(args);

	try {
		await config.writeData();
	}
	catch(err){
		console.error(err);
		console.error(`Couldn't save params`);
		return callback();
	}

	console.log(config.data);

	callback();
}

// Creates a copy of the template mod and renames it to the provided name
// Uploads an empty mod file to the workshop to create an id
// vmb create <mod_name> [-d <description>] [-t <title>] [-l <language>] [-v <visibility>]
async function taskCreate(callback, args, plainArgs) {

	let params = cl.getWorkshopParams(args, plainArgs);
	let modName = params.name;
	let modDir = path.combine(config.modsDir, modName);

	let error = '';
	if (!validModName(modName)) {
		error = `Folder name "${modDir}" is invalid`;
	}
	else if(await pfs.accessible(modDir + '/')){
		error = `Folder "${modDir}" already exists`;
	}

	if(error) {
		console.error(error);
		exitCode = 1;
		return callback();
	}

	console.log(`Copying template from "${config.templateDir}"`);

	try {
		await copyTemplate(params);
		await createCfgFile(params);

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
		let modDir = path.combine(config.modsDir, modName);
		if(await pfs.accessible(modDir)){
			try {
				await pfs.deleteDirectory(modDir);
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

	let params = cl.getWorkshopParams(args, plainArgs);
	let modName = params.name;
	let modDir = path.combine(config.modsDir, modName);
	let buildParams = await cl.getBuildParams(args);


	let error = '';
	if (!validModName(modName)) {
		error = `Folder name "${modDir}" is invalid`;
	}
	else if (!await pfs.accessible(modDir + '/')) {
		error = `Folder "${modDir}" doesn't exist`;
	}
	else{
		await validateTemplate(config.templateDir);
	}

	if (error) {
		console.error(error);
		exitCode = 1;
		return callback();
	}

	try {
		if (await cfgExists(modName)) {
			console.log(`Using existing ${config.cfgFile}`);
		}
		else{
			await createCfgFile(params);
		}

		let toolsDir = await getModToolsDir();
		await buildMod(toolsDir, modName, buildParams.shouldRemoveTemp, true, params.verbose, buildParams.ignoreBuildErrors, null);
		await pfs.copyIfDoesntExist(path.combine(config.templateDir, config.itemPreview), path.combine(modDir, config.itemPreview));
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
	let modDir = path.combine(config.modsDir, modName);

	let error = '';
	if (!validModName(modName)) {
		error = `Folder name "${modDir}" is invalid`;
	}
	else if (!await pfs.accessible(modDir + '/')) {
		error = `Folder "${modDir}" doesn't exist`;
	}

	if (error) {
		console.error(error);
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
	let modDir = path.combine(config.modsDir, modName);
	let modId = args.id || null;

	if(!modId) {
		let error = '';
		if (!validModName(modName)) {
			error = `Folder name "${modDir}" is invalid`;
		}
		else if (!await pfs.accessible(modDir + '/')) {
			error = `Folder "${modDir}" doesn't exist`;
		}

		if (error) {
			console.error(error);
			exitCode = 1;
			return callback();
		}
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

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = await cl.getBuildParams(args, plainArgs);

	if(modNames.length > 0){
		console.log('Mods to build:');
		for(let modName of modNames) {
			console.log('  ' + modName);
		}
	}
	else {
		console.log('No mods to build');
		return callback();
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

	let {modNames, verbose, shouldRemoveTemp, modId, noWorkshopCopy, ignoreBuildErrors} = await cl.getBuildParams(args, plainArgs);

	if (modNames.length === 0) {
		console.log('No mods to watch');
		return callback();
	}

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
					'!' + config.modsDir + '/' + modName + '/*.tmp',
					'!' + config.modsDir + '/' + modName + '/' + config.distDir + '/*'
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


/* params METHODS */

// Creates, reads or deletes





/* SHARED METHODS */

function validModName(modName) {
	return typeof modName == 'string' && !!modName && modName.match(/^[0-9a-zA-Z_\- %]+$/);
}

async function getModId(modName) {
	let data = await pfs.readFile(path.combine(config.modsDir, modName, config.cfgFile), 'utf8');
	let modId = data.match(/^published_id *=? *(\d*)\D*$/m);
	modId = modId && modId[1];

	if(!modId) {
		throw (
			`Item ID not found in ${config.cfgFile} file.\n` +
			`You need to publish your mod to workshop before you can build/view it.\n` +
			`Alternatively you can specify the workshop item id with --id param.`
		);
	}

	return modId;
}

// Gets mod tools placement from Vermintide Mod Tools install location
async function getModToolsDir(){
	let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + config.getToolsId() + '"';
	let value = '"InstallLocation"';

	let toolsDir = config.fallbackToolsDir;
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

	toolsDir = path.fix(toolsDir);
	if (!await pfs.accessible(path.combine(toolsDir, config.stingrayDir, config.stingrayExe))){
		throw 'Mod tools not found. You need to install Vermintide Mod Tools from Steam client or specify valid fallback path.';
	}
	console.log(`Mod tools folder "${toolsDir}"`);
	return toolsDir;
}


/* CREATE AND UPLOAD METHODS */

async function validateTemplate(templateDir) {
	if (!await pfs.accessible(templateDir)) {
		exitCode = 1;
		throw `Template folder "${templateDir}" doesn't exist.`;
	}

	if (!await pfs.accessible(path.combine(templateDir, config.itemPreview))) {
		exitCode = 1;
		throw `Template folder "${templateDir}" doesn't have "${config.itemPreview}" in it.`;
	}
}



// Copies and renames mod template from %%template folder
async function copyTemplate(params) {

	let modName = params.name;
	let modDir = path.combine(config.modsDir, modName);

	await validateTemplate(config.templateDir);

	return await new Promise((resolve, reject) => {

		let regexName = new RegExp(config.templateName, 'g');
		let regexTitle = new RegExp(config.templateTitle, 'g');
		let regexDescription = new RegExp(config.templateDescription, 'g');
		gulp.src(config.modSrc, { base: config.templateDir })
			.pipe(replace(regexName, modName))
			.pipe(replace(regexTitle, params.title))
			.pipe(replace(regexDescription, params.description))
			.pipe(rename(p => {
				p.dirname = p.dirname.replace(regexName, modName);
				p.basename = p.basename.replace(regexName, modName);
			}))
			.pipe(gulp.dest(modDir))
			.on('error', reject)
			.on('end', () => {

				if(config.coreSrc.length > 0){
					gulp.src(config.coreSrc, { base: config.templateDir})
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
async function createCfgFile(params) {
	let configText = `title = "${params.title}";\n` +
					`description = "${params.description}";\n` +
					`preview = "${config.itemPreview}";\n` +
					`content = "dist";\n` +
					`language = "${params.language}";\n` +
					`visibility = "${params.visibility}";\n`;
	console.log(`${config.cfgFile}:`);
	console.log('  ' + str.rmn(configText).replace(/\n/g, '\n  '));
	return await pfs.writeFile(path.combine(config.modsDir, params.name, config.cfgFile), configText);
}

// Uploads mod to the workshop
async function uploadMod(toolsDir, modName, changenote, skip) {

	let configPath = config.modsDir + '\\' + modName + '\\' + config.cfgFile;

	if (!path.isAbsolute(config.modsDir)) {
		configPath = path.combine(process.cwd(), configPath);
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

	console.log(`\nRunning uploader with steam app id ${config.getGameId()}`);

	await pfs.writeFile(path.combine(toolsDir, config.uploaderDir, config.uploaderGameConfig), config.getGameId());
	let uploader = child_process.spawn(
		config.uploaderExe,
		uploaderParams,
		{
			cwd: path.combine(toolsDir, config.uploaderDir),
			windowsVerbatimArguments: true
		}
	);

	let modId = '';
	uploader.stdout.on('data', data => {
		console.log(str.rmn(data));
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
			else if (modId){
				resolve(modId);
			}
			else{
				reject(`Uploader failed to return an item id`);
			}
		});
	});
}

// Returns steam workshop url for mod
function formUrl(modId) {
	return 'http://steamcommunity.com/sharedfiles/filedetails/?id=' + modId;
}

// Checks if the mod has published_id in its item.cfg
async function cfgExists(modName) {

	let modCfg = path.combine(config.modsDir, modName, config.cfgFile);

	if(!await pfs.accessible(modCfg)){
		return false;
	}

	let data = await pfs.readFile(modCfg, 'utf8');

	if(data.match(/^published_id *=? *(\d*)\D*$/m)) {
		throw `Mod has already been published for Vermintide ${config.gameNumber}, use gulp upload instead.`;
	}

	return true;
}


/* BUILD METHODS */

async function forEachMod(modNames, noWorkshopCopy, action, noAction) {
	for(let modName of modNames){

		if(!modName) {
			continue;
		}

		let modDir = path.combine(config.modsDir, modName);

		let error = '';
		if (!validModName(modName)) {
			error = `Folder name "${modDir}" is invalid`;
		}
		else if (!await pfs.accessible(modDir + '/')) {
			error = `Folder "${modDir}" doesn't exist`;
		}
		else if (!await pfs.accessible(path.combine(modDir, config.cfgFile)) && !noWorkshopCopy) {
			error = `Folder "${modDir}" doesn't have ${ config.cfgFile } in it`;
		}

		if (error) {
			if (typeof noAction == 'function') {
				await noAction();
			}
			console.error(error);
			exitCode = 1;
			continue;
		}

		await action(modName, modDir);
	};
}

// Builds modName, optionally deleting its temp folder, and copies it to the dist and workshop dirs
async function buildMod(toolsDir, modName, shouldRemoveTemp, noWorkshopCopy, verbose, ignoreBuildErrors, modId) {
	console.log('\nBuilding ', modName);

	let modDir = path.combine(config.modsDir, modName);

	let modTempDir = path.combine(config.tempDir, modName);
	let dataDir = path.combine(modTempDir, 'compile');
	let buildDir = path.combine(modTempDir, 'bundle');

	await checkTempFolder(modName, shouldRemoveTemp);

	if (!modId && !noWorkshopCopy && !await pfs.accessible(path.combine(modDir, config.cfgFile))){
		throw `Mod folder doesn't have ${config.cfgFile}`;
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
	let gameId = config.getGameId();
	let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ' + gameId + '"';
	let value = '"InstallLocation"';

	let workshopDir = config.fallbackWorkshopDir;
	let errorMsg = 'Vermintide workshop directory not found, using fallback.';

	let appPath = await	getRegistryValue(appKey, value).catch(err => {
		console.error(err);
	});

	if(appPath && typeof appPath == 'string') {

		appPath = path.fix(appPath);
		let parts = appPath.split('/');
		let neededPart = parts[parts.length - 2];

		if(!neededPart){
			console.error(errorMsg);
			workshopDir = config.fallbackWorkshopDir;
		}
		else{
			workshopDir = appPath.substring(0, appPath.lastIndexOf(neededPart));
			workshopDir = path.combine(workshopDir, 'workshop/content', gameId);
		}
	}
	else {
		console.error(errorMsg);
	}

	console.log('Workshop folder:', workshopDir);
	return workshopDir;
}



// Checks if temp folder exists, optionally removes it
async function checkTempFolder(modName, shouldRemove) {
	let tempPath = path.combine(config.tempDir, modName);
	let tempExists = await pfs.accessible(tempPath);

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
		modDir = path.combine(process.cwd(), modDir);
	}
	if (!path.isAbsolute(dataDir)) {
		dataDir = path.combine(process.cwd(), dataDir);
	}
	if (!path.isAbsolute(buildDir)) {
		buildDir = path.combine(process.cwd(), buildDir);
	}

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

	let data = await pfs.readFile(path.combine(dataDir, 'processed_bundles.csv'), 'utf8').catch(error => {
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
	let bundles = str.rmn(data).split('\n');
	bundles.splice(0, 1);

	for(let line of bundles) {
		let bundle = line.split(', ');

		if(bundle.length < 4){
			console.log(`Incorrect processed_bundles.csv string`, bundle);
			continue;
		}

		/* jshint ignore:start */
		if(bundle[3] == 0) {
			console.log('Failed to build %s/%s/%s.%s', config.modsDir, modName, bundle[1].replace(/"/g, ''), bundle[2].replace(/"/g, ''));
		}
		/* jshint ignore:end */
	};
}

// Returns mod's directory in workshop folder
async function getModWorkshopDir(modName, modId) {
	if(modId) {
		console.log('Using specified item ID');
	}
	else {
		modId = await getModId(modName);
	}
	console.log('Item ID:', modId);

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

})();
