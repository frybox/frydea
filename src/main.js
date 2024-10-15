import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { marked } from "marked";
import { vim } from "@replit/codemirror-vim";

const editor = document.getElementById("editor");
const preview = document.getElementById("preview");

const autoRenderer = EditorView.updateListener.of((update) => {
    if (update.changes) {
        const markdownText = view.state.doc.toString();
        const htmlContent = marked(markdownText);
        preview.innerHTML = htmlContent;
    }
});

const logKey = EditorView.updateListener.of((update) => {
    console.log('------------------------');
    console.log(update.view.state.selection.main);
    console.log(update.view.observer.editContext.editContext);
});

const state = EditorState.create({
    doc: "1\n2\n3\n4\n5\n6\n7\n8\n9\n0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0",
    extensions: [
        vim(),
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

view.focus();