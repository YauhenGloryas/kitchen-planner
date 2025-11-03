class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 30;
    }

    /**
     * @param {object} command - Объект команды.
     * @param {boolean} [actionAlreadyDone=false] - Если true, метод execute() команды не будет вызван.
     */
    execute(command, actionAlreadyDone = false) {
        if (!actionAlreadyDone) {
            command.execute(); // Выполняем действие, только если оно еще не было выполнено
        }
        
        this.undoStack.push(command);
        this.redoStack = [];
        
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        console.log(`[History] Executed: ${command.constructor.name}. Undo stack size: ${this.undoStack.length}`);
    }

    undo() {
        if (this.undoStack.length === 0) {
            console.log("[History] Undo stack is empty.");
            return;
        }
        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);
        console.log(`[History] Undone: ${command.constructor.name}. Redo stack size: ${this.redoStack.length}`);
    }

    redo() {
        if (this.redoStack.length === 0) {
            console.log("[History] Redo stack is empty.");
            return;
        }
        const command = this.redoStack.pop();
        command.execute();
        this.undoStack.push(command);
        console.log(`[History] Redone: ${command.constructor.name}. Undo stack size: ${this.undoStack.length}`);
    }
}

export const historyManager = new HistoryManager();