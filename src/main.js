import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";

const editor = document.getElementById("editor");
const preview = document.getElementById("preview");

const state = EditorState.create({
    doc: "# Markdown 编辑器\n\n在这里输入你的 Markdown 文本...",
    extensions: [basicSetup, markdown()]
});

const view = new EditorView({
    state,
    parent: editor
});

// 实时更新预览
//view.on('update', () => {
//    const markdownText = view.state.doc.toString();
//    preview.innerHTML = marked(markdownText);
//});
view.dispatch({
    effects: EditorView.updateListener.of((update) => {
        if (update.changes) {
            const markdownText = view.state.doc.toString();
            const htmlContent = marked(markdownText);
            preview.innerHTML = htmlContent;
        }
    })
});

// 加载 marked.js 进行 Markdown 转换
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/2.1.3/marked.min.js';
document.head.appendChild(script);