const fs = require('fs');

const path = require('../lib/path');

const config = require('../modules/config');

const modTools = require('./mod_tools');

// Lets a mod use files from the folders in source_dirs, such as the game's units in the Modding Tools Content.
//
// vmb resolve-sources finds the files the mod uses there: the ones its files refer to, the ones those refer to, and so on,
// read from the files' text as the compiler reads them. It writes them to LIST_FILE in the mod's folder, one per line.
// The compiler's dependency database (dependency_database.db) can't be used instead: it lists what the game loads,
// not what the compiler reads, such as texture categories, shader nodes, or a unit built from another unit's mesh.
//
// vmb build, for a mod with that list, copies the mod and the listed files to a staging folder in the mod's temp folder
// and compiles from there. The compiler compiles everything in its source folder, and the game's folders are most of
// the game, so they can't be given to it whole. A mod without the list builds from its own folder as before.
//
// An entry of source_dirs can also name a file in the top folder, such as global.script_flow_nodes, which is always
// listed: the compiler only reads top-level files from its source folder.

const LIST_FILE = 'sources.txt';

// Files that are never read for references: binary data, and big plain-text meshes
const BINARY_EXTENSIONS = [
    '.dds', '.png', '.jpg', '.tga', '.wav', '.ogg', '.wem', '.bnk', '.ivf', '.navdata', '.tome',
    '.umbrascene', '.mod_bundle', '.dmp', '.bsiz', '.ttf', '.otf'
];
const MAX_TEXT_FILE_SIZE = 8 * 1024 * 1024;

// A resource path in quotes, as text resources write them: "units/props/barrel_01"
const REFERENCE_PATTERN = /"([A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_.\-]+)+)"/g;

// The folders and files of source_dirs as [{ name, dir }], with the Modding Tools Content's folder for names given alone
async function sourceDirs() {
    let dirs = config.get('sourceDirs');

    if (dirs.length == 0) {
        throw new Error(`"source_dirs" in ${config.get('filename')} is empty`);
    }

    if (dirs.some(({ dir }) => dir === null)) {
        let contentDir = await modTools.getContentDir();
        dirs = dirs.map(({ name, dir }) => ({ name, dir: dir === null ? contentDir : dir }));
    }

    return dirs;
}

// Whether the mod has a list of the files it uses from source_dirs
function hasList(modDir) {
    return fs.existsSync(path.combine(modDir, LIST_FILE));
}

// Finds the files the mod in modDir uses from dirs and writes them to its list. Returns how many there are.
// skippedDirs are the absolute paths of the mod's folders that are not compiled, such as its bundle folders.
function resolve(modDir, dirs, skippedDirs) {
    let { folders, files } = _split(dirs);
    let used = _filesUsed(_modFiles(modDir, skippedDirs), folders, new Map());

    let lines = files.map(({ name }) => name).concat(Array.from(used.keys()).sort());
    fs.writeFileSync(path.combine(modDir, LIST_FILE), lines.join('\n') + '\n');

    return lines.length;
}

// Copies the mod in modDir and the files in its list into stagingDir, and removes staged files it no longer uses
function stage(modDir, stagingDir, dirs, skippedDirs) {
    let needed = new Map(); // staged relative path -> source file

    for (let file of _modFiles(modDir, skippedDirs)) {
        needed.set(_relative(modDir, file), file);
    }

    for (let [relative, file] of _filesListed(path.combine(modDir, LIST_FILE), dirs)) {
        needed.set(relative, file);
    }

    _copyNeeded(needed, stagingDir);
    _removeUnneeded(needed, stagingDir);
}

// The entries of dirs that are folders, and the ones that are top-level files
function _split(dirs) {
    let folders = [];
    let files = [];

    for (let entry of dirs) {
        let file = path.combine(entry.dir, entry.name);

        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            files.push(entry);
        }
        else {
            folders.push(entry);
        }
    }

    return { folders, files };
}

// The mod's files, without its list and the skipped folders
function _modFiles(modDir, skippedDirs) {
    let listFile = path.combine(modDir, LIST_FILE);
    return _allFilesIn(modDir, skippedDirs.map(dir => path.fix(dir))).filter(file => file != listFile);
}

// The files the mod's files refer to in the folders, the files those refer to, and so on: relative path -> source file
function _filesUsed(modFiles, folders, listings) {
    let used = new Map();
    let queue = modFiles.filter(_isText);

    while (queue.length > 0) {
        let file = queue.pop();

        for (let reference of _referencesIn(file)) {

            for (let source of _filesFor(reference, folders, listings)) {

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

// The files in the mod's list: relative path -> source file
function _filesListed(listFile, dirs) {
    let listed = new Map();

    for (let relative of fs.readFileSync(listFile, 'utf8').split(/\r?\n/)) {
        if (!relative) {
            continue;
        }

        let entry = dirs.find(({ name }) => relative == name || relative.startsWith(name + '/'));
        let file = entry && path.combine(entry.dir, relative);

        if (!file || !fs.existsSync(file)) {
            throw new Error(`"${relative}" in "${listFile}" is not in source_dirs. Run vmb resolve-sources again.`);
        }

        listed.set(relative, file);
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

// The files a resource path names in the folders: every file in its folder with that name,
// whatever the extension, as a unit's .unit, .bsi and .physics or a texture's .texture and .dds
function _filesFor(reference, folders, listings) {

    let entry = folders.find(({ name }) => reference.startsWith(name + '/'));

    if (!entry) {
        return [];
    }

    let relativeDir = path.dirname(reference);
    let wantedName = path.basename(reference);
    let sourceDir = path.combine(entry.dir, relativeDir);

    let files = [];

    for (let fileName of _listing(sourceDir, listings)) {
        let stem = path.basename(fileName, path.extname(fileName));

        // A reference names a resource without its extension, or one file with it
        if (stem == wantedName || fileName == wantedName) {
            files.push({ relative: path.combine(relativeDir, fileName), file: path.combine(sourceDir, fileName) });
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
            let sameTime = Math.floor(stagedStats.mtimeMs / 1000) == Math.floor(sourceStats.mtimeMs / 1000);

            if (stagedStats.size == sourceStats.size && sameTime) {
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

module.exports = { LIST_FILE, sourceDirs, hasList, resolve, stage };
