import { signal, computed } from "fryhcs";
import { Vim, CodeMirror } from "@replit/codemirror-vim";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

Vim.defineAction('toCardMode', (cm, args) => {
  // 将焦点从CM编辑器挪到EditorCard元素身上
  // TODO 当前这种直接假定EditorCard DOM树结构的办法不太完美
  const editorCardElement = cm.cm6.dom.parentElement.parentElement;
  if (editorCardElement.frycomponents && editorCardElement.frycomponents[0]) {
    editorCardElement.frycomponents[0].focus({mode: 'card'});
  }
});
Vim.mapCommand('<Esc>', 'action', 'toCardMode', {}, {context: 'normal'});

CodeMirror.commands.save = async (cm) => {
  const editorCardElement = cm.cm6.dom.parentElement.parentElement;
  if (editorCardElement.frycomponents && editorCardElement.frycomponents[0]) {
    await editorCardElement.frycomponents[0].save();
  }
}


//tz = 'America/New_York';
const tz = 'Asia/Shanghai';
const getTime = (updateTime) => dayjs(new Date(updateTime)).tz(tz).format('YYYY-MM-DD HH:mm');
const getDay = (time) => dayjs(time).tz(tz).format('YYYY-MM-DD');

class CardModel {
  constructor(card, manager) {
    const {cid=0, version=0, content='', updateTime=new Date()} = card;
    // cid是服务端id，draft的cid为0
    this.cid = cid ? cid : 0;
    this.version = version ? version : 0;
    this.content = signal(content);
    this.updateTime = signal(updateTime);
    this.serverContent = cid ? content : '';
    this.displayName = signal(cid)
    this.displayTime = computed(() => getTime(this.updateTime.value));
    this.conflict = false;
    // cardId是本地id，保证本地唯一，draft也有本地id
    this.cardId = manager.nextCardId;
    this.manager = manager;
    this.manager.cardMap.set(this.cardId, this);
    if (this.cid > 0) {
      this.manager.cid2cardMap.set(cid, this);
    }
  }

  get isDraft() {
    return this.cid === 0;
  }

  get isDirty() {
    return this.isDraft || this.serverContent !== this.content.peek();
  }

  rollback() {
    if (this.isDirty) {
      this.content.value = this.serverContent;
    }
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
    const url = `${baseUrl}/cards/${this.cid}?last_clid=${this.manager.clid}`;
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
        // manager.serverUpdate是异步方法，如下代码可能下载多张卡片，异步执行
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
    if (version < this.version) {
      throw `Invalid card ${cid} version: ${version} < ${this.version}`;
    }
    this.cid = cid;
    if (this.cid > 0) {
      this.manager.cid2cardMap.set(cid, this);
    }
    this.displayName.value = `${cid}`;
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
    // 服务器上所有没被删除的该用户的服务端卡片id(cid)到卡片创建时间的映射
    this.cid2timeMap = new Map();
    this.yearMap = new Map();
    // 与上述卡片id列表对应的最大changelog id
    this.clid = 0;
    // 客户端卡片ID(cardId)到卡片的映射
    this.cardMap = new Map();
    // 服务端卡片ID(cid)到卡片的映射（服务器上存在的卡片）
    this.cid2cardMap = new Map();
    this._nextCardId = 1;
    this.indexArea = null;
    this.editArea = null;
    this.previewArea = null;
  }

  get nextCardId() {
    return this._nextCardId ++;
  }

  init(cid2timeList, clid) {
    cid2timeList.forEach(([cid, time]) => {
      this.cid2timeMap.set(cid, new Date(time));
    })
    this.clid = clid;

    for (const cid of this.cid2timeMap.keys()) {
        const time = this.cid2timeMap.get(cid);
        const year = time.getFullYear();
        let dayMap;
        if (!this.yearMap.has(year)) {
            dayMap = new Map();
            this.yearMap.set(year, dayMap);
        } else {
            dayMap = this.yearMap.get(year);
        }
        const day = getDay(time);
        let cidList;
        if (!dayMap.has(day)) {
            cidList = [];
            dayMap.set(day, cidList);
        } else {
            cidList = dayMap.get(day);
        }
        cidList.push(cid);
    }
  }

  getIndex(cid) {
    const time = this.cid2timeMap.get(cid);
    if (time) {
      const year = time.getFullYear();
      const day = getDay(time);
      return {year, day};
    }
    return {};
  }

  // 如下三种情况调用该接口：
  // 1. 当从服务端拿到卡片数据时(有cid/version/content/updateTime完整数据)
  // 2. 只拿到服务端id(cid)，需要从服务端加载数据时(cid>0, version=0)
  // 3. 前端创建新草稿卡片时（什么都没有，cid=0, version=0）
  // 这三种情况下，都会在前端集中统一的状态中创建一个卡片模型对象，所有前端UI都使用该对象。
  // 当c.cid对应的卡片在cardManager中已经存在，不创建新卡片，直接返回已有卡片
  async createCard(c) {
    const {cid, version} = c;
    let card = this.cid2cardMap.get(cid);
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
    return this.cardMap.get(cardId);
  }

  sliceLeft(cid, count) {
    if (!this.cid2timeMap.has(cid)) {
      throw `Invalid cid ${cid}`;
    }
    const cids = Array.from(this.cid2timeMap.keys());
    cids.sort((a,b) => a-b);
    const end = cids.indexOf(cid) + 1;
    let start = end - count;
    start = start < 0 ? 0 : start;
    const prevCid = start === 0 ? 0 : cids[start-1];
    return [cids.slice(start, end), prevCid];
  }

  sliceRight(cid, count) {
    if (!this.cid2timeMap.has(cid)) {
      throw `Invalid cid ${cid}`;
    }
    const cids = Array.from(this.cid2timeMap.keys());
    cids.sort((a,b) => a-b);
    const start = cids.indexOf(cid);
    let end = start + count;
    end = end > cids.length ? cids.length : end;
    const nextCid = end === cids.length ? 0 : cids[end];
    return [cids.slice(start, end), nextCid];
  }

  sliceBetween(minCid, maxCid) {
    if (!this.cid2timeMap.has(minCid)) {
      throw `Invalid cid ${minCid}`;
    }
    if (!this.cid2timeMap.has(maxCid)) {
      throw `Invalid cid ${maxCid}`;
    }
    if (maxCid < minCid) {
      const cid = minCid;
      minCid = maxCid;
      maxCid = cid;
    }
    const cids = Array.from(this.cid2timeMap.keys());
    cids.sort((a,b) => a-b);
    const start = cids.indexOf(minCid);
    const end = cids.indexOf(maxCid) + 1;
    return cids.slice(start, end);
  }

  async sync() {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/cards/0?last_clid=${this.clid}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.code === 0) {
      await this.serverUpdate(result.clid, result.changes);
    }
  }

  async serverUpdate(clid, changes) {
    this.clid = clid;
    if (changes.length === 0) return;
    const cid2time = new Map();
    const cid2version = new Map();
    changes.forEach(([cid, time, version]) => {
      cid2time.set(cid, new Date(time));
      cid2version.set(cid, version);
    });
    let changed = [];
    let conflict = [];
    for (const cid of cid2version.keys()) {
      const version = cid2version.get(cid);
      const card = this.cid2cardMap.get(cid);
      if (version < 0) {
        if (this.cid2timeMap.has(cid)) {
          const time = this.cid2timeMap.get(cid);
          const year = time.getFullYear();
          const day = getDay(time);
          this.cid2timeMap.delete(cid);
          const dayMap = this.yearMap.get(year);
          if (dayMap && dayMap.has(day)) {
            const cidList = dayMap.get(day);
            const i = cidList.indexOf(cid);
            if (i >= 0) {
              cidList.splice(i, 1);
              if (this.indexArea) {
                this.indexArea.updateDay(day, cidList.length);
              }
            }
          }
        }
        if (card && card.isDirty) {
          card.conflict = true;
          conflict.push(card);
        } else if (card) {
          // TODO delete card
        }
      } else {
        if (!this.cid2timeMap.has(cid)) {
          const time = cid2time.get(cid);
          this.cid2timeMap.set(cid, time);
          const year = time.getFullYear();
          const day = getDay(time);
          let dayMap;
          if (!this.yearMap.has(year)) {
            dayMap = new Map();
            this.yearMap.set(year, dayMap);
          } else {
            dayMap = this.yearMap.get(year);
          }
          let cidList;
          if (!dayMap.has(day)) {
            cidList = [];
            dayMap.set(day, cidList);
          } else {
            cidList = dayMap.get(day);
          }
          cidList.push(cid);
          if (this.indexArea) {
            this.indexArea.updateDay(day, cidList.length);
          }
        }
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