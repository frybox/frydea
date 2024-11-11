from typing import Optional, List
from datetime import datetime
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from frydea.database import db

class User(db.Model):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)

    cards: Mapped[List['Card']] = relationship(back_populates='user')

    def __init__(self, name=None, email=None):
        self.name = name
        self.email = email

    def __repr__(self):
        return f'<User {self.name!r}>'


class Card(db.Model):
    """
    版本号从1开始，第一个版本的update_time就是当前卡片的创建时间
    删除也会生成一个版本号，最后的版本号，比上一个版本号加一，然后取负值
    """
    __tablename__ = 'cards'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    version: Mapped[int] = mapped_column(comment='版本号')
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    user: Mapped['User'] = relationship(back_populates='cards')
    changelogs: Mapped[List['ChangeLog']] = relationship(back_populates='card')

    def __init__(self, user_id=0, version=0, content='', update_time=None):
        self.user_id = user_id
        self.version = version
        self.content = content
        self.update_time = update_time if update_time else datetime.now()

    def __repr__(self):
        return f'<Card {self.number!r}>'

    def todict(self):
        return {
            'cid': self.id,
            'version': self.version,
            'content': self.content,
            'updateTime': self.update_time.isoformat() if self.update_time else '',
        }


class ChangeLog(db.Model):
    __tablename__ = 'changelog'
    __table_args__ = (
        UniqueConstraint('card_id', 'version'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    card_id: Mapped[int] = mapped_column(ForeignKey('cards.id'))
    version: Mapped[int] = mapped_column(comment='版本号')
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    card: Mapped['Card'] = relationship(back_populates='changelogs')

    def __init__(self, user_id, card_id, version, content, update_time):
        self.user_id = user_id
        self.card_id = card_id
        self.version = version
        self.content = content
        self.update_time = update_time

    def __repr__(self):
        return f'<Version {self.card_id!r}@{self.version}>'


class ChangeLog(db.Model):
    """
    只增表
    """
    __tablename__ = 'changelog'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    card_id: Mapped[int] = mapped_column(ForeignKey('cards.id'))
    version: Mapped[int] = mapped_column(comment='版本号')
