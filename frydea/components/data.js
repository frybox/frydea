
import { signal } from "fryhcs";

const cards = {};

const setCard = (card) => {
  const { id, number, createTime, content, version, updateTime } = card;
  let card1;
  if ( id in cards ) {
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