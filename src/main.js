import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { marked } from "marked";
import { vim } from "@replit/codemirror-vim";

const editor = document.getElementById("editor");
const preview = document.getElementById("preview");

const state = EditorState.create({
    doc: "# Markdown 编辑器\n\n在这里输入你的 Markdown 文本...",
    extensions: [vim(), basicSetup, markdown(),
        EditorView.updateListener.of((update) => {
            if (update.changes) {
                const markdownText = view.state.doc.toString();
                const htmlContent = marked(markdownText);
                preview.innerHTML = htmlContent;
            }
        })
    ]
});

const view = new EditorView({
    state,
    parent: editor
});

