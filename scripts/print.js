const cl = require('./cl');

function print(error, func) {
    if (!error.stack) {
        func.call(console, error.message ? error.message : error);
        return;
    }

    if (cl.get('debug')) {
        func.call(console, error.stack);
    }
    else {
        func.call(console, error.message);
    }
}

function printError(error) {
    print(error, console.error);
}

function printWarn(error) {
    print(error, console.warn);
}

function printLog(error) {
    print(error, console.log);
}

module.exports.error = printError;
module.exports.warn = printWarn;
module.exports.log = printLog;
