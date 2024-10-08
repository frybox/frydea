import { marked } from "marked";

const editor = document.getElementById("editor");
const log = document.getElementById("log");
const preview = document.getElementById("preview");

let cm = CodeMirror(editor, {
    value: "# Markdown 编辑器\n\n在这里输入你的 Markdown 文本...",
    mode: "markdown",
    theme: "monokai",
    lineNumbers: true,
    lineWrapping: true,
    autofocus: true,
    keyMap: "vim",
    extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-Enter": "run"
    }});

cm.on('change', function(cm, change) {
    const markdownText = cm.getValue();
    const htmlContent = marked(markdownText);
    preview.innerHTML = htmlContent;
});

let keyCount = 0;
let vimKeyCount = 0;
cm.on('vim-keypress', function(key) {
    vimKeyCount ++;
    let p = document.createElement("p");
    p.textContent = `v${vimKeyCount}: ${key}`;
    log.insertBefore(p, log.firstChild);
});
cm.on('keydown', function(key) {
    keyCount ++;
    let p = document.createElement("p");
    p.textContent = `k${keyCount}: ${key}`;
    log.insertBefore(p, log.firstChild);
    console.log(key);
});

/*
const autoRenderer = EditorView.updateListener.of((update) => {
    if (update.changes) {
        const markdownText = view.state.doc.toString();
        const htmlContent = marked(markdownText);
        preview.innerHTML = htmlContent;
    }
});

const logKey = EditorView.updateListener.of((update) => {
    updateCount ++;
    let p = document.createElement("p");
    p.textContent = `${updateCount}: ${update.changes}`;
    log.insertBefore(p, log.firstChild);
    console.log(update.changes);
});



const state = EditorState.create({
    doc: "# Markdown 编辑器\n\n在这里输入你的 Markdown 文本...",
    extensions: [vim(),
        basicSetup,
        markdown(),
        autoRenderer,
        logKey,
    ]
});

const view = new EditorView({
    state,
    parent: editor
});
*/
