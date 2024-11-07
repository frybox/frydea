
import { signal } from "fryhcs";
import { Vim } from "@replit/codemirror-vim";

Vim.defineAction('toCardMode', (cm, args) => {
  // 将焦点从CM编辑器挪到EditorCard元素身上
  // TODO 当前这种直接假定EditorCard DOM树结构的办法不太完美
  cm.cm6.dom.parentElement.parentElement.focus();
});
Vim.mapCommand('<Esc>', 'action', 'toCardMode', {}, {context: 'normal'});

const cards = {};

const setCard = (card) => {
  const { number, createTime, content, version, updateTime } = card;
  let card1;
  if ( number in cards ) {
    card1 = cards[id];
    card1.content.value = content;
    card1.last_content = content;
    card1.last_version = version;
    card1.updateTime = updateTime;
  } else {
    card1 = cards[id] = {
          id,
          number,
          createTime,
          content: signal(content),
          last_content: content,
          last_version: version,
          updateTime,
    }
  }
  return card1;
}

const getCard = (cardId) => {
  if ( cardId in cards ) {
     return cards[cardId];
  }
}

export {
  setCard,
  getCard,
}