import { signal, computed } from "fryhcs";
import { Vim } from "@replit/codemirror-vim";
import dayjs from "dayjs";

Vim.defineAction('toCardMode', (cm, args) => {
  // 将焦点从CM编辑器挪到EditorCard元素身上
  // TODO 当前这种直接假定EditorCard DOM树结构的办法不太完美
  cm.cm6.dom.parentElement.parentElement.focus();
});
Vim.mapCommand('<Esc>', 'action', 'toCardMode', {}, {context: 'normal'});

// 服务器上所有没被删除的该用户的卡片id列表
let cids = [];
// 与上述卡片id列表对应的最大changelog id
let clid = 0;
// 未保存到服务器上的卡片（cid=0，version=0）
const drafts = [];
// 卡片ID到卡片的映射(只有服务器上存在的卡片)
const cardMap = {};

const getTime = (updateTime) => dayjs(updateTime).format('YYYY-MM-DD HH:mm');

class CardModel {
  constructor(card) {
    const {cid=0, version=0, content='', updateTime=new Date()} = card;
    this.cid = cid;
    this.version = version;
    this.content = signal(content);
    this.updateTime = signal(updateTime);
    this.serverContent = cid ? content : '';
    this.displayTime = computed(() => getTime(this.updateTime));
  
  }

  get isDraft() {
    return this.cid === 0 && this.version === 0;
  }

  get isDirty() {
    return this.isDraft || this.serverContent !== this.content.peek();
  }

  // 从UI更新卡片内容到模型中，导致该模型变脏，需要调用save()保存到服务器上
  update(card) {
    const { content, updateTime=new Date() } = card;
    this.content.value = content;
    this.updateTime.value = updateTime;
  }

  // 从服务器更新卡片内容到模型中，会刷新模型内容，让模型变干净
  async load() {
    await this.fetch(true);
  }

  // 从服务器更新卡片内容到模型中，如果flush为false，则只是将
  // 服务器中的内容保存下来，不会修改真正模型的内容，有可能导致模型变脏。
  async fetch(flush=false) {
    if (this.isDraft) {
      throw `Can't fetch for draft card`
    }
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/cards/${this.cid}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.code === 0) {
      this.serverUpdate(result.card, flush);
    }
  }

  // 将模型内容保存到服务器，如果是新建模型，在服务器新建卡片，
  // 如果是已有模型，更新服务器卡片的内容。
  async save() {
    if (!this.isDirty)
      return;
    const baseUrl = window.location.origin;
    const content = this.content.peek();
    if (this.cid) {
      const url = baseUrl + `/cards/${this.cid}`;
      const data = {
        content,
        last_version: this.version,
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
    const { content, version, updateTime } = card;
    this.version = version;
    this.serverContent = content;
    if (flush) {
      this.content.value = content;
      this.updateTime.value = updateTime;
    }
  }
}

const createCardModel = (card) => {
  const { cid, version } = card;
  let card1;
  if (cid === 0 || version === 0) {
    // 新草稿卡片
    card1 = new CardModel(card);
    cards.push(card1);
  } else {
    // 已有卡片模型，无法创建
    throw `card ${cid} exists`;
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