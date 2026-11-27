const fs = require('fs');

const path = require('../lib/path');

const config = require('../modules/config');

const modTools = require('./mod_tools');

// Lets a mod use the game's resources from the Modding Tools Content, and from any other folders in source_dirs.
//
// vmb resolve-sources finds the files the mod uses there: the ones its files refer to, the ones those refer to, and so on,
// read from the files' text as the compiler reads them. A reference such as "units/props/barrel_01" is looked for under
// each of those folders. It writes them to LIST_FILE in the mod's folder, one per line.
// The compiler's dependency database (dependency_database.db) can't be used instead: it lists what the game loads,
// not what the compiler reads, such as texture categories, shader nodes, or a unit built from another unit's mesh.
//
// vmb build, for a mod with that list, copies the mod and the listed files to a staging folder in the mod's temp folder
// and compiles from there. The compiler compiles everything in its source folder, and the Content is the whole game,
// so it can't be given to the compiler as it is. A mod without the list builds from its own folder as before.

const LIST_FILE = 'sources.txt';

// Files in the top folder that are always listed when a source folder has them: the compiler only reads top-level files
// from its source folder, and the game's units' flow needs the game's flow nodes to compile
const TOP_LEVEL_FILES = ['global.script_flow_nodes'];

// Files that are never taken from the source folders: scripts and packages are the game's code and bundles, not resources.
// A mod's Lua names game scripts in its requires, and they would be compiled into its bundle.
const SKIPPED_EXTENSIONS = ['.lua', '.package'];

// Files that are never read for references: binary data, and big plain-text meshes
const BINARY_EXTENSIONS = [
    '.dds', '.png', '.jpg', '.tga', '.wav', '.ogg', '.wem', '.bnk', '.ivf', '.navdata', '.tome',
    '.umbrascene', '.mod_bundle', '.dmp', '.bsiz', '.ttf', '.otf'
];
const MAX_TEXT_FILE_SIZE = 8 * 1024 * 1024;

// A resource path in quotes, as text resources write them: "units/props/barrel_01"
const REFERENCE_PATTERN = /"([A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_.\-]+)+)"/g;

// The source folders, once found
let _roots = null;

// The folders mods take sources from: the Modding Tools Content, then the folders in source_dirs
async function _getRoots() {

    if (!_roots) {
        _roots = [await modTools.getContentDir()].concat(config.get('sourceDirs'));
    }

    return _roots;
}

// Whether the mod has a list of the files it uses from the source folders
function hasList(modDir) {
    return fs.existsSync(path.combine(modDir, LIST_FILE));
}

// Finds the files the mod in modDir uses from the source folders and writes them to its list.
// Returns the list's path and how many files it has.
// skippedDirs are the absolute paths of the mod's folders that are not compiled, such as its bundle folders.
async function resolve(modDir, skippedDirs) {
    let roots = await _getRoots();

    let topLevelFiles = TOP_LEVEL_FILES.filter(name => roots.some(root => fs.existsSync(path.combine(root, name))));
    let used = _filesUsed(_modFiles(modDir, skippedDirs), roots, new Map());

    let lines = topLevelFiles.concat(Array.from(used.keys()).sort());
    let listFile = path.combine(modDir, LIST_FILE);
    fs.writeFileSync(listFile, lines.join('\n') + '\n');

    return { listFile, count: lines.length };
}

// Copies the mod in modDir and the files in its list into stagingDir, and removes staged files it no longer uses
async function stage(modDir, stagingDir, skippedDirs) {
    let roots = await _getRoots();
    let needed = new Map(); // staged relative path -> source file

    for (let file of _modFiles(modDir, skippedDirs)) {
        needed.set(_relative(modDir, file), file);
    }

    for (let [relative, file] of _filesListed(path.combine(modDir, LIST_FILE), roots)) {
        needed.set(relative, file);
    }

    _copyNeeded(needed, stagingDir);
    _removeUnneeded(needed, stagingDir);
}

// The mod's files, without its list and the skipped folders
function _modFiles(modDir, skippedDirs) {
    let listFile = path.combine(modDir, LIST_FILE);
    return _allFilesIn(modDir, skippedDirs.map(dir => path.fix(dir))).filter(file => file !== listFile);
}

// The files the mod's files refer to in the source folders, the files those refer to, and so on: relative path -> source file
function _filesUsed(modFiles, roots, listings) {
    let used = new Map();
    let queue = modFiles.filter(_isText);

    while (queue.length > 0) {
        let file = queue.pop();

        for (let reference of _referencesIn(file)) {

            for (let source of _filesFor(reference, roots, listings)) {

                if (used.has(source.relative)) {
                    continue;
                }

                used.set(source.relative, source.file);

                if (_isText(source.file)) {
                    queue.push(source.file);
                }
            }
        }
    }

    return used;
}

// The files in the mod's list, from the first source folder that has each: relative path -> source file
function _filesListed(listFile, roots) {
    let listed = new Map();

    for (let relative of fs.readFileSync(listFile, 'utf8').split(/\r?\n/)) {
        if (!relative) {
            continue;
        }

        let root = roots.find(root => fs.existsSync(path.combine(root, relative)));

        if (!root) {
            throw new Error(`"${relative}" in "${listFile}" is in none of the source folders. Run vmb resolve-sources again.`);
        }

        listed.set(relative, path.combine(root, relative));
    }

    return listed;
}

// A file's path relative to dir, with forward slashes
function _relative(dir, file) {
    return path.relative(dir, file).split(path.sep).join('/');
}

// The resource paths a text file refers to
function _referencesIn(file) {
    let text;

    try {
        text = fs.readFileSync(file, 'latin1');
    }
    catch (error) {
        return [];
    }

    let references = new Set();
    let match;
    REFERENCE_PATTERN.lastIndex = 0;

    while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
        references.add(match[1]);
    }

    return references;
}

// The files a resource path names in the source folders: every file in its folder with that name,
// whatever the extension, as a unit's .unit, .bsi and .physics or a texture's .texture and .dds.
// A file in more than one source folder is taken from the first.
function _filesFor(reference, roots, listings) {
    let relativeDir = path.dirname(reference);
    let wantedName = path.basename(reference);

    let files = [];
    let found = new Set();

    for (let root of roots) {
        let sourceDir = path.combine(root, relativeDir);

        for (let fileName of _listing(sourceDir, listings)) {
            let stem = path.basename(fileName, path.extname(fileName));

            // A reference names a resource without its extension, or one file with it
            let named = stem === wantedName || fileName === wantedName;

            if (named && !found.has(fileName) && !SKIPPED_EXTENSIONS.includes(path.extname(fileName).toLowerCase())) {
                found.add(fileName);
                files.push({ relative: path.combine(relativeDir, fileName), file: path.combine(sourceDir, fileName) });
            }
        }
    }

    return files;
}

// The file names in a folder, read once
function _listing(dir, listings) {

    if (!listings.has(dir)) {
        let fileNames = [];

        try {
            for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isFile()) {
                    fileNames.push(entry.name);
                }
            }
        }
        catch (error) {
            // A reference to a folder that doesn't exist names no files
        }

        listings.set(dir, fileNames);
    }

    return listings.get(dir);
}

function _isText(file) {

    if (BINARY_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
        return false;
    }

    try {
        return fs.statSync(file).size <= MAX_TEXT_FILE_SIZE;
    }
    catch (error) {
        return false;
    }
}

// Copies each needed file that is missing or changed, with its modification time,
// so that the compiler only recompiles what changed
function _copyNeeded(needed, stagingDir) {

    for (let [relative, source] of needed) {
        let staged = path.combine(stagingDir, relative);
        let sourceStats = fs.statSync(source);

        if (fs.existsSync(staged)) {
            let stagedStats = fs.statSync(staged);

            // Times are compared in whole seconds, since setting a file's time can round it
            let sameTime = Math.floor(stagedStats.mtimeMs / 1000) === Math.floor(sourceStats.mtimeMs / 1000);

            if (stagedStats.size === sourceStats.size && sameTime) {
                continue;
            }
        }

        _makeDir(path.dirname(staged));
        fs.copyFileSync(source, staged);
        fs.utimesSync(staged, sourceStats.atime, sourceStats.mtime);
    }
}

// Deletes staged files the mod no longer uses
function _removeUnneeded(needed, stagingDir) {

    if (!fs.existsSync(stagingDir)) {
        return;
    }

    for (let file of _allFilesIn(stagingDir, [])) {
        if (!needed.has(_relative(stagingDir, file))) {
            fs.unlinkSync(file);
        }
    }

    _removeEmptyDirs(stagingDir);
}

// Deletes the empty folders inside dir. A folder left from a removed file still counts as a source folder to the
// compiler: an empty core folder takes the place of the SDK's.
function _removeEmptyDirs(dir) {

    for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }

        let subDir = path.combine(dir, entry.name);
        _removeEmptyDirs(subDir);

        if (fs.readdirSync(subDir).length === 0) {
            fs.rmdirSync(subDir);
        }
    }
}

// All files in a folder and its subfolders, except in skippedDirs
function _allFilesIn(dir, skippedDirs) {
    let files = [];

    for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
        let file = path.combine(dir, entry.name);

        if (entry.isDirectory()) {
            if (!skippedDirs.includes(file)) {
                files.push(..._allFilesIn(file, skippedDirs));
            }
        }
        else {
            files.push(file);
        }
    }

    return files;
}

function _makeDir(dir) {

    if (fs.existsSync(dir)) {
        return;
    }

    _makeDir(path.dirname(dir));
    fs.mkdirSync(dir);
}

module.exports = { hasList, resolve, stage };
