const pfs = Object.assign(require('promise-fs'), {});
const path = require('./path');
const gulp = require('gulp');
const rename = require('gulp-rename');

// Returns an array of folders in dir, except the ones in second param
pfs.getModDirs = async function(dir, except) {
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
        gulp.src(sourceFile, { base: sourcePath.dir })
            .pipe(rename(p => {
                p.basename = destPath.name;
                p.extname = destPath.ext;
            }))
            .pipe(gulp.dest(destPath.dir))
            .on('error', reject)
            .on('end', resolve);
    });
};

module.exports = pfs;
