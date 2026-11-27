const fs = require('fs');

const path = require('../lib/path');

// Gives the compiler only the files a mod uses from the folders in map_source_dirs.
// The compiler compiles everything in its source folder, and the game's folders are most of the game,
// so instead the mod's own files, the files they refer to, and the files those refer to in turn are copied
// to a staging folder in the mod's temp folder, and the mod is compiled from there.
// The references are read from the files' text, as the compiler reads them. The compiler's dependency database
// (dependency_database.db) can't be used instead: it lists what the game loads, not what the compiler reads,
// such as texture categories, shader nodes, or a unit built from another unit's mesh.
// An entry can also name a file in the top folder, such as global.script_flow_nodes, which is always copied:
// the compiler only reads top-level files from its source folder.
// The files found are written to LIST_FILE in the mod's folder, one path per line, so that what the mod takes from
// the game can be seen and kept with it. With --no-resolve-deps the build copies the files in that list instead of
// finding them again.

const LIST_FILE = 'mapped_sources.txt';

// Files that are never read for references: binary data, and big plain-text meshes
const BINARY_EXTENSIONS = [
    '.dds', '.png', '.jpg', '.tga', '.wav', '.ogg', '.wem', '.bnk', '.ivf', '.navdata', '.tome',
    '.umbrascene', '.mod_bundle', '.dmp', '.bsiz', '.ttf', '.otf'
];
const MAX_TEXT_FILE_SIZE = 8 * 1024 * 1024;

// A resource path in quotes, as text resources write them: "units/props/barrel_01"
const REFERENCE_PATTERN = /"([A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_.\-]+)+)"/g;

// Copies modDir's files and the files it uses from mapSourceDirs into stagingDir,
// and removes staged files it no longer uses. skippedDirs are the absolute paths of the mod's folders that are not compiled,
// such as its bundle folders. With resolve false, the files it uses are the ones in its LIST_FILE.
function stage(modDir, stagingDir, mapSourceDirs, skippedDirs, resolve) {

    let listings = new Map();
    let needed = new Map(); // staged relative path -> source file
    let listFile = path.combine(modDir, LIST_FILE);

    // The mod's own files
    let modFiles = _allFilesIn(modDir, skippedDirs.map(dir => path.fix(dir))).filter(file => file != listFile);
    for (let file of modFiles) {
        needed.set(_relative(modDir, file), file);
    }

    // Top-level files named in map_source_dirs
    let folders = [];
    for (let entry of mapSourceDirs) {
        let file = path.combine(entry.dir, entry.name);

        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            needed.set(entry.name, file);
        }
        else {
            folders.push(entry);
        }
    }

    let mapped = resolve ? _filesUsed(modFiles, folders, listings) : _filesListed(listFile, folders);

    for (let [relative, file] of mapped) {
        needed.set(relative, file);
    }

    if (resolve) {
        let lines = Array.from(mapped.keys()).sort();
        fs.writeFileSync(listFile, lines.join('\n') + '\n');
    }

    _copyNeeded(needed, stagingDir);
    _removeUnneeded(needed, stagingDir);
}

// The files the mod's files refer to in the mapped folders, the files those refer to, and so on:
// staged relative path -> source file
function _filesUsed(modFiles, folders, listings) {
    let mapped = new Map();
    let queue = modFiles.filter(_isText);

    while (queue.length > 0) {
        let file = queue.pop();

        for (let reference of _referencesIn(file)) {

            for (let source of _filesFor(reference, folders, listings)) {

                if (mapped.has(source.relative)) {
                    continue;
                }

                mapped.set(source.relative, source.file);

                if (_isText(source.file)) {
                    queue.push(source.file);
                }
            }
        }
    }

    return mapped;
}

// The files in the mod's list: staged relative path -> source file
function _filesListed(listFile, folders) {

    if (!fs.existsSync(listFile)) {
        throw new Error(`"${listFile}" not found. Build without --no-resolve-deps first to make it.`);
    }

    let mapped = new Map();

    for (let relative of fs.readFileSync(listFile, 'utf8').split(/\r?\n/)) {
        if (!relative) {
            continue;
        }

        let mapping = folders.find(({ name }) => relative.startsWith(name + '/'));
        let file = mapping && path.combine(mapping.dir, relative);

        if (!file || !fs.existsSync(file)) {
            throw new Error(`"${relative}" in "${listFile}" is not in the folders of map_source_dirs`);
        }

        mapped.set(relative, file);
    }

    return mapped;
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

// The files a resource path names in the mapped folders: every file in its folder with that name,
// whatever the extension, as a unit's .unit, .bsi and .physics or a texture's .texture and .dds
function _filesFor(reference, mapSourceDirs, listings) {

    let mapping = mapSourceDirs.find(({ name }) => reference.startsWith(name + '/'));

    if (!mapping) {
        return [];
    }

    let relativeDir = path.dirname(reference);
    let wantedName = path.basename(reference);
    let sourceDir = path.combine(mapping.dir, relativeDir);

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

module.exports = { stage, LIST_FILE };
