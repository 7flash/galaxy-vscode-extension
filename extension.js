const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DiffApplier } = require('./applyDiff');
const { runPrompter } = require('./prompter');

/**
 * A helper function to introduce a short delay.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// A set of common text-based file extensions to filter for.
const textFileExtensions = new Set([
    '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts', '.py', 
    '.java', '.c', '.cpp', '.h', '.cs', '.go', '.php', '.rb', '.rs', '.sh',
    '.ps1', '.bat', '.sql', '.yaml', '.yml', '.ini', '.toml', '.cfg'
]);

/**
 * Recursively finds all text file URIs in a given folder URI.
 * @param {vscode.Uri} folderUri The URI of the folder to start searching from.
 * @param {Function} logToFile A function to log messages.
 * @returns {Promise<vscode.Uri[]>} A promise that resolves to an array of file URIs.
 */
async function getAllFileUris(folderUri, logToFile) {
    logToFile(`Starting file search in: ${folderUri.fsPath}`);
    const files = [];
    const queue = [folderUri];
    let directoriesScanned = 0;
    
    while (queue.length > 0) {
        const currentUri = queue.shift();
        if (!currentUri) continue;
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(currentUri);
            directoriesScanned++;
            logToFile(`Scanning directory (${directoriesScanned}): ${currentUri.fsPath} - Found ${entries.length} entries`);
            
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(currentUri, name);
                if (type === vscode.FileType.File) {
                    const ext = path.extname(name).toLowerCase();
                    if (textFileExtensions.has(ext)) {
                        files.push(entryUri);
                        logToFile(`  + Added text file: ${name}`);
                    } else {
                        logToFile(`  - Skipped non-text file: ${name} (extension: ${ext})`);
                    }
                } else if (type === vscode.FileType.Directory) {
                    queue.push(entryUri);
                    logToFile(`  → Queued directory: ${name}`);
                }
            }
        } catch (error) {
            logToFile(`ERROR: Failed to read directory ${currentUri.fsPath}`, error);
        }
    }
    
    logToFile(`File search complete. Found ${files.length} text files across ${directoriesScanned} directories`);
    return files;
}

/**
 * Shows a notification with an option to open the log file
 * @param {string} message The message to show
 * @param {string} type 'info', 'warning', or 'error'
 * @param {string} logFilePath Path to the log file
 */
async function showNotificationWithLog(message, type, logFilePath) {
    const action = 'Open Log File';
    let result;
    
    switch (type) {
        case 'error':
            result = await vscode.window.showErrorMessage(message, action);
            break;
        case 'warning':
            result = await vscode.window.showWarningMessage(message, action);
            break;
        default:
            result = await vscode.window.showInformationMessage(message, action);
    }
    
    if (result === action) {
        const doc = await vscode.workspace.openTextDocument(logFilePath);
        await vscode.window.showTextDocument(doc);
    }
}

/**
 * This method is called when your extension is activated.
 * @param {vscode.ExtensionContext} context - Provided by VS Code, contains extension-specific utilities and paths.
 */
async function activate(context) {
    // Setup logging
    const logDirectory = path.join(os.homedir(), '.galaxy-vscode-extension');
    if (!fs.existsSync(logDirectory)) {
        try { 
            fs.mkdirSync(logDirectory, { recursive: true }); 
            console.log(`Created log directory: ${logDirectory}`);
        } catch (e) { 
            console.error("Failed to create log directory:", e);
            vscode.window.showErrorMessage(`Failed to create log directory: ${e.message}`);
        }
    }
    
    const logFilePath = path.join(logDirectory, 'galaxy-vscode-extension.log');
    
    // Clear log file on extension activation
    try {
        fs.writeFileSync(logFilePath, `=== Extension Activated at ${new Date().toISOString()} ===\n`);
        console.log(`Log file initialized: ${logFilePath}`);
    } catch (e) {
        console.error('Failed to initialize log file:', e);
    }
    
    const logToFile = (message, data) => {
        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] ${message}`;
        
        if (data instanceof Error) {
            logMessage += `\n  ERROR Details:`;
            logMessage += `\n    Message: ${data.message}`;
            if (data.stdout) logMessage += `\n  STDOUT: ${data.stdout}`;
            if (data.stderr) logMessage += `\n  STDERR: ${data.stderr}`;
            logMessage += `\n    Stack: ${data.stack}`;
        } else if (data !== undefined && data !== null) {
            if (typeof data === 'object') {
                logMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
            } else {
                logMessage += ` | Data: ${data}`;
            }
        }
 
        try { 
            fs.appendFileSync(logFilePath, logMessage + '\n', 'utf8');
            console.log(message, data || ''); // Also log to console for debugging
        } catch (e) { 
            console.error('Failed to write to log file:', e);
        }
    };

    // Log extension activation
    logToFile('Extension "Galaxy VSCode Extension" successfully activated');
    logToFile(`Log file location: ${logFilePath}`);
    logToFile(`Platform: ${process.platform}, VS Code Version: ${vscode.version}`);
    
    // Show activation notification with a slight delay to ensure it's visible
    setTimeout(() => {
        showNotificationWithLog(
            `✅ Galaxy VSCode Extension activated! Logs: ${path.basename(logFilePath)}`,
            'info',
            logFilePath
        );
    }, 500);

    // Command to open each file from a folder in separate panes
    let openFolderCommand = vscode.commands.registerCommand('extension.openFolderInPanes', async (folderUri) => {
        const startTime = Date.now();
        logToFile('========================================');
        logToFile('COMMAND: openFolderInPanes - Started');
        
        if (!folderUri) {
            const message = 'No folder selected. Right-click on a folder in Explorer.';
            logToFile(`ERROR: ${message}`);
            vscode.window.showErrorMessage(message);
            return;
        }
        
        logToFile(`Target folder: ${folderUri.fsPath}`);
        
        try {
            // Get all text files
            const allFiles = await getAllFileUris(folderUri, logToFile);
            if (allFiles.length === 0) {
                const message = `No text files found in: ${folderUri.fsPath}`;
                logToFile(`WARNING: ${message}`);
                await showNotificationWithLog(message, 'warning', logFilePath);
                return;
            }
            
            logToFile(`Processing ${allFiles.length} files for pane layout`);
            
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Opening ${allFiles.length} files in separate panes...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                // Start with a clean single pane layout
                logToFile('Resetting to single pane layout');
                await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
                await wait(250);
                
                // Open first file
                logToFile(`Opening file 1/${allFiles.length}: ${allFiles[0].fsPath}`);
                await vscode.window.showTextDocument(allFiles[0], { preview: false });
                await wait(200);
                progress.report({ increment: (1 / allFiles.length) * 100 });
                
                // Open remaining files in new panes
                for (let i = 1; i < allFiles.length; i++) {
                    logToFile(`Opening file ${i + 1}/${allFiles.length}: ${allFiles[i].fsPath}`);
                    
                    // Split editor to create new pane
                    await vscode.commands.executeCommand('workbench.action.splitEditor');
                    await wait(200);
                    
                    // Open file in the new pane
                    await vscode.window.showTextDocument(allFiles[i], { preview: false });
                    await wait(100);
                    
                    progress.report({ increment: ((i + 1) / allFiles.length) * 100 });
                }
                
                // Focus back on first editor group
                logToFile('Focusing first editor group');
                await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
            });
            
            const duration = Date.now() - startTime;
            logToFile(`SUCCESS: Opened ${allFiles.length} files in ${duration}ms`);
            
            await showNotificationWithLog(
                `Successfully opened ${allFiles.length} files in separate panes (${duration}ms)`,
                'info',
                logFilePath
            );
            
        } catch (error) {
            logToFile(`FATAL ERROR in openFolderInPanes:`, error);
            await showNotificationWithLog(
                `Error opening folder: ${error.message}. Check logs for details.`,
                'error',
                logFilePath
            );
        }
        
        logToFile('COMMAND: openFolderInPanes - Completed');
        logToFile('========================================');
    });

    // Command to run prompter on current file and copy result to clipboard
    let runPrompterCommand = vscode.commands.registerCommand('extension.runPrompter', async () => {
        const startTime = Date.now();
        logToFile('========================================');
        logToFile('COMMAND: runPrompter - Started');
        
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            const message = 'No active editor found. Please open a file first.';
            logToFile(`ERROR: ${message}`);
            vscode.window.showErrorMessage(message);
            return;
        }

        const document = activeEditor.document;
        const filePath = document.fileName;
        logToFile(`Target file: ${filePath}`);

        try {
            // Save the file if it has unsaved changes
            if (document.isDirty) {
                logToFile('File has unsaved changes, saving...');
                await document.save();
                logToFile('File saved successfully');
            }

            let resolvedContent;
            // Show progress notification
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Running prompter...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Processing file references..." });
                logToFile(`Processing prompter for: ${filePath}`);

                // Call the local function directly, no child process
                resolvedContent = runPrompter(filePath, path.dirname(filePath));
                logToFile(`Prompter processed content: ${resolvedContent.length} characters`);

                progress.report({ increment: 50, message: "Copying to clipboard..." });
                // Copy to clipboard
                await vscode.env.clipboard.writeText(resolvedContent);
                logToFile('Content copied to clipboard successfully');

                progress.report({ increment: 100, message: "Done." });
            });

            const duration = Date.now() - startTime;
            logToFile(`SUCCESS: Prompter completed in ${duration}ms`);

            // Show success notification AFTER progress completes
            setTimeout(() => {
                showNotificationWithLog(
                    `✅ Prompter result copied to clipboard! (${duration}ms)`,
                    'info',
                    logFilePath
                );
            }, 100);

        } catch (error) {
            logToFile('FATAL ERROR in runPrompter:', error);

            // Show error notification AFTER progress completes
            setTimeout(() => {
                showNotificationWithLog(
                    `❌ Prompter error: ${error.message}`,
                    'error',
                    logFilePath
                );
            }, 100);
        }
        logToFile('COMMAND: runPrompter - Completed');
        logToFile('========================================');
    });

    // Command to apply diff from current file
    let applyDiffCommand = vscode.commands.registerCommand('extension.applyDiff', async () => {
        const startTime = Date.now();
        logToFile('========================================');
        logToFile('COMMAND: applyDiff - Started');

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            const message = 'No active editor found. Please open a diff file first.';
            logToFile(`ERROR: ${message}`);
            vscode.window.showErrorMessage(message);
            return;
        }

        const document = activeEditor.document;
        const diffFilePath = document.fileName;

        logToFile(`Diff file: ${diffFilePath}`);
        
        try {
            // Save the file if it has unsaved changes
            if (document.isDirty) {
                logToFile('Diff file has unsaved changes, saving...');
                await document.save();
                logToFile('Diff file saved successfully');
            }
            
            // Check if file exists
            if (!fs.existsSync(diffFilePath)) {
                throw new Error(`Diff file not found: ${diffFilePath}`);
            }
            
            // Show progress notification
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Applying diff from ${path.basename(diffFilePath)}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Processing diff..." });
                
                // Create and use DiffApplier directly
                const applier = new DiffApplier();
                
                try {
                    // Redirect console output to our log
                    const originalLog = console.log;
                    const originalError = console.error;

                    console.log = (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                        ).join(' ');
                        logToFile(`DiffApplier: ${message}`);
                    };

                    console.error = (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                        ).join(' ');
                        logToFile(`DiffApplier ERROR: ${message}`);
                    };

                    // Apply the diff
                    applier.applyDiff(diffFilePath);

                    // Restore original console methods
                    console.log = originalLog;
                    console.error = originalError;

                    logToFile('Diff application completed successfully');
                    progress.report({ increment: 100 });

                } catch (error) {
                    logToFile('ERROR applying diff:', error);
                    throw new Error(`Failed to apply diff: ${error.message}`);
                }
            });
            
            const duration = Date.now() - startTime;
            logToFile(`SUCCESS: Diff applied in ${duration}ms`);
            
            await showNotificationWithLog(
                `✅ Diff applied successfully! (${duration}ms)`,
                'info',
                logFilePath
            );
            
        } catch (error) {
            logToFile('FATAL ERROR in applyDiff:', error);
            await showNotificationWithLog(
                `❌ Diff application error: ${error.message}`,
                'error',
                logFilePath
            );
        }
        
        logToFile('COMMAND: applyDiff - Completed');
        logToFile('========================================');
    });

    // Test command to verify notifications are working
    let testNotificationsCommand = vscode.commands.registerCommand('extension.testNotifications', async () => {
        logToFile('========================================');
        logToFile('COMMAND: testNotifications - Started');
        
        // Test different notification types
        vscode.window.showInformationMessage('ℹ️ This is an info notification');
        
        setTimeout(() => {
            vscode.window.showWarningMessage('⚠️ This is a warning notification');
        }, 1000);
        
        setTimeout(() => {
            vscode.window.showErrorMessage('❌ This is an error notification');
        }, 2000);
        
        setTimeout(async () => {
            await showNotificationWithLog(
                '📋 This notification has a log file button',
                'info',
                logFilePath
            );
        }, 3000);
        
        logToFile('Test notifications sent');
        logToFile('COMMAND: testNotifications - Completed');
        logToFile('========================================');
    });

    // Register commands
    context.subscriptions.push(openFolderCommand, runPrompterCommand, applyDiffCommand, testNotificationsCommand);
    
    logToFile(`Registered ${context.subscriptions.length} commands`);
}

// This method is called when your extension is deactivated
function deactivate() {
    console.log('Extension "Galaxy VSCode Extension" deactivated');
}

module.exports = {
    activate,
    deactivate
}