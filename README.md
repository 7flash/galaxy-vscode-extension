Galaxy VSCode Extension
A powerful VSCode extension designed to streamline your development workflow with advanced file management, diff application, and code prompting capabilities.

Description
The Galaxy VSCode Extension is a suite of tools built directly into your editor to handle common but complex tasks. Whether you need to view an entire directory at once, prepare a large codebase for an LLM prompt, or apply a patch file without dropping into the terminal, this extension has you covered. All operations are logged for easy debugging.

Features
📂 Open Folder in Panes: Instantly open every text file within a selected directory, each in its own separate editor pane. Perfect for getting a "full view" of a component or module.

📝 Run Prompter: Select a file and run the prompter to recursively expand all local file and directory paths mentioned within it. The tool intelligently packages the contents into a single, context-rich output, ready to be copied and pasted into a Large Language Model (LLM).

🔄 Apply Diff: Apply changes from a .diff or .patch file directly to your workspace. The extension handles path resolution and applies the changes, providing a summary of successful and failed hunks.

🪵 Robust Logging: Every command's execution is logged in detail to ~/.galaxy-vscode-extension/galaxy-vscode-extension.log. Notifications provide a convenient button to open the log file directly.

Installation
Open Visual Studio Code.

Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X).

Search for "Galaxy VSCode Extension".

Click Install.

Reload VS Code if prompted.

Usage & Commands
1. Open Folder Files in Panes
This command opens all text files in a directory in a grid of editor panes.

How to use:

Right-click on any folder in the VS Code Explorer.

Select "Open Folder Files in Panes" from the context menu.

Command Palette: > Galaxy: Open Folder Files in Panes

2. Run Prompter on Current File
This command processes the currently active file, finds all file/directory paths, and consolidates their content into the clipboard.

How to use:

Open the file you want to use as the source for the prompter.

Use the keybinding Ctrl+Alt+P (Cmd+Alt+P on macOS).

Alternatively, open the Command Palette (Ctrl+Shift+P) and run > Galaxy: Run Prompter on Current File.

A notification will confirm when the result has been copied to your clipboard.

3. Apply Diff from Current File
This command applies a patch from the currently active .diff or .patch file.

How to use:

Open the .diff or .patch file.

Use the keybinding Ctrl+Alt+D (Cmd+Alt+D on macOS).

Alternatively, open the Command Palette (Ctrl+Shift+P) and run > Galaxy: Apply Diff from Current File.

A summary of the operation will appear in the notifications, and detailed logs will be available in the log file.

Development
To get started with developing the extension locally:

Clone the repository.

Run npm install to install dependencies.

Open the project in VS Code.

Press F5 to open a new Extension Development Host window with the extension running.

License
MIT