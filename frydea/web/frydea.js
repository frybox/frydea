import { signal, computed } from "fryhcs";
import { Vim } from "@replit/codemirror-vim";
import dayjs from "dayjs";

Vim.defineAction('toCardMode', (cm, args) => {
  // 将焦点从CM编辑器挪到EditorCard元素身上
  // TODO 当前这种直接假定EditorCard DOM树结构的办法不太完美
  cm.cm6.dom.parentElement.parentElement.focus();
});
Vim.mapCommand('<Esc>', 'action', 'toCardMode', {}, {context: 'normal'});

const getTime = (updateTime) => dayjs(new Date(updateTime)).format('YYYY-MM-DD HH:mm');

class CardModel {
  constructor(card, manager) {
    const {cid=0, version=0, content='', updateTime=new Date()} = card;
    // cid是服务端id，draft的cid为0
    this.cid = cid ? cid : 0;
    this.version = version ? version : 0;
    this.content = signal(content);
    this.updateTime = signal(updateTime);
    this.serverContent = cid ? content : '';
    this.displayCid = signal(cid)
    this.displayTime = computed(() => getTime(this.updateTime.value));
    this.conflict = false;
    // cardId是本地id，保证本地唯一，draft也有本地id
    this.cardId = manager.nextCardId;
    this.manager = manager;
    this.manager.cardMap[this.cardId] = this;
    if (this.cid > 0) {
      this.manager.cid2cardMap[cid] = this;
    }
  }

  get isDraft() {
    return this.cid === 0;
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
    const url = `${baseUrl}/cards/${this.cid}?last_clid=${cardManager.clid}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.code === 0) {
      this.serverUpdate(result.card, flush);
      this.manager.serverUpdate(result.clid, result.changes);
    }
  }

  // 将模型内容保存到服务器，如果是新建模型，在服务器新建卡片，
  // 如果是已有模型，更新服务器卡片的内容。
  async save() {
    if (!this.isDirty)
      return;
    if (this.conflict) {
      throw "Can't save conflicting card"
    }
    const baseUrl = window.location.origin;
    const content = this.content.peek();
    if (this.cid) {
      const url = baseUrl + `/cards/${this.cid}`;
      const data = {
        content,
        last_version: this.version,
        last_clid: cardManager.clid,
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
        this.manager.serverUpdate(result.clid, result.changes);
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
        body: JSON.stringify({content, last_clid: cardManager.clid}),
      });
      const result = await response.json();
      if (result.code === 0) {
        console.log('server created');
        this.serverUpdate(result.card);
        this.manager.serverUpdate(result.clid, result.changes);
      } else {
        console.log(result.msg);
      }
    }
  }

  // 内部方法，load/fetch/save时，根据服务器响应修改模型内容
  serverUpdate(card, flush=false) {
    const { cid, content, version, updateTime } = card;
    if (version !== this.version + 1) {
      throw `Invalid card ${cid} version: ${version} != ${this.version} + 1`;
    }
    this.cid = cid;
    if (this.cid > 0) {
      this.manager.cid2cardMap[cid] = this;
    }
    this.displayCid.value = cid;
    this.version = version;
    this.serverContent = content;
    if (flush) {
      this.content.value = content;
      this.updateTime.value = updateTime;
    }
  }

  async merge() {
    this.conflict = false;
    await this.save();
  }
}

class CardManager {
  constructor() {
    // 服务器上所有没被删除的该用户的服务端卡片id(cid)列表
    this.cids = new Set();
    // 与上述卡片id列表对应的最大changelog id
    this.clid = 0;
    // 客户端卡片ID(cardId)到卡片的映射
    this.cardMap = {};
    // 服务端卡片ID(cid)到卡片的映射（服务器上存在的卡片）
    this.cid2cardMap = {};
    this._nextCardId = 1;
  }

  get nextCardId() {
    return this._nextCardId ++;
  }

  // 如下三种情况调用该接口：
  // 1. 当从服务端拿到卡片数据时(有cid/version/content/updateTime完整数据)
  // 2. 只拿到服务端id(cid)，需要从服务端加载数据时(cid>0, version=0)
  // 3. 前端创建新草稿卡片时（什么都没有，cid=0, version=0）
  // 这三种情况下，都会在前端集中统一的状态中创建一个卡片模型对象，所有前端UI都使用该对象。
  // 当c.cid对应的卡片在cardManager中已经存在，不创建新卡片，直接返回已有卡片
  async createCard(c) {
    const {cid, version} = c;
    let card = this.cid2cardMap[cid];
    if (card) return card;
    card = new CardModel(c, this);
    if (cid > 0 && !version) {
      // 只有服务端ID，但没有内容时，将该卡片从服务端加载过来
      await card.load();
    }
    return card;
  }

  // 当已经在前端集中统一的状态中创建了卡片模型对象，通过卡片模型id(cardId)
  // 获取出来。
  getCard(cardId) {
    return this.cardMap[cardId];
  }

  sliceLeft(cid, count) {
    if (!this.cids.has(cid)) {
      throw `Invalid cid ${cid}`;
    }
    const cids = Array.from(this.cids);
    cids.sort((a,b) => a-b);
    const end = cids.indexOf(cid) + 1;
    let start = end - count;
    start = start < 0 ? 0 : start;
    const prevCid = start === 0 ? 0 : cids[start-1];
    return [cids.slice(start, end), prevCid];
  }

  sliceRight(cid, count) {
    if (!this.cids.has(cid)) {
      throw `Invalid cid ${cid}`;
    }
    const cids = Array.from(this.cids);
    cids.sort((a,b) => a-b);
    const start = cids.indexOf(cid);
    let end = start + count;
    end = end > cids.length ? cids.length : end;
    const nextCid = end === cids.length ? 0 : cids[end];
    return [cids.slice(start, end), nextCid];
  }

  async serverUpdate(clid, changes) {
    this.clid = clid;
    const cids = Object.keys(changes)
    if (cids.length === 0) {
      return;
    }
    let changed = [];
    let conflict = [];
    for (const cid of cids) {
      const version = changes[cid];
      const card = this.cid2cardMap[cid];
      if (version < 0) {
        this.cids.delete(cid);
        if (card && card.isDirty) {
          card.conflict = true;
          conflict.push(card);
        } else if (card) {
          // TODO delete card
        }
      } else {
        this.cids.add(cid);
        if (card && card.version < version) {
          changed.push(card);
        }
      }
    }

    for (const card of changed) {
      if (!card.isDirty) {
        await card.load();
      } else {
        await card.fetch();
        if (card.isDirty) {
          card.conflict = true;
          conflict.push(card);
        }
      }
    }

    if (conflict.length > 0) {
      console.log(`${conflict.length} cards conflict, please resolve first.`)
    }
  }
}

const cardManager = new CardManager();

export {
  cardManager,
}