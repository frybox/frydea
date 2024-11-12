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
  constructor(card) {
    const {cid=0, version=0, content='', updateTime=new Date()} = card;
    this.cid = cid ? cid : 0;
    this.version = version ? version : 0;
    this.content = signal(content);
    this.updateTime = signal(updateTime);
    this.serverContent = cid ? content : '';
    this.displayCid = signal(cid)
    this.displayTime = computed(() => getTime(this.updateTime.value));
    this.conflict = false;
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
      cardManager.serverUpdate(result.clid, result.changes);
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
        cardManager.serverUpdate(result.clid, result.changes);
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
        cardManager.publishCard(this);
        cardManager.serverUpdate(result.clid, result.changes);
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
    // 服务器上所有没被删除的该用户的卡片id列表
    this.cids = new Set();
    // 与上述卡片id列表对应的最大changelog id
    this.clid = 0;
    // 未保存到服务器上的卡片（cid=0，version=0）
    this.drafts = [];
    // 卡片ID到卡片的映射(只有服务器上存在的卡片)
    this.cardMap = {};
  }

  publishCard(card) {
    const index = this.drafts.indexOf(card);
    if (index !== -1) {
      this.drafts.splice(index, 1);
    }
    if (!card.isDraft) {
      this.cardMap[card.cid] = card;
    }
  }

  async loadCard(cid) {
    if (cid <= 0) throw `Can't load card of id ${cid}`;
    const card = this.createCard({cid});
    await card.load();
    return card;
  }

  createCard(card) {
    const { cid } = card;
    let cardModel = new CardModel(card);
    if (cid === 0) {
      // 新草稿卡片
      this.drafts.push(cardModel);
    } else {
      // 已有卡片模型
      this.cardMap[cid] = cardModel;
    }
    return cardModel;
  }

  async getCard(cardId) {
    if (cardId > 0) {
      if (cardId in this.cardMap)
        return this.cardMap[cardId];
      const card = await this.loadCard(cardId);
      return card;
    } else {
      cardId = -cardId;
      if (cardId < this.drafts.length) {
        return this.drafts[cardId];
      }
    }
  }

  getCardId(card) {
    if (card.cid > 0) return card.cid;
    const cardId = this.drafts.indexOf(card);
    if (cardId >= 0) return -cardId;
    return null;
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
      if (version < 0) {
        this.cids.delete(cid);
      } else {
        this.cids.add(cid);
      }
      if (cid in this.cardMap) {
        changed.push(this.cardMap[cid]);
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