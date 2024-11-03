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
    __tablename__ = 'cards'
    __table_args__ = (
        UniqueConstraint('user_id', 'number'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    number: Mapped[str]
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    create_time: Mapped[datetime] = mapped_column(comment='card创建时间')
    noofday: Mapped[int] = mapped_column(comment='创建当天编号')
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    version: Mapped[int] = mapped_column(comment='版本号')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    user: Mapped['User'] = relationship(back_populates='cards')
    versions: Mapped[List['Version']] = relationship(back_populates='card')

    def __init__(self):
        self.user_id = 0
        self.number = ''
        self.content = ''

    def __repr__(self):
        return f'<Card {self.number!r}>'

    def card_number(self):
        t = self.create_time
        no = self.noofday
        if t and no:
            return f'{t.year:04}-{t.month:02}-{t.day:02}-{no:04}'
        else:
            return ''
    
    def todict(self):
        return {
            'id': self.id,
            'number': self.number,
            'user_id': self.user_id,
            'create_time': self.create_time.isoformat() if self.create_time else '',
            'content': self.content,
            'version': self.version,
            'update_time': self.update_time.isoformat() if self.update_time else '',
        }


class Version(db.Model):
    __tablename__ = 'versions'
    __table_args__ = (
        UniqueConstraint('card_id', 'version'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    card_id: Mapped[int] = mapped_column(ForeignKey('cards.id'))
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    version: Mapped[int] = mapped_column(comment='版本号')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    card: Mapped['Card'] = relationship(back_populates='versions')

    def __init__(self, card_id, content, version, update_time):
        self.card_id = card_id
        self.content = content
        self.version = version
        self.update_time = update_time

    def __repr__(self):
        return f'<Version {self.card_id!r}@{self.version}>'