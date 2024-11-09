import { signal, computed } from "fryhcs";
import { Vim } from "@replit/codemirror-vim";
import dayjs from "dayjs";

Vim.defineAction('toCardMode', (cm, args) => {
  // 将焦点从CM编辑器挪到EditorCard元素身上
  // TODO 当前这种直接假定EditorCard DOM树结构的办法不太完美
  cm.cm6.dom.parentElement.parentElement.focus();
});
Vim.mapCommand('<Esc>', 'action', 'toCardMode', {}, {context: 'normal'});

const cards = [];
const cardMap = {};

const getTime = (updateTime) => dayjs(updateTime).format('YYYY-MM-DD HH:mm');

class CardModel {
  constructor(card) {
    const {number='', content='', version=0, updateTime=new Date()} = card;
    this.number = signal(version ? number : '');
    this.content = signal(content);
    this.updateTime = signal(getTime(updateTime));
    this.serverContent = version ? content : '';
    this.serverVersion = version;
    this.isDirty = computed(() => this.serverVersion === 0 || this.serverContent !== this.content.value);
  
  }

  // 从UI更新卡片内容到模型中，导致该模型变脏，需要调用save()保存到服务器上
  update(card) {
    const { content, updateTime=new Date() } = card;
    this.content.value = content;
    this.updateTime.value = getTime(updateTime);
  }

  // 从服务器更新卡片内容到模型中，会刷新模型内容，让模型变干净
  async load() {
    await this.fetch(true);
  }

  // 从服务器更新卡片内容到模型中，如果flush为false，则只是将
  // 服务器中的内容保存下来，不会修改真正模型的内容，有可能导致模型变脏。
  async fetch(flush=false) {
    const number = this.number.peek();
    if (!number) {
      throw `Can't fetch for unsaved card`
    }
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/cards/${number}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.code === 0) {
      this.serverUpdate(result.card, flush);
    }
  }

  // 将模型内容保存到服务器，如果是新建模型，在服务器新建卡片，
  // 如果是已有模型，更新服务器卡片的内容。
  async save() {
    if (!this.isDirty.peek())
      return;
    const baseUrl = window.location.origin;
    const content = this.content.peek();
    const number = this.number.peek();
    if (number) {
      const url = baseUrl + `/cards/${number}`;
      const data = {
        content,
        last_version: this.serverVersion,
      }
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.code === 0) {
        console.log('server updated');
        this.serverUpdate(result.card);
      } else {
        console.log(result.msg);
      }
    } else {
      const url = baseUrl + '/cards';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({content}),
      });
      const result = await response.json();
      if (result.code === 0) {
        console.log('server created');
        this.serverUpdate(result.card);
      } else {
        console.log(result.msg);
      }
    }
  }

  // 内部方法，load/fetch/save时，根据服务器响应修改模型内容
  serverUpdate(card, flush=false) {
    const { number, content, version, updateTime } = card;
    this.number.value = number;
    this.serverVersion = version;
    this.serverContent = content;
    if (flush) {
      this.content.value = content;
      this.updateTime.value = getTime(updateTime);
    }
  }
}

const createCardModel = (card) => {
  const { number, version } = card;
  let card1;
  if (version === 0 || !(number in cardMap)) {
    // 新卡片
    card1 = new CardModel(card);
    cards.push(card1);
    if (number) cardMap[number] = card1;
  } else {
    // 已有卡片模型，无法创建
    throw `card ${number} exists`;
  }
  return card1;
}

const getCardModel = (number) => {
  return cardMap[number];
}

export {
  createCardModel,
  getCardModel,
}