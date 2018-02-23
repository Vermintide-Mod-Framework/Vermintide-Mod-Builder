'use strict';

const 
	fs = require('fs'),
	path = require('path'),
	gulp = require('gulp'),
	minimist = require('minimist'),
	merge = require('merge-stream'),
	replace = require('gulp-replace'),
	rename = require('gulp-rename'),
	child_process = require('child_process'),
	util = require('util'),
	readFile = util.promisify(fs.readFile);

// CHANGE THESE:
// Fallback paths to stingray executable and the folder to copy mods to
let fallbackStingrayExe = 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide Mod Tools/bin/stingray_win64_dev_x64.exe';
let fallbackModsDir = 'E:/SteamLibrary/steamapps/common/Warhammer End Times Vermintide/bundle/mods';

// CHANGE THESE maybe:
// Folders that will be ignored when building/watching all mods
const ignoredDirs = [
	'%%template',
	'.git',
	'.temp',
	'node_modules'
];

// Probably don't CHANGE THESE:
// These will be replaced in the template mod when using running task
const temp = "%%template";
const tempAuthor = "%%author";

// Folders with scripts and resources
const resDir = '/resource_packages/';
const scriptDir = '/scripts/mods/';
const renameDirs = [
	resDir,
	scriptDir
];

// Folders with static files
const coreSrc = [path.join(temp, '/core/**/*')];

// Folders with mod specific files
const modSrc = [
	path.join(temp, resDir, temp, temp + '.package'),
	path.join(temp, scriptDir, temp, temp + '.lua'),			
	path.join(temp, temp + '.mod'),
	path.join(temp, '/*')	
];

// Creates a copy of the template mod and renames it to the provided name
// gulp create -m mod_name [-a Author]
gulp.task('create', (callback) => {
	let argv = minimist(process.argv);
	let modName = argv.m || argv.mod || '';
	let authorName = argv.a || argv.author || '';
	let modPath = modName + '/';
	if(!modName || fs.existsSync(modPath)) {
		throw Error(`Folder ${modName} not specified or already exists`);
	}

	let corePipe = gulp.src(coreSrc, {base: temp}).pipe(gulp.dest(modPath));

	let modPipe = gulp.src(modSrc, {base: temp})
		.pipe(replace(temp, modName))
		.pipe(replace(tempAuthor, authorName))
		.pipe(rename((p) => {
			p.basename = p.basename.replace(temp, modName);
		}))
		.pipe(gulp.dest(modPath))
		.on('end', () => {
			renameDirs.forEach((dir) => {				
				fs.renameSync(path.join(modName, dir, temp), path.join(modName, dir, modName));
			});
		});

	return merge(corePipe, modPipe);
});

// Builds specified mods and copies the bundles to the game folder
// gulp build [-m "mod1; mod2;mod3"] [--verbose] [-t] 
// --verbose - prints stingray console output even on successful build
// -t - doesn't delete .temp folder before building
gulp.task('build', (callback) => {

	let {modNames, verbose, leaveTemp} = getBuildParams(process.argv);

	console.log('Mods to build:');
	modNames.forEach(modName => console.log('- ' + modName));
	console.log();

	getPaths().then(paths => {

		let promise = Promise.resolve();	
		modNames.forEach(modName => {
			if(modName){
		    	promise = promise.then(() => buildMod(paths, modName, !leaveTemp, verbose));
			}
		});
		return promise;
	})
	.then(() => callback());
});

// Watches for changes in specified mods and builds them whenever they occur
// gulp watch [-m "mod1; mod2;mod3"] [--verbose] [-t] 
gulp.task('watch', (callback) => {
	let {modNames, verbose, leaveTemp} = getBuildParams(process.argv);
	getPaths().then(paths => {
		modNames.forEach((modName) => {
			console.log('Watching ', modName, '...');
			gulp.watch([modName, '!' + modName + '/*.tmp'], buildMod.bind(null, paths, modName, !leaveTemp, verbose));
		});
		return callback();
	});
});


//////////////

// Returns a promise with specified registry entry value
function getRegistryValue(key, value) {

	return new Promise((resolve, reject) => {

		let spawn = child_process.spawn(
			'REG',
			['QUERY', key, '/v', value],
			{windowsVerbatimArguments: true}
		);

		let result = "";

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

// Returns a promise with paths to mods dir and stingray exe
function getPaths(){
	return new Promise((resolve, reject) => {
		let appKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 235540"';
		let sdkKey = '"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 718610"';
		let value = '"InstallLocation"';

		let modsDir = fallbackModsDir;
		let stingrayExe = fallbackStingrayExe;
		getRegistryValue(appKey, value)
			.catch(err => {
				console.log('Vermintide directory not found, using fallback.');
			})
			.then(appPath => {
				if(appPath) {
					modsDir = path.join(appPath, 'bundle/mods');
				}
				return getRegistryValue(sdkKey, value);
			})
			.catch(err => {
				console.log('Vermintide mod SDK directory not found, using fallback.');
			})
			.then(appPath => {
				if(appPath) {
					stingrayExe = path.join(appPath, 'bin/stingray_win64_dev_x64.exe');
				}
				console.log('Mods directory:', modsDir);
				console.log('Stingray executable:', stingrayExe);
				console.log();
				resolve({modsDir, stingrayExe});
			});
	});
}

// Returns [-m "mod1; mod2;mod3"] [--verbose] [-t] params
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
	return {modNames, verbose, leaveTemp};
}

// Returns an array of folders in dir, except the ones in second param
function getFolders(dir, except) {
	return fs.readdirSync(dir)
		.filter(function(fileName) {
			return fs.statSync(path.join(dir, fileName)).isDirectory() && (!except || !except.includes(fileName));
		});
}

// Builds modName, optionally deleting its .temp folder, and copies it to the modsDir
function buildMod(paths, modName, removeTemp = true, verbose = false) {
	console.log('Building ', modName);

	let tempDir = path.join('.temp', modName);
	let dataDir = path.join(tempDir, 'compile');
	let buildDir = path.join(tempDir, 'bundle');

	return Promise.resolve()
		.then(() => checkTempFolder(modName, removeTemp))
		.then(() => runStingray(paths, modName, dataDir, buildDir, verbose))
		.then((code) => readProcessedBundles(modName, dataDir, code))
		.then(() => moveMod(modName, buildDir, paths.modsDir))
		.then(success => {
			console.log(success);
			return Promise.resolve();
		})
		.catch(error => {
			console.error(error);
		});
}

function checkTempFolder(modName, shouldRemove) {
	return new Promise((resolve, reject) => {
		let tempPath = path.join('.temp', modName);
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

function runStingray(paths, modName, dataDir, buildDir, verbose) {
	return new Promise((resolve, reject) => {


		let stingrayParams = [
			`--compile-for win32`,
			`--source-dir "${modName}"`,
			`--data-dir "${dataDir}"`,
			`--bundle-dir "${buildDir}"`
		];

		let stingray = child_process.spawn(
			paths.stingrayExe, 
			stingrayParams, 
			{windowsVerbatimArguments: true} // fucking WHY???
		);

		stingray.stdout.on('data', (data) => {
			if(verbose){
			    console.log(rmn(data));
			}
		});

		stingray.on('error', (error) => reject(error));

		stingray.on('close', (code) => resolve(code));
	});
}

function readProcessedBundles(modName, dataDir, code) {
	return Promise.resolve()
		.then(() => readFile(path.join(dataDir, 'processed_bundles.csv'), 'utf8'))
		.catch(error => {
			console.log(error + '\nFailed to read processed_bundles.csv');
		})
		.then(data => {
			return new Promise((resolve, reject) => {
				if(data) {
					outputFailedBundles(data, modName);
				}
				if(code) {
					return reject('Building failed with code: ' + code + '. Please check your scripts for syntax errors.\n');
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

// Copies the mod to the modsDir
function moveMod(modName, buildDir, modsDir) {
	return new Promise((resolve, reject) => {
		gulp.src([
				buildDir + '/*([0-f])', 
				'!' + buildDir + '/dlc'
			], {base: buildDir})
			.pipe(rename((p) => {
				p.basename = modName;
				p.extname = '';
			}))
			.on('error', err => {		    		
				console.log(err);
				reject(err);
			})
			.pipe(gulp.dest(modsDir))
			.on('error', err => {		    		
				console.log(err);
				reject(err);
			})
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
