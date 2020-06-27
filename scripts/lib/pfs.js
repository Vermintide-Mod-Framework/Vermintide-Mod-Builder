const path = require('./path');
const vinyl = require('vinyl-fs');
const rename = require('gulp-rename');
const fs = require('fs');
const promisify = require('@octetstream/promisify');

let names = ['access', 'readFile', 'writeFile', 'close', 'open', 'read', 'write', 'rename', 'rmdir', 'mkdir', 'readdir', 'stat', 'lstat', 'fstat', 'appendFile', 'realpath', 'link', 'symlink', 'unlink', 'readlink', 'chmod', 'fchmod', 'chown', 'fchown', 'lchown', 'fsync', 'utimes', 'futimes', 'ftruncate', 'copyFile'];

let pfs = promisify.some(fs, names);

pfs.getFileNames = async function (dir, except) {
    let fileNames = [];

    for (let fileName of await pfs.readdir(dir)) {

        if (except && except.includes(fileName)) {
            continue;
        }

        let fileStats = await pfs.stat(path.combine(dir, fileName));

        if (!fileStats.isDirectory()) {
            fileNames.push(fileName);
        }
    }

    return fileNames;
};

// Returns an array of folders in dir, except the ones in second param
pfs.getDirs = async function(dir, except) {
    let dirs = [];

    for (let fileName of await pfs.readdir(dir)) {

        if (except && except.includes(fileName)) {
            continue;
        }

        let fileStats = await pfs.stat(path.combine(dir, fileName));

        if (fileStats.isDirectory()) {
            dirs.push(fileName);
        }
    }

    return dirs;
};

// Returns if file can be accessed
pfs.accessible = async function (file) {
    try {
        await pfs.access(file);
        return true;
    }
    catch (err) {
        return false;
    }
};

pfs.accessibleFile = async function (file) {
    return await pfs.accessibleFileOrDir(file, false);
};

pfs.accessibleDir = async function (file) {
    return await pfs.accessibleFileOrDir(file, true);
};

pfs.accessibleFileOrDir = async function (file, isDir) {

    try {
        let stats = await pfs.stat(file);
        if(isDir) {
            return stats.isDirectory();
        }
        else {
            return stats.isFile();
        }
    }
    catch (err) {
        return false;
    }
};

// Safely deletes file or directory
pfs.deleteFile = async function (dir, file) {
    let filePath = path.combine(dir, file);
    let stats = await pfs.lstat(filePath);
    if (stats.isDirectory()) {
        return pfs.deleteDirectory(filePath);
    }
    else {
        try {
            await pfs.unlink(filePath);
        }
        catch (err) { }
    }
};

// Recursively and safely deletes directory
pfs.deleteDirectory = async function (dir) {
    await pfs.access(dir);
    let files = await pfs.readdir(dir);
    await Promise.all(files.map(file => {
        return pfs.deleteFile(dir, file);
    }));
    await pfs.rmdir(dir);
};

// Copy sourceFile to destFile if it doesn't exist
pfs.copyIfDoesntExist = async function (sourceFile, destFile) {
    let sourcePath = path.parse(sourceFile);
    let destPath = path.parse(destFile);

    if (await pfs.accessible(destFile)) {
        return;
    }

    return await new Promise((resolve, reject) => {
        vinyl.src(sourceFile, { base: sourcePath.dir })
            .pipe(rename(p => {
                p.basename = destPath.name;
                p.extname = destPath.ext;
            }))
            .pipe(vinyl.dest(destPath.dir))
            .on('error', reject)
            .on('end', resolve);
    });
};

pfs.copyFile = async function (sourceFile, destFile) {
    return await new Promise((resolve, reject) => {
        fs.createReadStream(sourceFile)
            .on('error', reject)
            .pipe(fs.createWriteStream(destFile))
            .on('error', reject)
            .on('close', () => {
                resolve();
            });
    });
};

module.exports = pfs;
