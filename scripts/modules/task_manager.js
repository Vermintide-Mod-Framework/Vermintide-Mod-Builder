
module.exports = function taskManager(tasks) {

    module.exports.addTask = addTask;
    module.exports.getCurrentTask = getCurrentTask;
    module.exports.runTask = runTask;

    init(tasks);

    return module.exports;
};


let tasks = {};

function init(tasks) {
    for (let taskName in tasks) {
        addTask(taskName, tasks[taskName]);
    }
}

// Adds a task to the tasks object
function addTask(name, action) {
    tasks[name] = action;
}

// Returns first task name specified in commandline arguments
function getCurrentTask(args) {
    let plainArgs = [];

    for (var i = 0; i < args.length; i++) {
        let taskName = args[i];
        let task = tasks[taskName];

        if (task) {

            for (var k = i + 1; k < args.length; k++) {
                plainArgs.push(args[k]);
            }

            return { taskName, plainArgs };
        }
    }

    return { taskName: '', plainArgs };
}

// Runs specified task
async function runTask(taskName, ...args) {
    return await tasks[taskName](...args);
}
