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
    name: Mapped[Optional[str]]
    create_time: Mapped[datetime] = mapped_column(comment='card创建时间')
    noofday: Mapped[int] = mapped_column(comment='创建当天编号')
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    html: Mapped[str] = mapped_column(comment='渲染后的HTML内容')
    version: Mapped[int] = mapped_column(comment='版本号')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    user: Mapped['User'] = relationship(back_populates='cards')
    versions: Mapped[List['Version']] = relationship(back_populates='card')

    def __init__(self, user_id,):
        self.user_id = user_id
    def __init__(self, user_id, name, create_time, noofday, content, html, version, update_time, number=None):
        self.user_id = user_id
        self.name = name
        self.create_time = create_time
        self.noofday = noofday
        self.content = content
        self.html = html
        self.version = version
        self.update_time = update_time
        if number:
            self.number = number
        else:
            self.number = self.card_number()

    def __repr__(self):
        return f'<Card {self.name!r}>'

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
            'name': self.name,
            'create_time': self.create_time,
            'content': self.content,
            'html': self.html,
            'version': self.version,
            'update_time': self.update_time,
        }


class Version(db.Model):
    __tablename__ = 'versions'
    __table_args__ = (
        UniqueConstraint('card_id', 'version'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    card_id: Mapped[int] = mapped_column(ForeignKey('cards.id'))
    name: Mapped[Optional[str]]
    content: Mapped[str] = mapped_column(comment='Markdown内容')
    version: Mapped[int] = mapped_column(comment='版本号')
    update_time: Mapped[datetime] = mapped_column(comment='当前版本创建时间')

    card: Mapped['Card'] = relationship(back_populates='versions')

    def __init__(self, card_id, name, content, version, update_time):
        self.card_id = card_id
        self.name = name
        self.content = content
        self.version = version
        self.update_time = update_time

    def __repr__(self):
        return f'<History {self.name!r}>'