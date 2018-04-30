
const setupCleanup = require('node-cleanup');

let taskManager = {

    tasks: {},

    finished: false,

    init(tasks) {
        setupCleanup(checkTaskFinished);
        for(let taskName in tasks) {
            taskManager.addTask(taskName, tasks[taskName]);
        }
    },

    // Adds a task to the tasks object
    addTask(name, action) {
        taskManager.tasks[name] = action;
    },

    // Returns first task specified in commandline arguments
    getCurrentTask(args) {
        let plainArgs = [];
        for (var i = 0; i < args.length; i++) {
            let taskName = args[i];
            let task = taskManager.tasks[taskName];
            if (task) {
                for (var k = i + 1; k < args.length; k++) {
                    plainArgs.push(args[k]);
                }
                return { taskName, plainArgs };
            }
        }
        return { taskName: 'default', plainArgs };
    },

    // Runs specified task
    async runTask(taskName, args, plainArgs) {
        await taskManager.tasks[taskName](callback, args, plainArgs);
    }
};

 // This will be called at the end of tasks
function callback(exitCode = 0, shouldExit = true) {
    taskManager.finished = true;
    if (shouldExit) {
        process.exit(exitCode);
    }
}

// Checks if the callback function has been called from a task and exits if it hasn't
function checkTaskFinished(code) {
    if (!taskManager.finished) {
        console.error(`\nProgram exited prematurely`);
        process.exit(2);
    }
}

module.exports = taskManager;
