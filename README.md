# 🚀 Galaxy VSCode Extension

[![VS Code Marketplace](https://img.shields.io/badge/Marketplace-Galaxy%20Extension-blue?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

A powerful VSCode extension designed to streamline your development workflow with advanced file management, diff application, and code prompting capabilities.

---

## Table of Contents

- [Description](#description)
- [Key Features](#key-features)
- [Commands & Keybindings](#commands--keybindings)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
  - [📂 Open Folder in Panes](#-open-folder-in-panes)
  - [📝 Run Prompter on Current File](#-run-prompter-on-current-file)
  - [🔄 Apply Diff from Current File](#-apply-diff-from-current-file)
- [Logging](#logging)
- [Development](#development)
- [License](#license)

---

## Description

The Galaxy VSCode Extension is a suite of tools built directly into your editor to handle common but complex tasks. Whether you need to view an entire directory at once, prepare a large codebase for an LLM prompt, or apply a patch file without dropping into the terminal, this extension has you covered.

## Key Features

* **📂 Full Project View**: Instantly open every text file within a selected directory, each in its own separate editor pane. Perfect for getting a "full view" of a component or module.
* **🤖 LLM-Ready Prompts**: Select a file and run the prompter to recursively expand all local file and directory paths mentioned within it. The tool intelligently packages the contents into a single, context-rich output, ready for any Large Language Model.
* **🔄 Seamless Patching**: Apply changes from a `.diff` or `.patch` file directly to your workspace. The extension handles path resolution and provides a clear summary of successful and failed hunks.
* **🪵 Robust Logging**: Every command's execution is logged in detail for easy debugging and verification.

---

## Commands & Keybindings

Here is a summary of the commands provided by the Galaxy Extension:

| Command                         | Description                               | Default Keybinding (Win/Linux) | Default Keybinding (macOS) |
| ------------------------------- | ----------------------------------------- | ------------------------------ | -------------------------- |
| `Open Folder Files in Panes`    | Opens all files in a folder in panes.     | *None* (Use context menu)      | *None* (Use context menu)  |
| `Run Prompter on Current File`  | Generates LLM prompt from active file.    | `Ctrl+Alt+P`                   | `Cmd+Alt+P`                |
| `Apply Diff from Current File`  | Applies patch from the active diff file.  | `Ctrl+Alt+D`                   | `Cmd+Alt+D`                |
| `Test Notifications`            | Displays test notifications and logs.     | *None* | *None* |

---

## Installation

1.  Open **Visual Studio Code**.
2.  Navigate to the **Extensions** view ( `Ctrl+Shift+X` or `Cmd+Shift+X` ).
3.  Search for `Galaxy VSCode Extension`.
4.  Click **Install**.
5.  Reload VS Code if prompted.

---

## Usage Guide

### 📂 Open Folder in Panes

This command gives you an immediate, comprehensive view of a directory's contents.

* **How to use**:
    1.  In the VS Code Explorer, **right-click** on any folder.
    2.  Select **"Open Folder Files in Panes"** from the context menu.

*(Placeholder for a GIF demonstrating the "Open Folder in Panes" feature)*
![Demo GIF for Open Folder](https://placehold.co/600x300/2d333b/ffffff?text=Demo+GIF+Here)

### 📝 Run Prompter on Current File

Prepares a detailed prompt for an LLM by consolidating all referenced files and directories.

* **How to use**:
    1.  Open the file you want to use as the source for the prompter. This file should contain paths to other files/directories (e.g., `./src/component.js`, `$HOME/config/setup.sh`).
    2.  Press **`Ctrl+Alt+P`** (or **`Cmd+Alt+P`** on macOS).
    3.  Alternatively, open the Command Palette (`Ctrl+Shift+P`) and run:
        ```
        > Galaxy: Run Prompter on Current File
        ```
    4.  A notification will confirm when the complete, expanded text has been copied to your clipboard.

*(Placeholder for a GIF demonstrating the "Run Prompter" feature)*
![Demo GIF for Run Prompter](https://placehold.co/600x300/2d333b/ffffff?text=Demo+GIF+Here)

### 🔄 Apply Diff from Current File

Applies a patch to your local files without leaving the editor.

* **How to use**:
    1.  Open the `.diff` or `.patch` file in the editor.
    2.  Press **`Ctrl+Alt+D`** (or **`Cmd+Alt+D`** on macOS).
    3.  Alternatively, open the Command Palette (`Ctrl+Shift+P`) and run:
        ```
        > Galaxy: Apply Diff from Current File
        ```
    4.  A summary of the operation will appear in the notifications. Check the logs for a detailed breakdown.

*(Placeholder for a GIF demonstrating the "Apply Diff" feature)*
![Demo GIF for Apply Diff](https://placehold.co/600x300/2d333b/ffffff?text=Demo+GIF+Here)

---

## Logging

For debugging or verification, all extension activities are logged to a file in your home directory.

* **Log File Location**: `~/.galaxy-vscode-extension/galaxy-vscode-extension.log`

Notifications for most operations include an **"Open Log File"** button for quick access.

---

## Development

Interested in contributing?

1.  Clone the repository: `git clone <repository-url>`
2.  Install dependencies: `npm install`
3.  Open the project folder in VS Code.
4.  Press **`F5`** to launch the Extension Development Host window. This new window will have the Galaxy extension running, and you can test your changes in real-time.

---

## License

This project is licensed under the [MIT License](./LICENSE).
