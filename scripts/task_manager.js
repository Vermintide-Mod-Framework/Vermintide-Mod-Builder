let taskManager = {

    init(tasks) {
        taskManager.tasks = {};

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
    async runTask(taskName) {
        return await taskManager.tasks[taskName]();
    }
};

module.exports = taskManager;
